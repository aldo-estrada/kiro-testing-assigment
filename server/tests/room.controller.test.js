const request = require('supertest');
const express = require('express');
const { dbManager } = require('../database');
const { User, Room, Message } = require('../models');
const { jwtUtils } = require('../utils/jwt');
const { authenticateToken, errorHandler } = require('../middleware');
const RoomController = require('../controllers/room.controller');

// Create test app without rate limiting
const createTestApp = () => {
    const app = express();
    app.use(express.json());
    
    // Room routes without rate limiting
    const router = express.Router();
    router.get('/', authenticateToken, RoomController.getRooms);
    router.get('/my-rooms', authenticateToken, RoomController.getMyRooms);
    router.get('/:id', authenticateToken, RoomController.getRoomById);
    router.post('/', authenticateToken, RoomController.createRoom);
    router.put('/:id', authenticateToken, RoomController.updateRoom);
    router.delete('/:id', authenticateToken, RoomController.deleteRoom);
    router.get('/:id/messages', authenticateToken, RoomController.getRoomMessages);
    
    app.use('/api/rooms', router);
    app.use(errorHandler);
    
    return app;
};

describe('Room Controller', () => {
    let testUser;
    let anotherUser;
    let authToken;
    let anotherAuthToken;
    let app;

    beforeAll(async () => {
        await dbManager.initialize();
        app = createTestApp();
    });

    beforeEach(async () => {
        // Clear database before each test
        await dbManager.getDatabase().clear();
        
        // Create test users
        testUser = await User.create({
            username: 'testuser',
            password: 'password123'
        });

        anotherUser = await User.create({
            username: 'anotheruser',
            password: 'password123'
        });

        // Generate auth tokens
        authToken = jwtUtils.generateToken({
            userId: testUser.id,
            username: testUser.username
        });

        anotherAuthToken = jwtUtils.generateToken({
            userId: anotherUser.id,
            username: anotherUser.username
        });
    });

    describe('GET /api/rooms', () => {
        test('should get all active rooms', async () => {
            // Create test rooms
            const room1 = await Room.create({
                name: 'Test Room 1',
                createdBy: testUser.id
            });

            const room2 = await Room.create({
                name: 'Test Room 2',
                createdBy: anotherUser.id
            });

            // Create inactive room (should not appear)
            await Room.create({
                name: 'Inactive Room',
                createdBy: testUser.id,
                isActive: false
            });

            const response = await request(app)
                .get('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.rooms).toHaveLength(2);
            expect(response.body.data.total).toBe(2);
            
            const roomNames = response.body.data.rooms.map(room => room.name);
            expect(roomNames).toContain('Test Room 1');
            expect(roomNames).toContain('Test Room 2');
            expect(roomNames).not.toContain('Inactive Room');
        });

        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/rooms')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOKEN_REQUIRED');
        });

        test('should return empty array when no rooms exist', async () => {
            const response = await request(app)
                .get('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.rooms).toHaveLength(0);
            expect(response.body.data.total).toBe(0);
        });
    });

    describe('GET /api/rooms/:id', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });
        });

        test('should get room by ID', async () => {
            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.room.id).toBe(testRoom.id);
            expect(response.body.data.room.name).toBe('Test Room');
            expect(response.body.data.room.createdBy).toBe(testUser.id);
        });

        test('should return 404 for non-existent room', async () => {
            const response = await request(app)
                .get('/api/rooms/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
        });

        test('should return 404 for inactive room', async () => {
            await testRoom.deactivate();

            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_INACTIVE');
        });

        test('should require authentication', async () => {
            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}`)
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('POST /api/rooms', () => {
        test('should create a new room', async () => {
            const roomData = {
                name: 'New Test Room'
            };

            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(roomData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Room created successfully');
            expect(response.body.data.room.name).toBe('New Test Room');
            expect(response.body.data.room.createdBy).toBe(testUser.id);

            // Verify room was created in database
            const room = await Room.findByName('New Test Room');
            expect(room).toBeTruthy();
        });

        test('should reject room creation without name', async () => {
            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_ROOM_NAME');
        });

        test('should reject room creation with invalid name', async () => {
            const roomData = {
                name: '' // Empty name
            };

            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(roomData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_ROOM_NAME');
        });

        test('should reject duplicate room names', async () => {
            // Create first room
            await Room.create({
                name: 'Duplicate Room',
                createdBy: testUser.id
            });

            // Try to create duplicate
            const roomData = {
                name: 'Duplicate Room'
            };

            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(roomData)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_NAME_EXISTS');
        });

        test('should trim room name', async () => {
            const roomData = {
                name: '  Trimmed Room  '
            };

            const response = await request(app)
                .post('/api/rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .send(roomData)
                .expect(201);

            expect(response.body.data.room.name).toBe('Trimmed Room');
        });

        test('should require authentication', async () => {
            const roomData = {
                name: 'Test Room'
            };

            const response = await request(app)
                .post('/api/rooms')
                .send(roomData)
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('PUT /api/rooms/:id', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Original Room',
                createdBy: testUser.id
            });
        });

        test('should update room name by creator', async () => {
            const updateData = {
                name: 'Updated Room Name'
            };

            const response = await request(app)
                .put(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Room updated successfully');
            expect(response.body.data.room.name).toBe('Updated Room Name');

            // Verify update in database
            const updatedRoom = await Room.findById(testRoom.id);
            expect(updatedRoom.name).toBe('Updated Room Name');
        });

        test('should reject update by non-creator', async () => {
            const updateData = {
                name: 'Updated Room Name'
            };

            const response = await request(app)
                .put(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${anotherAuthToken}`)
                .send(updateData)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        test('should reject update without name', async () => {
            const response = await request(app)
                .put(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({})
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_ROOM_NAME');
        });

        test('should return 404 for non-existent room', async () => {
            const updateData = {
                name: 'Updated Name'
            };

            const response = await request(app)
                .put('/api/rooms/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`)
                .send(updateData)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
        });
    });

    describe('DELETE /api/rooms/:id', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Room to Delete',
                createdBy: testUser.id
            });
        });

        test('should delete room by creator', async () => {
            const response = await request(app)
                .delete(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Room deleted successfully');

            // Verify deletion in database
            const deletedRoom = await Room.findById(testRoom.id);
            expect(deletedRoom).toBeNull();
        });

        test('should delete room messages when deleting room', async () => {
            // Create messages in the room
            await Message.create({
                roomId: testRoom.id,
                senderId: testUser.id,
                senderUsername: testUser.username,
                content: 'Test message 1'
            });

            await Message.create({
                roomId: testRoom.id,
                senderId: anotherUser.id,
                senderUsername: anotherUser.username,
                content: 'Test message 2'
            });

            // Delete room
            await request(app)
                .delete(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            // Verify messages were deleted
            const messages = await Message.findByRoom(testRoom.id);
            expect(messages).toHaveLength(0);
        });

        test('should reject deletion by non-creator', async () => {
            const response = await request(app)
                .delete(`/api/rooms/${testRoom.id}`)
                .set('Authorization', `Bearer ${anotherAuthToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
        });

        test('should return 404 for non-existent room', async () => {
            const response = await request(app)
                .delete('/api/rooms/non-existent-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
        });
    });

    describe('GET /api/rooms/:id/messages', () => {
        let testRoom;
        let testMessages;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });

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

        test('should get room messages', async () => {
            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.messages).toHaveLength(5);
            expect(response.body.data.pagination.total).toBe(5);
            expect(response.body.data.room.id).toBe(testRoom.id);
            expect(response.body.data.room.name).toBe('Test Room');
        });

        test('should support pagination', async () => {
            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}/messages?limit=2&offset=1`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.messages).toHaveLength(2);
            expect(response.body.data.pagination.limit).toBe(2);
            expect(response.body.data.pagination.offset).toBe(1);
            expect(response.body.data.pagination.total).toBe(5);
            expect(response.body.data.pagination.hasMore).toBe(true);
        });

        test('should support sort order', async () => {
            const ascResponse = await request(app)
                .get(`/api/rooms/${testRoom.id}/messages?order=asc`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const descResponse = await request(app)
                .get(`/api/rooms/${testRoom.id}/messages?order=desc`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(ascResponse.body.data.messages[0].message).toBe('Test message 1');
            expect(descResponse.body.data.messages[0].message).toBe('Test message 5');
        });

        test('should return 404 for non-existent room', async () => {
            const response = await request(app)
                .get('/api/rooms/non-existent-id/messages')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
        });

        test('should return 404 for inactive room', async () => {
            await testRoom.deactivate();

            const response = await request(app)
                .get(`/api/rooms/${testRoom.id}/messages`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ROOM_INACTIVE');
        });
    });

    describe('GET /api/rooms/my-rooms', () => {
        test('should get rooms created by current user', async () => {
            // Create rooms by test user
            await Room.create({
                name: 'My Room 1',
                createdBy: testUser.id
            });

            await Room.create({
                name: 'My Room 2',
                createdBy: testUser.id
            });

            // Create room by another user (should not appear)
            await Room.create({
                name: 'Other Room',
                createdBy: anotherUser.id
            });

            const response = await request(app)
                .get('/api/rooms/my-rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.rooms).toHaveLength(2);
            expect(response.body.data.total).toBe(2);
            
            const roomNames = response.body.data.rooms.map(room => room.name);
            expect(roomNames).toContain('My Room 1');
            expect(roomNames).toContain('My Room 2');
            expect(roomNames).not.toContain('Other Room');
        });

        test('should return empty array when user has no rooms', async () => {
            const response = await request(app)
                .get('/api/rooms/my-rooms')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.rooms).toHaveLength(0);
            expect(response.body.data.total).toBe(0);
        });

        test('should require authentication', async () => {
            const response = await request(app)
                .get('/api/rooms/my-rooms')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });
});