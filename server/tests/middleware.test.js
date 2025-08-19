const { authenticateToken, optionalAuth, requireAuth, rateLimiter } = require('../middleware');
const { jwtUtils } = require('../utils/jwt');
const { User } = require('../models');
const { dbManager } = require('../database');

describe('Authentication Middleware', () => {
    let testUser;
    let validToken;

    beforeAll(async () => {
        await dbManager.initialize();
    });

    beforeEach(async () => {
        // Clear database and create test user
        await dbManager.getDatabase().clear();
        
        testUser = await User.create({
            username: 'testuser',
            password: 'password123'
        });

        validToken = jwtUtils.generateToken({
            userId: testUser.id,
            username: testUser.username
        });
    });

    describe('authenticateToken middleware', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                headers: {}
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('should authenticate valid token', async () => {
            req.headers.authorization = `Bearer ${validToken}`;

            await authenticateToken(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user.id).toBe(testUser.id);
            expect(req.user.username).toBe(testUser.username);
            expect(req.token).toBe(validToken);
        });

        test('should reject missing authorization header', async () => {
            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'TOKEN_REQUIRED',
                    message: 'Authentication token is required'
                }
            });
            expect(next).not.toHaveBeenCalled();
        });

        test('should reject invalid token format', async () => {
            req.headers.authorization = 'InvalidFormat';

            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'TOKEN_REQUIRED',
                    message: 'Authentication token is required'
                }
            });
        });

        test('should reject invalid token', async () => {
            req.headers.authorization = 'Bearer invalid.token.here';

            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'AUTHENTICATION_FAILED',
                    message: 'Invalid authentication token'
                }
            });
        });

        test('should reject expired token', async () => {
            const expiredToken = jwtUtils.generateToken({
                userId: testUser.id,
                username: testUser.username
            }, { expiresIn: '0s' });

            req.headers.authorization = `Bearer ${expiredToken}`;

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 100));

            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'AUTHENTICATION_FAILED',
                    message: 'Authentication token has expired'
                }
            });
        });

        test('should reject blacklisted token', async () => {
            jwtUtils.blacklistToken(validToken);
            req.headers.authorization = `Bearer ${validToken}`;

            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'AUTHENTICATION_FAILED',
                    message: 'Authentication token has been invalidated'
                }
            });
        });

        test('should reject token for non-existent user', async () => {
            const nonExistentUserToken = jwtUtils.generateToken({
                userId: 'non-existent-id',
                username: 'nonexistent'
            });

            req.headers.authorization = `Bearer ${nonExistentUserToken}`;

            await authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User associated with token not found'
                }
            });
        });
    });

    describe('optionalAuth middleware', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                headers: {}
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('should authenticate valid token', async () => {
            req.headers.authorization = `Bearer ${validToken}`;

            await optionalAuth(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeDefined();
            expect(req.user.id).toBe(testUser.id);
        });

        test('should continue without authentication when no token', async () => {
            await optionalAuth(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeUndefined();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should continue without authentication on invalid token', async () => {
            req.headers.authorization = 'Bearer invalid.token';

            await optionalAuth(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.user).toBeUndefined();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('requireAuth middleware', () => {
        let req, res, next;

        beforeEach(() => {
            req = {};
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('should continue when user is authenticated', () => {
            req.user = { id: testUser.id, username: testUser.username };

            requireAuth(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should reject when user is not authenticated', () => {
            requireAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'AUTHENTICATION_REQUIRED',
                    message: 'Authentication is required for this endpoint'
                }
            });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('rateLimiter middleware', () => {
        let req, res, next;

        beforeEach(() => {
            req = {
                ip: '127.0.0.1'
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('should allow requests within limit', () => {
            const limiter = rateLimiter(5, 60000); // 5 requests per minute

            // Make 3 requests
            for (let i = 0; i < 3; i++) {
                limiter(req, res, next);
            }

            expect(next).toHaveBeenCalledTimes(3);
            expect(res.status).not.toHaveBeenCalled();
        });

        test('should block requests exceeding limit', () => {
            const limiter = rateLimiter(2, 60000); // 2 requests per minute

            // Make 3 requests
            limiter(req, res, next);
            limiter(req, res, next);
            limiter(req, res, next); // This should be blocked

            expect(next).toHaveBeenCalledTimes(2);
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests, please try again later'
                }
            });
        });

        test('should handle different client IPs separately', () => {
            const limiter = rateLimiter(1, 60000); // 1 request per minute

            const req1 = { ip: '127.0.0.1' };
            const req2 = { ip: '192.168.1.1' };

            limiter(req1, res, next);
            limiter(req2, res, next);

            expect(next).toHaveBeenCalledTimes(2);
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});