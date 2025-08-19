const Message = require('../models/Message');
const User = require('../models/User');
const Room = require('../models/Room');
const { dbManager } = require('../database');

describe('Message Model', () => {
    let testUser;
    let testRoom;

    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear database before each test
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
    });

    describe('Validation', () => {
        describe('Content validation', () => {
            test('should accept valid content', () => {
                const validContent = ['Hello world', 'Test message', 'A', 'x'.repeat(1000)];
                
                validContent.forEach(content => {
                    const errors = Message.validateContent(content);
                    expect(errors).toHaveLength(0);
                });
            });

            test('should reject invalid content', () => {
                const testCases = [
                    { content: '', expectedError: 'Message content cannot be empty' },
                    { content: '   ', expectedError: 'Message content cannot be empty' },
                    { content: null, expectedError: 'Message content is required' },
                    { content: undefined, expectedError: 'Message content is required' },
                    { content: 123, expectedError: 'Message content must be a string' },
                    { content: 'x'.repeat(1001), expectedError: 'Message content must be no more than 1000 characters long' }
                ];

                testCases.forEach(({ content, expectedError }) => {
                    const errors = Message.validateContent(content);
                    expect(errors.length).toBeGreaterThan(0);
                    expect(errors.some(error => error.includes(expectedError.split(' ')[0]))).toBe(true);
                });
            });
        });

        describe('Message type validation', () => {
            test('should accept valid message types', () => {
                const validTypes = ['message', 'notification'];
                
                validTypes.forEach(type => {
                    const errors = Message.validateMessageType(type);
                    expect(errors).toHaveLength(0);
                });
            });

            test('should reject invalid message types', () => {
                const invalidTypes = ['invalid', 'system', 'error', 123];
                
                invalidTypes.forEach(type => {
                    const errors = Message.validateMessageType(type);
                    expect(errors.length).toBeGreaterThan(0);
                });
            });

            test('should allow undefined message type', () => {
                const errors = Message.validateMessageType(undefined);
                expect(errors).toHaveLength(0);
            });
        });

        describe('Full validation', () => {
            test('should validate complete message data', () => {
                const validData = {
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: 'Hello world',
                    messageType: 'message'
                };

                const errors = Message.validate(validData);
                expect(errors).toHaveLength(0);
            });

            test('should collect all validation errors', () => {
                const invalidData = {
                    roomId: null,
                    senderId: '',
                    senderUsername: 123,
                    content: '',
                    messageType: 'invalid'
                };

                const errors = Message.validate(invalidData);
                expect(errors.length).toBeGreaterThan(4);
            });

            test('should validate required fields', () => {
                const incompleteData = {
                    content: 'Hello world'
                };

                const errors = Message.validate(incompleteData);
                expect(errors.some(error => error.includes('Room ID is required'))).toBe(true);
                expect(errors.some(error => error.includes('Sender ID is required'))).toBe(true);
                expect(errors.some(error => error.includes('Sender username is required'))).toBe(true);
            });
        });
    });

    describe('Database operations', () => {
        describe('Message creation', () => {
            test('should create a valid message', async () => {
                const messageData = {
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: 'Hello world'
                };

                const message = await Message.create(messageData);

                expect(message).toBeInstanceOf(Message);
                expect(message.id).toBeDefined();
                expect(message.roomId).toBe(testRoom.id);
                expect(message.senderId).toBe(testUser.id);
                expect(message.senderUsername).toBe(testUser.username);
                expect(message.content).toBe('Hello world');
                expect(message.timestamp).toBeInstanceOf(Date);
                expect(message.messageType).toBe('message');
            });

            test('should create notification message', async () => {
                const messageData = {
                    roomId: testRoom.id,
                    senderId: 'system',
                    senderUsername: 'System',
                    content: 'User joined the room',
                    messageType: 'notification'
                };

                const message = await Message.create(messageData);
                expect(message.messageType).toBe('notification');
            });

            test('should trim message content', async () => {
                const messageData = {
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: '  Hello world  '
                };

                const message = await Message.create(messageData);
                expect(message.content).toBe('Hello world');
            });

            test('should reject invalid message data', async () => {
                const invalidData = {
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: ''
                };

                await expect(Message.create(invalidData)).rejects.toThrow('Validation failed');
            });
        });

        describe('Message retrieval', () => {
            let testMessages;

            beforeEach(async () => {
                // Create test messages
                testMessages = [];
                for (let i = 0; i < 5; i++) {
                    const message = await Message.create({
                        roomId: testRoom.id,
                        senderId: testUser.id,
                        senderUsername: testUser.username,
                        content: `Test message ${i + 1}`
                    });
                    testMessages.push(message);
                    
                    // Small delay to ensure different timestamps
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            });

            test('should find message by ID', async () => {
                const found = await Message.findById(testMessages[0].id);
                expect(found).toBeInstanceOf(Message);
                expect(found.content).toBe('Test message 1');
            });

            test('should return null for non-existent message', async () => {
                const notFound = await Message.findById('non-existent-id');
                expect(notFound).toBeNull();
            });

            test('should find messages by room', async () => {
                const roomMessages = await Message.findByRoom(testRoom.id);
                expect(roomMessages).toHaveLength(5);
                expect(roomMessages.every(msg => msg instanceof Message)).toBe(true);
                expect(roomMessages.every(msg => msg.roomId === testRoom.id)).toBe(true);
            });

            test('should find messages by room with pagination', async () => {
                const firstPage = await Message.findByRoom(testRoom.id, { limit: 2, offset: 0 });
                expect(firstPage).toHaveLength(2);

                const secondPage = await Message.findByRoom(testRoom.id, { limit: 2, offset: 2 });
                expect(secondPage).toHaveLength(2);

                // Should be different messages
                expect(firstPage[0].id).not.toBe(secondPage[0].id);
            });

            test('should find messages by room with sort order', async () => {
                const descMessages = await Message.findByRoom(testRoom.id, { sortOrder: 'desc' });
                const ascMessages = await Message.findByRoom(testRoom.id, { sortOrder: 'asc' });

                expect(descMessages[0].content).toBe('Test message 5'); // Newest first
                expect(ascMessages[0].content).toBe('Test message 1'); // Oldest first
            });

            test('should find messages by sender', async () => {
                const senderMessages = await Message.findBySender(testUser.id);
                expect(senderMessages).toHaveLength(5);
                expect(senderMessages.every(msg => msg.senderId === testUser.id)).toBe(true);
            });

            test('should find messages by type', async () => {
                // Create a notification message
                await Message.create({
                    roomId: testRoom.id,
                    senderId: 'system',
                    senderUsername: 'System',
                    content: 'System notification',
                    messageType: 'notification'
                });

                const notifications = await Message.findByType('notification');
                expect(notifications).toHaveLength(1);
                expect(notifications[0].messageType).toBe('notification');

                const regularMessages = await Message.findByType('message');
                expect(regularMessages).toHaveLength(5);
            });

            test('should find recent messages', async () => {
                const recentMessages = await Message.findRecent({ limit: 3 });
                expect(recentMessages).toHaveLength(3);
                
                // Should be sorted by newest first
                expect(recentMessages[0].content).toBe('Test message 5');
            });

            test('should count messages by room', async () => {
                const count = await Message.countByRoom(testRoom.id);
                expect(count).toBe(5);
            });
        });

        describe('Message deletion', () => {
            let testMessage;

            beforeEach(async () => {
                testMessage = await Message.create({
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: 'Test message'
                });
            });

            test('should delete single message', async () => {
                const deleted = await testMessage.delete();
                expect(deleted).toBeTruthy();

                const found = await Message.findById(testMessage.id);
                expect(found).toBeNull();
            });

            test('should delete messages by room', async () => {
                // Create additional messages
                await Message.create({
                    roomId: testRoom.id,
                    senderId: testUser.id,
                    senderUsername: testUser.username,
                    content: 'Another message'
                });

                const deletedCount = await Message.deleteByRoom(testRoom.id);
                expect(deletedCount).toBe(2);

                const remainingMessages = await Message.findByRoom(testRoom.id);
                expect(remainingMessages).toHaveLength(0);
            });
        });
    });

    describe('Static utility methods', () => {
        test('should create notification message', async () => {
            const notification = await Message.createNotification(
                testRoom.id,
                'Test notification'
            );

            expect(notification.messageType).toBe('notification');
            expect(notification.content).toBe('Test notification');
            expect(notification.senderId).toBe('system');
            expect(notification.senderUsername).toBe('System');
        });

        test('should create user joined notification', async () => {
            const notification = await Message.createUserJoinedNotification(
                testRoom.id,
                testUser.username
            );

            expect(notification.messageType).toBe('notification');
            expect(notification.content).toBe(`${testUser.username} joined the room`);
        });

        test('should create user left notification', async () => {
            const notification = await Message.createUserLeftNotification(
                testRoom.id,
                testUser.username
            );

            expect(notification.messageType).toBe('notification');
            expect(notification.content).toBe(`${testUser.username} left the room`);
        });
    });

    describe('Instance methods', () => {
        let testMessage;

        beforeEach(async () => {
            testMessage = await Message.create({
                roomId: testRoom.id,
                senderId: testUser.id,
                senderUsername: testUser.username,
                content: 'Test message'
            });
        });

        test('should update message content', async () => {
            await testMessage.updateContent('Updated message');
            expect(testMessage.content).toBe('Updated message');
        });

        test('should reject invalid content update', async () => {
            await expect(testMessage.updateContent('')).rejects.toThrow('Content validation failed');
        });

        test('should check if message is notification', () => {
            expect(testMessage.isNotification()).toBe(false);
            expect(testMessage.isMessage()).toBe(true);

            testMessage.messageType = 'notification';
            expect(testMessage.isNotification()).toBe(true);
            expect(testMessage.isMessage()).toBe(false);
        });

        test('should calculate message age', () => {
            const age = testMessage.getAge();
            expect(age).toBeGreaterThanOrEqual(0);
            expect(typeof age).toBe('number');
        });

        test('should check if message is recent', () => {
            expect(testMessage.isRecent()).toBe(true);
            
            // Create an old message by manually setting timestamp
            const oldMessage = new Message({
                ...testMessage,
                timestamp: new Date(Date.now() - 400000) // 6+ minutes ago
            });
            expect(oldMessage.isRecent()).toBe(false);
        });

        test('should save message changes', async () => {
            testMessage.content = 'Modified content';
            await testMessage.save();

            const found = await Message.findById(testMessage.id);
            expect(found.content).toBe('Modified content');
        });
    });

    describe('Serialization', () => {
        let testMessage;

        beforeEach(async () => {
            testMessage = await Message.create({
                roomId: testRoom.id,
                senderId: testUser.id,
                senderUsername: testUser.username,
                content: 'Test message'
            });
        });

        test('should serialize to JSON', () => {
            const json = testMessage.toJSON();

            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('roomId');
            expect(json).toHaveProperty('senderId');
            expect(json).toHaveProperty('senderUsername');
            expect(json).toHaveProperty('content');
            expect(json).toHaveProperty('timestamp');
            expect(json).toHaveProperty('messageType');
        });

        test('should serialize to public format', () => {
            const publicData = testMessage.toPublic();

            expect(publicData).toHaveProperty('id');
            expect(publicData).toHaveProperty('senderUsername');
            expect(publicData).toHaveProperty('content');
            expect(publicData).toHaveProperty('timestamp');
            expect(publicData).toHaveProperty('messageType');
            expect(publicData).not.toHaveProperty('roomId');
            expect(publicData).not.toHaveProperty('senderId');
        });

        test('should serialize to client format', () => {
            const clientData = testMessage.toClient();

            expect(clientData).toHaveProperty('id');
            expect(clientData).toHaveProperty('sender');
            expect(clientData).toHaveProperty('message');
            expect(clientData).toHaveProperty('timestamp');
            expect(clientData).toHaveProperty('type');
            expect(clientData.sender).toBe(testUser.username);
            expect(clientData.message).toBe('Test message');
            expect(clientData.type).toBe('message');
        });
    });
});