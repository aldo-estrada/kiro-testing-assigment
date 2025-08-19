const { jwtUtils } = require('../utils/jwt');
const { User, Room, Message } = require('../models');

/**
 * Socket.io event handler with authentication and room management
 */
class SocketHandler {
    constructor(io) {
        this.io = io;
        this.connectedUsers = new Map(); // userId -> { socketId, username, currentRoom }
        this.roomParticipants = new Map(); // roomId -> Set of userIds
        
        this.setupMiddleware();
        this.setupEventHandlers();
    }

    /**
     * Set up Socket.io middleware for authentication
     */
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                // Extract token from handshake auth or query
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                
                if (!token) {
                    return next(new Error('Authentication token required'));
                }

                // Verify JWT token
                const decoded = jwtUtils.verifyToken(token);
                
                // Get user from database
                const user = await User.findById(decoded.userId);
                if (!user) {
                    return next(new Error('User not found'));
                }

                // Attach user info to socket
                socket.userId = user.id;
                socket.username = user.username;
                socket.token = token;

                console.log(`User ${user.username} (${user.id}) connected via Socket.io`);
                next();

            } catch (error) {
                console.error('Socket authentication error:', error.message);
                next(new Error('Authentication failed'));
            }
        });
    }

    /**
     * Set up Socket.io event handlers
     */
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });
    }

    /**
     * Handle new socket connection
     */
    handleConnection(socket) {
        const userId = socket.userId;
        const username = socket.username;

        // Store connected user
        this.connectedUsers.set(userId, {
            socketId: socket.id,
            username: username,
            currentRoom: null
        });

        // Update user's last active timestamp
        User.findById(userId).then(user => {
            if (user) {
                user.updateLastActive();
            }
        });

        // Set up event listeners for this socket
        this.setupSocketEvents(socket);

        // Send connection confirmation
        socket.emit('connected', {
            userId: userId,
            username: username,
            message: 'Successfully connected to chat server'
        });

        console.log(`Socket connected: ${username} (${socket.id})`);
    }

    /**
     * Set up event listeners for a socket
     */
    setupSocketEvents(socket) {
        // Room management events
        socket.on('join-room', (data) => this.handleJoinRoom(socket, data));
        socket.on('leave-room', (data) => this.handleLeaveRoom(socket, data));
        
        // Messaging events
        socket.on('send-message', (data) => this.handleSendMessage(socket, data));
        
        // Utility events
        socket.on('get-room-participants', (data) => this.handleGetRoomParticipants(socket, data));
        
        // Disconnect event
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    /**
     * Handle user joining a room
     */
    async handleJoinRoom(socket, data) {
        try {
            const { roomId } = data;
            const userId = socket.userId;
            const username = socket.username;

            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }

            // Verify room exists and is active
            const room = await Room.findById(roomId);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }

            if (!room.isActive) {
                socket.emit('error', { message: 'Room is not active' });
                return;
            }

            // Leave current room if in one
            const userInfo = this.connectedUsers.get(userId);
            if (userInfo && userInfo.currentRoom) {
                await this.leaveRoom(socket, userInfo.currentRoom);
            }

            // Join the room
            socket.join(roomId);
            
            // Update user's current room
            if (userInfo) {
                userInfo.currentRoom = roomId;
            }

            // Add user to room participants
            if (!this.roomParticipants.has(roomId)) {
                this.roomParticipants.set(roomId, new Set());
            }
            this.roomParticipants.get(roomId).add(userId);

            // Add user to room's participant list in database
            await room.addParticipant(userId);

            // Create join notification message
            const joinMessage = await Message.createUserJoinedNotification(roomId, username);

            // Broadcast join notification to room (except sender)
            socket.to(roomId).emit('user-joined', {
                userId: userId,
                username: username,
                message: joinMessage.toClient()
            });

            // Send updated participant list to all room members
            const participants = await this.getRoomParticipantsList(roomId);
            this.io.to(roomId).emit('participants-update', {
                roomId: roomId,
                participants: participants
            });

            // Send success response to user
            socket.emit('room-joined', {
                roomId: roomId,
                roomName: room.name,
                participants: participants,
                message: 'Successfully joined room'
            });

            console.log(`${username} joined room: ${room.name} (${roomId})`);

        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    }

    /**
     * Handle user leaving a room
     */
    async handleLeaveRoom(socket, data) {
        try {
            const { roomId } = data;
            await this.leaveRoom(socket, roomId);
        } catch (error) {
            console.error('Leave room error:', error);
            socket.emit('error', { message: 'Failed to leave room' });
        }
    }

    /**
     * Internal method to handle leaving a room
     */
    async leaveRoom(socket, roomId) {
        const userId = socket.userId;
        const username = socket.username;

        if (!roomId) {
            return;
        }

        // Leave the socket room
        socket.leave(roomId);

        // Update user's current room
        const userInfo = this.connectedUsers.get(userId);
        if (userInfo && userInfo.currentRoom === roomId) {
            userInfo.currentRoom = null;
        }

        // Remove user from room participants
        if (this.roomParticipants.has(roomId)) {
            this.roomParticipants.get(roomId).delete(userId);
            
            // Clean up empty room participant sets
            if (this.roomParticipants.get(roomId).size === 0) {
                this.roomParticipants.delete(roomId);
            }
        }

        // Remove user from room's participant list in database
        const room = await Room.findById(roomId);
        if (room) {
            await room.removeParticipant(userId);

            // Create leave notification message
            const leaveMessage = await Message.createUserLeftNotification(roomId, username);

            // Broadcast leave notification to remaining room members
            socket.to(roomId).emit('user-left', {
                userId: userId,
                username: username,
                message: leaveMessage.toClient()
            });

            // Send updated participant list to remaining room members
            const participants = await this.getRoomParticipantsList(roomId);
            socket.to(roomId).emit('participants-update', {
                roomId: roomId,
                participants: participants
            });
        }

        // Send confirmation to user
        socket.emit('room-left', {
            roomId: roomId,
            message: 'Successfully left room'
        });

        console.log(`${username} left room: ${roomId}`);
    }

    /**
     * Handle sending a message
     */
    async handleSendMessage(socket, data) {
        try {
            const { roomId, content } = data;
            const userId = socket.userId;
            const username = socket.username;

            if (!roomId || !content) {
                socket.emit('error', { message: 'Room ID and message content are required' });
                return;
            }

            // Verify user is in the room
            const userInfo = this.connectedUsers.get(userId);
            if (!userInfo || userInfo.currentRoom !== roomId) {
                socket.emit('error', { message: 'You must be in the room to send messages' });
                return;
            }

            // Verify room exists and is active
            const room = await Room.findById(roomId);
            if (!room || !room.isActive) {
                socket.emit('error', { message: 'Room not found or inactive' });
                return;
            }

            // Create message in database
            const message = await Message.create({
                roomId: roomId,
                senderId: userId,
                senderUsername: username,
                content: content.trim()
            });

            // Broadcast message to all room participants
            this.io.to(roomId).emit('new-message', {
                message: message.toClient()
            });

            console.log(`Message sent in room ${roomId} by ${username}: ${content.substring(0, 50)}...`);

        } catch (error) {
            console.error('Send message error:', error);
            
            if (error.code === 'VALIDATION_ERROR') {
                socket.emit('error', { 
                    message: 'Message validation failed',
                    details: error.details 
                });
            } else {
                socket.emit('error', { message: 'Failed to send message' });
            }
        }
    }

    /**
     * Handle getting room participants
     */
    async handleGetRoomParticipants(socket, data) {
        try {
            const { roomId } = data;

            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }

            const participants = await this.getRoomParticipantsList(roomId);
            
            socket.emit('room-participants', {
                roomId: roomId,
                participants: participants
            });

        } catch (error) {
            console.error('Get room participants error:', error);
            socket.emit('error', { message: 'Failed to get room participants' });
        }
    }

    /**
     * Handle socket disconnection
     */
    async handleDisconnect(socket) {
        const userId = socket.userId;
        const username = socket.username;

        console.log(`Socket disconnected: ${username} (${socket.id})`);

        // Get user info
        const userInfo = this.connectedUsers.get(userId);
        if (userInfo && userInfo.currentRoom) {
            // Leave current room
            await this.leaveRoom(socket, userInfo.currentRoom);
        }

        // Remove user from connected users
        this.connectedUsers.delete(userId);
    }

    /**
     * Get list of participants in a room
     */
    async getRoomParticipantsList(roomId) {
        const participantIds = this.roomParticipants.get(roomId) || new Set();
        const participants = [];

        for (const userId of participantIds) {
            const userInfo = this.connectedUsers.get(userId);
            if (userInfo) {
                participants.push({
                    userId: userId,
                    username: userInfo.username,
                    isOnline: true
                });
            }
        }

        return participants;
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            connectedUsers: this.connectedUsers.size,
            activeRooms: this.roomParticipants.size,
            totalConnections: Array.from(this.connectedUsers.values()).length
        };
    }

    /**
     * Broadcast message to all connected users
     */
    broadcastToAll(event, data) {
        this.io.emit(event, data);
    }

    /**
     * Send message to specific user
     */
    sendToUser(userId, event, data) {
        const userInfo = this.connectedUsers.get(userId);
        if (userInfo) {
            this.io.to(userInfo.socketId).emit(event, data);
        }
    }
}

module.exports = SocketHandler;