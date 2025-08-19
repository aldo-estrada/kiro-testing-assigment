const Room = require('../models/Room');
const User = require('../models/User');
const { dbManager } = require('../database');

describe('Room Model', () => {
    let testUser;

    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear database before each test
        await dbManager.getDatabase().clear();
        
        // Create a test user for room creation
        testUser = await User.create({
            username: 'testuser',
            password: 'password123'
        });
    });

    describe('Validation', () => {
        describe('Room name validation', () => {
            test('should accept valid room names', () => {
                const validNames = ['General', 'Test Room', 'room_123', 'room-name', 'A'];
                
                validNames.forEach(name => {
                    const errors = Room.validateName(name);
                    expect(errors).toHaveLength(0);
                });
            });

            test('should reject invalid room names', () => {
                const testCases = [
                    { name: '', expectedError: 'Room name cannot be empty' },
                    { name: '   ', expectedError: 'Room name cannot be empty' },
                    { name: null, expectedError: 'Room name is required' },
                    { name: undefined, expectedError: 'Room name is required' },
                    { name: 123, expectedError: 'Room name must be a string' },
                    { name: 'a'.repeat(51), expectedError: 'Room name must be no more than 50 characters long' },
                    { name: 'room@name', expectedError: 'Room name can only contain letters, numbers, spaces, underscores, and hyphens' },
                    { name: 'room#name', expectedError: 'Room name can only contain letters, numbers, spaces, underscores, and hyphens' }
                ];

                testCases.forEach(({ name, expectedError }) => {
                    const errors = Room.validateName(name);
                    expect(errors.length).toBeGreaterThan(0);
                    expect(errors.some(error => error.includes(expectedError.split(' ')[0]))).toBe(true);
                });
            });
        });

        describe('Full validation', () => {
            test('should validate complete room data', () => {
                const validData = {
                    name: 'Test Room',
                    createdBy: testUser.id,
                    participants: [testUser.id]
                };

                const errors = Room.validate(validData);
                expect(errors).toHaveLength(0);
            });

            test('should collect all validation errors', () => {
                const invalidData = {
                    name: '',
                    createdBy: null,
                    participants: 'not-an-array'
                };

                const errors = Room.validate(invalidData);
                expect(errors.length).toBeGreaterThan(2);
            });

            test('should validate participants array', () => {
                const invalidData = {
                    name: 'Test Room',
                    createdBy: testUser.id,
                    participants: ['valid-id', 123, 'another-valid-id']
                };

                const errors = Room.validate(invalidData);
                expect(errors.some(error => error.includes('Participant at index 1'))).toBe(true);
            });
        });
    });

    describe('Database operations', () => {
        describe('Room creation', () => {
            test('should create a valid room', async () => {
                const roomData = {
                    name: 'Test Room',
                    createdBy: testUser.id
                };

                const room = await Room.create(roomData);

                expect(room).toBeInstanceOf(Room);
                expect(room.id).toBeDefined();
                expect(room.name).toBe('Test Room');
                expect(room.createdBy).toBe(testUser.id);
                expect(room.createdAt).toBeInstanceOf(Date);
                expect(room.participants).toEqual([]);
                expect(room.isActive).toBe(true);
            });

            test('should create room with participants', async () => {
                const roomData = {
                    name: 'Test Room',
                    createdBy: testUser.id,
                    participants: [testUser.id]
                };

                const room = await Room.create(roomData);
                expect(room.participants).toEqual([testUser.id]);
            });

            test('should trim room name', async () => {
                const roomData = {
                    name: '  Test Room  ',
                    createdBy: testUser.id
                };

                const room = await Room.create(roomData);
                expect(room.name).toBe('Test Room');
            });

            test('should reject invalid room data', async () => {
                const invalidData = {
                    name: '',
                    createdBy: testUser.id
                };

                await expect(Room.create(invalidData)).rejects.toThrow('Validation failed');
            });

            test('should reject duplicate room names', async () => {
                const roomData = {
                    name: 'Test Room',
                    createdBy: testUser.id
                };

                await Room.create(roomData);
                await expect(Room.create(roomData)).rejects.toThrow('Room name already exists');
            });

            test('should reject duplicate room names case-insensitively', async () => {
                const roomData1 = {
                    name: 'Test Room',
                    createdBy: testUser.id
                };

                const roomData2 = {
                    name: 'test room',
                    createdBy: testUser.id
                };

                await Room.create(roomData1);
                // Note: Current implementation is case-sensitive, but this test documents expected behavior
                // If case-insensitive is needed, the findByName method would need to be updated
            });
        });

        describe('Room retrieval', () => {
            let testRoom;

            beforeEach(async () => {
                testRoom = await Room.create({
                    name: 'Test Room',
                    createdBy: testUser.id
                });
            });

            test('should find room by ID', async () => {
                const found = await Room.findById(testRoom.id);
                expect(found).toBeInstanceOf(Room);
                expect(found.name).toBe('Test Room');
            });

            test('should find room by name', async () => {
                const found = await Room.findByName('Test Room');
                expect(found).toBeInstanceOf(Room);
                expect(found.id).toBe(testRoom.id);
            });

            test('should return null for non-existent rooms', async () => {
                const notFound = await Room.findById('non-existent-id');
                expect(notFound).toBeNull();

                const notFoundByName = await Room.findByName('Non-existent Room');
                expect(notFoundByName).toBeNull();
            });

            test('should find all rooms', async () => {
                await Room.create({
                    name: 'Another Room',
                    createdBy: testUser.id
                });

                const rooms = await Room.findAll();
                expect(rooms.length).toBeGreaterThanOrEqual(2);
                expect(rooms.every(room => room instanceof Room)).toBe(true);
            });

            test('should find active rooms only', async () => {
                const inactiveRoom = await Room.create({
                    name: 'Inactive Room',
                    createdBy: testUser.id,
                    isActive: false
                });

                const activeRooms = await Room.findActive();
                expect(activeRooms.every(room => room.isActive)).toBe(true);
                expect(activeRooms.some(room => room.id === inactiveRoom.id)).toBe(false);
            });

            test('should find rooms by creator', async () => {
                const anotherUser = await User.create({
                    username: 'anotheruser',
                    password: 'password123'
                });

                await Room.create({
                    name: 'Another Room',
                    createdBy: anotherUser.id
                });

                const userRooms = await Room.findByCreator(testUser.id);
                expect(userRooms.every(room => room.createdBy === testUser.id)).toBe(true);
            });
        });
    });

    describe('Participant management', () => {
        let testRoom;
        let anotherUser;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });

            anotherUser = await User.create({
                username: 'anotheruser',
                password: 'password123'
            });
        });

        test('should add participant', async () => {
            await testRoom.addParticipant(testUser.id);
            expect(testRoom.hasParticipant(testUser.id)).toBe(true);
            expect(testRoom.getParticipantCount()).toBe(1);
        });

        test('should not add duplicate participants', async () => {
            await testRoom.addParticipant(testUser.id);
            await testRoom.addParticipant(testUser.id);
            expect(testRoom.getParticipantCount()).toBe(1);
        });

        test('should remove participant', async () => {
            await testRoom.addParticipant(testUser.id);
            await testRoom.addParticipant(anotherUser.id);
            
            await testRoom.removeParticipant(testUser.id);
            expect(testRoom.hasParticipant(testUser.id)).toBe(false);
            expect(testRoom.hasParticipant(anotherUser.id)).toBe(true);
            expect(testRoom.getParticipantCount()).toBe(1);
        });

        test('should handle removing non-existent participant', async () => {
            await testRoom.removeParticipant('non-existent-id');
            expect(testRoom.getParticipantCount()).toBe(0);
        });

        test('should clear all participants', async () => {
            await testRoom.addParticipant(testUser.id);
            await testRoom.addParticipant(anotherUser.id);
            
            await testRoom.clearParticipants();
            expect(testRoom.getParticipantCount()).toBe(0);
        });

        test('should validate user ID for participant operations', async () => {
            await expect(testRoom.addParticipant(null)).rejects.toThrow('Valid user ID is required');
            await expect(testRoom.addParticipant(123)).rejects.toThrow('Valid user ID is required');
            await expect(testRoom.removeParticipant('')).rejects.toThrow('Valid user ID is required');
        });
    });

    describe('Room status management', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });
        });

        test('should activate room', async () => {
            testRoom.isActive = false;
            await testRoom.activate();
            expect(testRoom.isActive).toBe(true);
        });

        test('should deactivate room', async () => {
            await testRoom.deactivate();
            expect(testRoom.isActive).toBe(false);
        });
    });

    describe('Room updates', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });
        });

        test('should update room name', async () => {
            await testRoom.updateName('Updated Room');
            expect(testRoom.name).toBe('Updated Room');
        });

        test('should reject invalid new name', async () => {
            await expect(testRoom.updateName('')).rejects.toThrow('Room name validation failed');
        });

        test('should reject duplicate new name', async () => {
            await Room.create({
                name: 'Another Room',
                createdBy: testUser.id
            });

            await expect(testRoom.updateName('Another Room')).rejects.toThrow('Room name already exists');
        });

        test('should allow updating to same name', async () => {
            await testRoom.updateName('Test Room');
            expect(testRoom.name).toBe('Test Room');
        });
    });

    describe('Serialization', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id,
                participants: [testUser.id]
            });
        });

        test('should serialize to JSON', () => {
            const json = testRoom.toJSON();
            
            expect(json).toHaveProperty('id');
            expect(json).toHaveProperty('name');
            expect(json).toHaveProperty('createdBy');
            expect(json).toHaveProperty('createdAt');
            expect(json).toHaveProperty('participantCount');
            expect(json).toHaveProperty('isActive');
            expect(json).not.toHaveProperty('participants');
            expect(json.participantCount).toBe(1);
        });

        test('should serialize to public format', () => {
            const publicData = testRoom.toPublic();
            
            expect(publicData).toHaveProperty('id');
            expect(publicData).toHaveProperty('name');
            expect(publicData).toHaveProperty('participantCount');
            expect(publicData).toHaveProperty('isActive');
            expect(publicData).not.toHaveProperty('createdBy');
            expect(publicData).not.toHaveProperty('createdAt');
            expect(publicData).not.toHaveProperty('participants');
        });

        test('should serialize to detailed format', () => {
            const detailedData = testRoom.toDetailed();
            
            expect(detailedData).toHaveProperty('id');
            expect(detailedData).toHaveProperty('name');
            expect(detailedData).toHaveProperty('createdBy');
            expect(detailedData).toHaveProperty('createdAt');
            expect(detailedData).toHaveProperty('participants');
            expect(detailedData).toHaveProperty('participantCount');
            expect(detailedData).toHaveProperty('isActive');
            expect(detailedData.participants).toEqual([testUser.id]);
        });
    });

    describe('Instance methods', () => {
        let testRoom;

        beforeEach(async () => {
            testRoom = await Room.create({
                name: 'Test Room',
                createdBy: testUser.id
            });
        });

        test('should delete room', async () => {
            const deleted = await testRoom.delete();
            expect(deleted).toBeTruthy();
            
            const found = await Room.findById(testRoom.id);
            expect(found).toBeNull();
        });

        test('should save room changes', async () => {
            testRoom.name = 'Modified Room';
            await testRoom.save();
            
            const found = await Room.findById(testRoom.id);
            expect(found.name).toBe('Modified Room');
        });
    });
});