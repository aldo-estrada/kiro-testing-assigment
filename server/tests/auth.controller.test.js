const request = require('supertest');
const { app } = require('../server');
const { dbManager } = require('../database');
const { User } = require('../models');
const { jwtUtils } = require('../utils/jwt');

describe('Auth Controller', () => {
    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear database before each test
        await dbManager.getDatabase().clear();
    });

    describe('POST /api/auth/register', () => {
        test('should register a new user successfully', async () => {
            const userData = {
                username: 'testuser',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('User registered successfully');
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data).toHaveProperty('token');
            expect(response.body.data.user.username).toBe('testuser');
            expect(response.body.data.user).not.toHaveProperty('passwordHash');

            // Verify user was created in database
            const user = await User.findByUsername('testuser');
            expect(user).toBeTruthy();
        });

        test('should reject registration with missing fields', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({ username: 'testuser' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_FIELDS');
        });

        test('should reject registration with invalid username', async () => {
            const userData = {
                username: 'ab', // Too short
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toBeDefined();
        });

        test('should reject registration with invalid password', async () => {
            const userData = {
                username: 'testuser',
                password: '123' // Too short
            };

            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should reject duplicate username', async () => {
            const userData = {
                username: 'testuser',
                password: 'password123'
            };

            // Create first user
            await User.create(userData);

            // Try to create duplicate
            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('USERNAME_EXISTS');
        });

        test('should trim username', async () => {
            const userData = {
                username: '  testuser  ',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/register')
                .send(userData)
                .expect(201);

            expect(response.body.data.user.username).toBe('testuser');
        });
    });

    describe('POST /api/auth/login', () => {
        let testUser;

        beforeEach(async () => {
            testUser = await User.create({
                username: 'testuser',
                password: 'password123'
            });
        });

        test('should login with valid credentials', async () => {
            const loginData = {
                username: 'testuser',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Login successful');
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data).toHaveProperty('token');
            expect(response.body.data.user.username).toBe('testuser');

            // Verify token is valid
            const decoded = jwtUtils.verifyToken(response.body.data.token);
            expect(decoded.userId).toBe(testUser.id);
        });

        test('should reject login with missing fields', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ username: 'testuser' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_FIELDS');
        });

        test('should reject login with invalid username', async () => {
            const loginData = {
                username: 'nonexistent',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        test('should reject login with invalid password', async () => {
            const loginData = {
                username: 'testuser',
                password: 'wrongpassword'
            };

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        test('should trim username during login', async () => {
            const loginData = {
                username: '  testuser  ',
                password: 'password123'
            };

            const response = await request(app)
                .post('/api/auth/login')
                .send(loginData)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('POST /api/auth/logout', () => {
        let testUser;
        let authToken;

        beforeEach(async () => {
            testUser = await User.create({
                username: 'testuser',
                password: 'password123'
            });

            authToken = jwtUtils.generateToken({
                userId: testUser.id,
                username: testUser.username
            });
        });

        test('should logout successfully with valid token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Logout successful');

            // Verify token is blacklisted
            expect(jwtUtils.isTokenBlacklisted(authToken)).toBe(true);
        });

        test('should reject logout without token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOKEN_REQUIRED');
        });

        test('should reject logout with invalid token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', 'Bearer invalid.token.here')
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/auth/profile', () => {
        let testUser;
        let authToken;

        beforeEach(async () => {
            testUser = await User.create({
                username: 'testuser',
                password: 'password123'
            });

            authToken = jwtUtils.generateToken({
                userId: testUser.id,
                username: testUser.username
            });
        });

        test('should get user profile with valid token', async () => {
            const response = await request(app)
                .get('/api/auth/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.user.username).toBe('testuser');
            expect(response.body.data.user.id).toBe(testUser.id);
            expect(response.body.data.user).not.toHaveProperty('passwordHash');
        });

        test('should reject profile request without token', async () => {
            const response = await request(app)
                .get('/api/auth/profile')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOKEN_REQUIRED');
        });
    });

    describe('PUT /api/auth/password', () => {
        let testUser;
        let authToken;

        beforeEach(async () => {
            testUser = await User.create({
                username: 'testuser',
                password: 'password123'
            });

            authToken = jwtUtils.generateToken({
                userId: testUser.id,
                username: testUser.username
            });
        });

        test('should update password with valid data', async () => {
            const passwordData = {
                currentPassword: 'password123',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .put('/api/auth/password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Password updated successfully');

            // Verify new password works
            const updatedUser = await User.findById(testUser.id);
            const isNewPasswordValid = await User.comparePassword('newpassword456', updatedUser.passwordHash);
            expect(isNewPasswordValid).toBe(true);
        });

        test('should reject password update with missing fields', async () => {
            const response = await request(app)
                .put('/api/auth/password')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ currentPassword: 'password123' })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('MISSING_FIELDS');
        });

        test('should reject password update with wrong current password', async () => {
            const passwordData = {
                currentPassword: 'wrongpassword',
                newPassword: 'newpassword456'
            };

            const response = await request(app)
                .put('/api/auth/password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
        });

        test('should reject password update with invalid new password', async () => {
            const passwordData = {
                currentPassword: 'password123',
                newPassword: '123' // Too short
            };

            const response = await request(app)
                .put('/api/auth/password')
                .set('Authorization', `Bearer ${authToken}`)
                .send(passwordData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('POST /api/auth/refresh', () => {
        let testUser;
        let authToken;

        beforeEach(async () => {
            testUser = await User.create({
                username: 'testuser',
                password: 'password123'
            });

            authToken = jwtUtils.generateToken({
                userId: testUser.id,
                username: testUser.username
            });
        });

        test('should refresh token successfully', async () => {
            // Wait a moment to ensure different timestamp
            await new Promise(resolve => setTimeout(resolve, 1100));

            const response = await request(app)
                .post('/api/auth/refresh')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Token refreshed successfully');
            expect(response.body.data.token).toBeDefined();
            expect(response.body.data.token).not.toBe(authToken);

            // Verify old token is blacklisted
            expect(jwtUtils.isTokenBlacklisted(authToken)).toBe(true);

            // Verify new token is valid
            const decoded = jwtUtils.verifyToken(response.body.data.token);
            expect(decoded.userId).toBe(testUser.id);
        });

        test('should reject refresh without token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('TOKEN_REQUIRED');
        });
    });
});