const { Server } = require('socket.io');
const { createServer } = require('http');
const Client = require('socket.io-client');
const { dbManager } = require('../database');
const { User, Room, Message } = require('../models');
const { jwtUtils } = require('../utils/jwt');
const SocketHandler = require('../socket/socketHandler');

describe('Socket Handler', () => {
    let httpServer;
    let io;
    let socketHandler;
    let clientSocket;
    let testUser;
    let testRoom;
    let authToken;

    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear database
        await dbManager.getDatabase().clear();

        // Create test user and room
        testUser = await User.create({
            username: 'testuser',
            password: 'password123'
        });

        testRoom = await Room.create({
            name: 'Test Room',
            createdBy: testUser.id
        });

        authToken = jwtUtils.generateToken({
            userId: testUser.id,
            username: testUser.username
        });

        // Create HTTP server and Socket.io instance
        httpServer = createServer();
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        // Initialize socket handler
        socketHandler = new SocketHandler(io);

        // Start server
        await new Promise((resolve) => {
            httpServer.listen(() => {
                const port = httpServer.address().port;
                
                // Create client socket
                clientSocket = new Client(`http://localhost:${port}`, {
                    auth: {
                        token: authToken
                    }
                });

                clientSocket.on('connect', resolve);
            });
        });
    });

    afterEach(async () => {
        if (clientSocket) {
            clientSocket.close();
        }
        if (httpServer) {
            httpServer.close();
        }
        if (io) {
            io.close();
        }
    });

    describe('Authentication', () => {
        test('should authenticate valid token', (done) => {
            clientSocket.on('connected', (data) => {
                expect(data.userId).toBe(testUser.id);
                expect(data.username).toBe(testUser.username);
                expect(data.message).toBe('Successfully connected to chat server');
                done();
            });
        });

        test('should reject connection without token', (done) => {
            const invalidClient = new Client(`http://localhost:${httpServer.address().port}`);
            
            invalidClient.on('connect_error', (error) => {
                expect(error.message).toContain('Authentication');
                invalidClient.close();
                done();
            });
        });

        test('should reject connection with invalid token', (done) => {
            const invalidClient = new Client(`http://localhost:${httpServer.address().port}`, {
                auth: {
                    token: 'invalid.token.here'
                }
            });
            
            invalidClient.on('connect_error', (error) => {
                expect(error.message).toContain('Authentication');
                invalidClient.close();
                done();
            });
        });
    });

    describe('Room Management', () => {
        beforeEach((done) => {
            clientSocket.on('connected', () => done());
        });

        test('should join room successfully', (done) => {
            clientSocket.emit('join-room', { roomId: testRoom.id });
            
            clientSocket.on('room-joined', (data) => {
                expect(data.roomId).toBe(testRoom.id);
                expect(data.roomName).toBe(testRoom.name);
                expect(data.participants).toBeDefined();
                expect(data.message).toBe('Successfully joined room');
                done();
            });
        });

        test('should reject joining non-existent room', (done) => {
            clientSocket.emit('join-room', { roomId: 'non-existent-id' });
            
            clientSocket.on('error', (data) => {
                expect(data.message).toBe('Room not found');
                done();
            });
        });

        test('should reject joining without room ID', (done) => {
            clientSocket.emit('join-room', {});
            
            clientSocket.on('error', (data) => {
                expect(data.message).toBe('Room ID is required');
                done();
            });
        });

        test('should leave room successfully', (done) => {
            // First join the room
            clientSocket.emit('join-room', { roomId: testRoom.id });
            
            clientSocket.on('room-joined', () => {
                // Then leave the room
                clientSocket.emit('leave-room', { roomId: testRoom.id });
            });
            
            clientSocket.on('room-left', (data) => {
                expect(data.roomId).toBe(testRoom.id);
                expect(data.message).toBe('Successfully left room');
                done();
            });
        });

        test('should broadcast user join to other participants', (done) => {
            // Create second client
            const secondClient = new Client(`http://localhost:${httpServer.address().port}`, {
                auth: { token: authToken }
            });

            let joinCount = 0;
            const checkJoinComplete = () => {
                joinCount++;
                if (joinCount === 2) {
                    // First client joins room
                    clientSocket.emit('join-room', { roomId: testRoom.id });
                }
            };

            clientSocket.on('connected', checkJoinComplete);
            secondClient.on('connected', checkJoinComplete);

            // Second client should receive join notification
            secondClient.on('user-joined', (data) => {
                expect(data.userId).toBe(testUser.id);
                expect(data.username).toBe(testUser.username);
                secondClient.close();
                done();
            });

            // Second client joins room first
            secondClient.on('connected', () => {
                secondClient.emit('join-room', { roomId: testRoom.id });
            });
        });
    });

    describe('Messaging', () => {
        beforeEach((done) => {
            clientSocket.on('connected', () => {
                // Join room before testing messaging
                clientSocket.emit('join-room', { roomId: testRoom.id });
                clientSocket.on('room-joined', () => done());
            });
        });

        test('should send message successfully', (done) => {
            const messageContent = 'Hello, world!';
            
            clientSocket.emit('send-message', {
                roomId: testRoom.id,
                content: messageContent
            });
            
            clientSocket.on('new-message', (data) => {
                expect(data.message.message).toBe(messageContent);
                expect(data.message.sender).toBe(testUser.username);
                expect(data.message.type).toBe('message');
                done();
            });
        });

        test('should reject message without content', (done) => {
            clientSocket.emit('send-message', {
                roomId: testRoom.id,
                content: ''
            });
            
            clientSocket.on('error', (data) => {
                expect(data.message).toBe('Room ID and message content are required');
                done();
            });
        });

        test('should reject message without room ID', (done) => {
            clientSocket.emit('send-message', {
                content: 'Hello, world!'
            });
            
            clientSocket.on('error', (data) => {
                expect(data.message).toBe('Room ID and message content are required');
                done();
            });
        });

        test('should reject message when not in room', (done) => {
            // Leave room first
            clientSocket.emit('leave-room', { roomId: testRoom.id });
            
            clientSocket.on('room-left', () => {
                clientSocket.emit('send-message', {
                    roomId: testRoom.id,
                    content: 'Hello, world!'
                });
            });
            
            clientSocket.on('error', (data) => {
                expect(data.message).toBe('You must be in the room to send messages');
                done();
            });
        });
    });

    describe('Participant Management', () => {
        beforeEach((done) => {
            clientSocket.on('connected', () => {
                clientSocket.emit('join-room', { roomId: testRoom.id });
                clientSocket.on('room-joined', () => done());
            });
        });

        test('should get room participants', (done) => {
            clientSocket.emit('get-room-participants', { roomId: testRoom.id });
            
            clientSocket.on('room-participants', (data) => {
                expect(data.roomId).toBe(testRoom.id);
                expect(data.participants).toHaveLength(1);
                expect(data.participants[0].userId).toBe(testUser.id);
                expect(data.participants[0].username).toBe(testUser.username);
                expect(data.participants[0].isOnline).toBe(true);
                done();
            });
        });

        test('should update participants when user joins', (done) => {
            clientSocket.on('participants-update', (data) => {
                expect(data.roomId).toBe(testRoom.id);
                expect(data.participants).toHaveLength(1);
                done();
            });

            // Trigger by joining room (already joined in beforeEach, so this tests the update)
            clientSocket.emit('get-room-participants', { roomId: testRoom.id });
        });
    });

    describe('Disconnection', () => {
        test('should handle disconnection gracefully', (done) => {
            clientSocket.on('connected', () => {
                // Join room
                clientSocket.emit('join-room', { roomId: testRoom.id });
                
                clientSocket.on('room-joined', () => {
                    // Disconnect
                    clientSocket.disconnect();
                    
                    // Verify user is removed from connected users
                    setTimeout(() => {
                        const stats = socketHandler.getStats();
                        expect(stats.connectedUsers).toBe(0);
                        done();
                    }, 100);
                });
            });
        });
    });

    describe('Statistics', () => {
        test('should provide server statistics', (done) => {
            clientSocket.on('connected', () => {
                const stats = socketHandler.getStats();
                expect(stats).toHaveProperty('connectedUsers');
                expect(stats).toHaveProperty('activeRooms');
                expect(stats).toHaveProperty('totalConnections');
                expect(stats.connectedUsers).toBe(1);
                done();
            });
        });
    });

    describe('Utility Methods', () => {
        beforeEach((done) => {
            clientSocket.on('connected', () => done());
        });

        test('should broadcast to all users', (done) => {
            socketHandler.broadcastToAll('test-broadcast', { message: 'Hello everyone!' });
            
            clientSocket.on('test-broadcast', (data) => {
                expect(data.message).toBe('Hello everyone!');
                done();
            });
        });

        test('should send message to specific user', (done) => {
            socketHandler.sendToUser(testUser.id, 'test-direct', { message: 'Hello user!' });
            
            clientSocket.on('test-direct', (data) => {
                expect(data.message).toBe('Hello user!');
                done();
            });
        });
    });
});