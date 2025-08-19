const User = require('../models/User');
const { dbManager } = require('../database');

describe('User Model', () => {
    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear users before each test
        await dbManager.getDatabase().clear();
    });

    describe('Validation', () => {
        describe('Username validation', () => {
            test('should accept valid usernames', () => {
                const validUsernames = ['user123', 'test_user', 'user-name', 'abc'];
                
                validUsernames.forEach(username => {
                    const errors = User.validateUsername(username);
                    expect(errors).toHaveLength(0);
                });
            });

            test('should reject invalid usernames', () => {
                const testCases = [
                    { username: '', expectedError: 'Username is required' },
                    { username: null, expectedError: 'Username is required' },
                    { username: undefined, expectedError: 'Username is required' },
                    { username: 123, expectedError: 'Username must be a string' },
                    { username: 'ab', expectedError: 'Username must be at least 3 characters long' },
                    { username: 'a'.repeat(31), expectedError: 'Username must be no more than 30 characters long' },
                    { username: 'user@name', expectedError: 'Username can only contain letters, numbers, underscores, and hyphens' },
                    { username: 'user name', expectedError: 'Username can only contain letters, numbers, underscores, and hyphens' }
                ];

                testCases.forEach(({ username, expectedError }) => {
                    const errors = User.validateUsername(username);
                    expect(errors.length).toBeGreaterThan(0);
                    expect(errors.some(error => error.includes(expectedError.split(' ')[0]))).toBe(true);
                });
            });
        });

        describe('Password validation', () => {
            test('should accept valid passwords', () => {
                const validPasswords = ['password123', 'mySecretPass', '123456'];
                
                validPasswords.forEach(password => {
                    const errors = User.validatePassword(password);
                    expect(errors).toHaveLength(0);
                });
            });

            test('should reject invalid passwords', () => {
                const testCases = [
                    { password: '', expectedError: 'Password is required' },
                    { password: null, expectedError: 'Password is required' },
                    { password: undefined, expectedError: 'Password is required' },
                    { password: 123, expectedError: 'Password must be a string' },
                    { password: '12345', expectedError: 'Password must be at least 6 characters long' },
                    { password: 'a'.repeat(101), expectedError: 'Password must be no more than 100 characters long' }
                ];

                testCases.forEach(({ password, expectedError }) => {
                    const errors = User.validatePassword(password);
                    expect(errors.length).toBeGreaterThan(0);
                    expect(errors.some(error => error.includes(expectedError.split(' ')[0]))).toBe(true);
                });
            });
        });

        describe('Full validation', () => {
            test('should validate complete user data', () => {
                const validData = {
                    username: 'testuser',
                    password: 'password123'
                };

                const errors = User.validate(validData);
                expect(errors).toHaveLength(0);
            });

            test('should collect all validation errors', () => {
                const invalidData = {
                    username: 'ab',
                    password: '123'
                };

                const errors = User.validate(invalidData);
                expect(errors.length).toBeGreaterThan(1);
            });
        });
    });

    describe('Password utilities', () => {
        test('should hash passwords', async () => {
            const password = 'testpassword';
            const hash = await User.hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
        });

        test('should compare passwords correctly', async () => {
            const password = 'testpassword';
            const hash = await User.hashPassword(password);

            const isValid = await User.comparePassword(password, hash);
            expect(isValid).toBe(true);

            const isInvalid = await User.comparePassword('wrongpassword', hash);
            expect(isInvalid).toBe(false);
        });
    });

    describe('Database operations', () => {
        describe('User creation', () => {
            test('should create a valid user', async () => {
                const userData = {
                    username: 'testuser',
                    password: 'password123'
                };

                const user = await User.create(userData);

                expect(user).toBeInstanceOf(User);
                expect(user.id).toBeDefined();
                expect(user.username).toBe('testuser');
                expect(user.passwordHash).toBeDefined();
                expect(user.passwordHash).not.toBe('password123');
                expect(user.createdAt).toBeInstanceOf(Date);
                expect(user.lastActive).toBeInstanceOf(Date);
            });

            test('should reject invalid user data', async () => {
                const invalidData = {
                    username: 'ab',
                    password: '123'
                };

                await expect(User.create(invalidData)).rejects.toThrow('Validation failed');
            });

            test('should reject duplicate usernames', async () => {
                const userData = {
                    username: 'testuser',
                    password: 'password123'
                };

                await User.create(userData);
                await expect(User.create(userData)).rejects.toThrow('Username already exists');
            });
        });

        describe('User retrieval', () => {
            let testUser;

            beforeEach(async () => {
                testUser = await User.create({
                    username: 'testuser',
                    password: 'password123'
                });
            });

            test('should find user by ID', async () => {
                const found = await User.findById(testUser.id);
                expect(found).toBeInstanceOf(User);
                expect(found.username).toBe('testuser');
            });

            test('should find user by username', async () => {
                const found = await User.findByUsername('testuser');
                expect(found).toBeInstanceOf(User);
                expect(found.id).toBe(testUser.id);
            });

            test('should return null for non-existent users', async () => {
                const notFound = await User.findById('non-existent-id');
                expect(notFound).toBeNull();

                const notFoundByUsername = await User.findByUsername('nonexistent');
                expect(notFoundByUsername).toBeNull();
            });

            test('should find all users', async () => {
                await User.create({
                    username: 'user2',
                    password: 'password123'
                });

                const users = await User.findAll();
                expect(users).toHaveLength(2);
                expect(users.every(user => user instanceof User)).toBe(true);
            });
        });

        describe('Authentication', () => {
            let testUser;

            beforeEach(async () => {
                testUser = await User.create({
                    username: 'testuser',
                    password: 'password123'
                });
            });

            test('should authenticate valid credentials', async () => {
                const user = await User.authenticate('testuser', 'password123');
                expect(user).toBeInstanceOf(User);
                expect(user.username).toBe('testuser');
            });

            test('should reject invalid username', async () => {
                await expect(User.authenticate('nonexistent', 'password123'))
                    .rejects.toThrow('Invalid credentials');
            });

            test('should reject invalid password', async () => {
                await expect(User.authenticate('testuser', 'wrongpassword'))
                    .rejects.toThrow('Invalid credentials');
            });

            test('should update last active on successful authentication', async () => {
                const originalLastActive = testUser.lastActive;
                
                // Small delay to ensure different timestamp
                await new Promise(resolve => setTimeout(resolve, 10));
                
                const authenticatedUser = await User.authenticate('testuser', 'password123');
                expect(authenticatedUser.lastActive.getTime()).toBeGreaterThan(originalLastActive.getTime());
            });
        });

        describe('Instance methods', () => {
            let testUser;

            beforeEach(async () => {
                testUser = await User.create({
                    username: 'testuser',
                    password: 'password123'
                });
            });

            test('should update last active', async () => {
                const originalLastActive = testUser.lastActive;
                
                // Small delay to ensure different timestamp
                await new Promise(resolve => setTimeout(resolve, 10));
                
                await testUser.updateLastActive();
                expect(testUser.lastActive.getTime()).toBeGreaterThan(originalLastActive.getTime());
            });

            test('should update password', async () => {
                const originalHash = testUser.passwordHash;
                
                await testUser.updatePassword('newpassword123');
                expect(testUser.passwordHash).not.toBe(originalHash);
                
                // Verify new password works
                const isValid = await User.comparePassword('newpassword123', testUser.passwordHash);
                expect(isValid).toBe(true);
            });

            test('should reject invalid new password', async () => {
                await expect(testUser.updatePassword('123'))
                    .rejects.toThrow('Password validation failed');
            });

            test('should delete user', async () => {
                const deleted = await testUser.delete();
                expect(deleted).toBeTruthy();
                
                const found = await User.findById(testUser.id);
                expect(found).toBeNull();
            });
        });

        describe('Serialization', () => {
            let testUser;

            beforeEach(async () => {
                testUser = await User.create({
                    username: 'testuser',
                    password: 'password123'
                });
            });

            test('should serialize to JSON without password', () => {
                const json = testUser.toJSON();
                
                expect(json).toHaveProperty('id');
                expect(json).toHaveProperty('username');
                expect(json).toHaveProperty('createdAt');
                expect(json).toHaveProperty('lastActive');
                expect(json).not.toHaveProperty('passwordHash');
            });

            test('should serialize to public format', () => {
                const publicData = testUser.toPublic();
                
                expect(publicData).toHaveProperty('id');
                expect(publicData).toHaveProperty('username');
                expect(publicData).not.toHaveProperty('createdAt');
                expect(publicData).not.toHaveProperty('lastActive');
                expect(publicData).not.toHaveProperty('passwordHash');
            });
        });
    });
});