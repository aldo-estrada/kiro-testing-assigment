const { InMemoryDatabase } = require('../database/connection');
const { dbManager } = require('../database/index');

describe('Database Connection', () => {
    let testDb;

    beforeEach(() => {
        testDb = new InMemoryDatabase();
    });

    afterEach(async () => {
        if (testDb.isConnected()) {
            await testDb.disconnect();
        }
    });

    describe('Connection Management', () => {
        test('should connect successfully', async () => {
            await testDb.connect();
            expect(testDb.isConnected()).toBe(true);
        });

        test('should disconnect successfully', async () => {
            await testDb.connect();
            await testDb.disconnect();
            expect(testDb.isConnected()).toBe(false);
        });

        test('should throw error when operating without connection', async () => {
            await expect(testDb.create('users', { name: 'test' }))
                .rejects.toThrow('Database not connected');
        });
    });

    describe('CRUD Operations', () => {
        beforeEach(async () => {
            await testDb.connect();
        });

        test('should create a record', async () => {
            const userData = { username: 'testuser', email: 'test@example.com' };
            const created = await testDb.create('users', userData);

            expect(created).toHaveProperty('id');
            expect(created).toHaveProperty('createdAt');
            expect(created).toHaveProperty('updatedAt');
            expect(created.username).toBe('testuser');
            expect(created.email).toBe('test@example.com');
        });

        test('should find record by ID', async () => {
            const userData = { username: 'testuser' };
            const created = await testDb.create('users', userData);

            const found = await testDb.findById('users', created.id);
            expect(found).toEqual(created);
        });

        test('should find record by query', async () => {
            const userData = { username: 'testuser', active: true };
            await testDb.create('users', userData);

            const found = await testDb.findOne('users', { username: 'testuser' });
            expect(found).toBeTruthy();
            expect(found.username).toBe('testuser');
        });

        test('should find multiple records', async () => {
            await testDb.create('users', { username: 'user1', active: true });
            await testDb.create('users', { username: 'user2', active: true });
            await testDb.create('users', { username: 'user3', active: false });

            const activeUsers = await testDb.findMany('users', { active: true });
            expect(activeUsers).toHaveLength(2);
        });

        test('should update record by ID', async () => {
            const userData = { username: 'testuser', active: false };
            const created = await testDb.create('users', userData);

            // Small delay to ensure different timestamps
            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = await testDb.updateById('users', created.id, { active: true });
            expect(updated.active).toBe(true);
            expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
        });

        test('should delete record by ID', async () => {
            const userData = { username: 'testuser' };
            const created = await testDb.create('users', userData);

            const deleted = await testDb.deleteById('users', created.id);
            expect(deleted).toEqual(created);

            const found = await testDb.findById('users', created.id);
            expect(found).toBeNull();
        });

        test('should return null for non-existent records', async () => {
            const found = await testDb.findById('users', 'non-existent-id');
            expect(found).toBeNull();

            const updated = await testDb.updateById('users', 'non-existent-id', { active: true });
            expect(updated).toBeNull();

            const deleted = await testDb.deleteById('users', 'non-existent-id');
            expect(deleted).toBeNull();
        });
    });

    describe('Database Manager', () => {
        test('should initialize successfully', async () => {
            await expect(dbManager.initialize()).resolves.toBe(true);
        });

        test('should perform health check', async () => {
            await dbManager.initialize();
            const health = await dbManager.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health).toHaveProperty('stats');
            expect(health).toHaveProperty('timestamp');
        });

        test('should create default rooms on initialization', async () => {
            await dbManager.initialize();
            const rooms = await dbManager.getDatabase().findMany('rooms');

            expect(rooms.length).toBeGreaterThan(0);
            expect(rooms.some(room => room.name === 'General')).toBe(true);
        });
    });
});