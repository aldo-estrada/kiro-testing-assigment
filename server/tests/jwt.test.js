const { JWTUtils, jwtUtils } = require('../utils/jwt');
const jwt = require('jsonwebtoken');

describe('JWT Utilities', () => {
    let testUtils;

    beforeEach(() => {
        // Create fresh instance for each test
        testUtils = new JWTUtils();
        testUtils.secret = 'test-secret';
    });

    describe('Token Generation', () => {
        test('should generate valid JWT token', () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };

            const token = testUtils.generateToken(payload);
            
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
        });

        test('should include required payload data', () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };

            const token = testUtils.generateToken(payload);
            const decoded = jwt.decode(token);
            
            expect(decoded.userId).toBe('user123');
            expect(decoded.username).toBe('testuser');
            expect(decoded.iat).toBeDefined();
            expect(decoded.exp).toBeDefined();
            expect(decoded.iss).toBe('chat-web-room');
            expect(decoded.aud).toBe('chat-users');
        });

        test('should accept custom options', () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };

            const token = testUtils.generateToken(payload, { expiresIn: '1h' });
            const decoded = jwt.decode(token);
            
            // Token should expire in 1 hour (3600 seconds)
            const expectedExp = decoded.iat + 3600;
            expect(decoded.exp).toBe(expectedExp);
        });

        test('should require userId in payload', () => {
            const invalidPayload = {
                username: 'testuser'
            };

            expect(() => {
                testUtils.generateToken(invalidPayload);
            }).toThrow('User ID is required for token generation');
        });
    });

    describe('Token Verification', () => {
        let validToken;
        let payload;

        beforeEach(() => {
            payload = {
                userId: 'user123',
                username: 'testuser'
            };
            validToken = testUtils.generateToken(payload);
        });

        test('should verify valid token', () => {
            const decoded = testUtils.verifyToken(validToken);
            
            expect(decoded.userId).toBe('user123');
            expect(decoded.username).toBe('testuser');
        });

        test('should reject missing token', () => {
            expect(() => {
                testUtils.verifyToken();
            }).toThrow('Token is required');
        });

        test('should reject invalid token', () => {
            expect(() => {
                testUtils.verifyToken('invalid.token.here');
            }).toThrow('Invalid token');
        });

        test('should reject expired token', async () => {
            const expiredToken = testUtils.generateToken(payload, { expiresIn: '0s' });
            
            // Wait a moment to ensure expiration
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(() => {
                testUtils.verifyToken(expiredToken);
            }).toThrow('Token has expired');
        });

        test('should reject blacklisted token', () => {
            testUtils.blacklistToken(validToken);
            
            expect(() => {
                testUtils.verifyToken(validToken);
            }).toThrow('Token has been invalidated');
        });

        test('should handle different JWT errors', () => {
            // Test with token signed with different secret
            const differentSecretToken = jwt.sign(payload, 'different-secret');
            
            expect(() => {
                testUtils.verifyToken(differentSecretToken);
            }).toThrow('Invalid token');
        });
    });

    describe('Token Decoding', () => {
        test('should decode token without verification', () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };
            const token = testUtils.generateToken(payload);
            
            const decoded = testUtils.decodeToken(token);
            
            expect(decoded).toHaveProperty('header');
            expect(decoded).toHaveProperty('payload');
            expect(decoded).toHaveProperty('signature');
            expect(decoded.payload.userId).toBe('user123');
        });

        test('should reject invalid token format', () => {
            expect(() => {
                testUtils.decodeToken('invalid-token');
            }).toThrow();
        });
    });

    describe('Token Refresh', () => {
        test('should refresh valid token', async () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };
            const originalToken = testUtils.generateToken(payload);
            
            // Wait for next second to ensure different iat timestamp
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            const newToken = testUtils.refreshToken(originalToken);
            
            expect(newToken).toBeDefined();
            expect(newToken).not.toBe(originalToken);
            
            // Original token should be blacklisted
            expect(testUtils.isTokenBlacklisted(originalToken)).toBe(true);
            
            // New token should be valid
            const decoded = testUtils.verifyToken(newToken);
            expect(decoded.userId).toBe('user123');
        });
    });

    describe('Header Extraction', () => {
        test('should extract token from Bearer header', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
            const authHeader = `Bearer ${token}`;
            
            const extracted = testUtils.extractTokenFromHeader(authHeader);
            expect(extracted).toBe(token);
        });

        test('should return null for invalid header format', () => {
            expect(testUtils.extractTokenFromHeader('InvalidHeader')).toBeNull();
            expect(testUtils.extractTokenFromHeader('Basic token')).toBeNull();
            expect(testUtils.extractTokenFromHeader('')).toBeNull();
            expect(testUtils.extractTokenFromHeader()).toBeNull();
        });
    });

    describe('Token Utilities', () => {
        let token;

        beforeEach(() => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };
            token = testUtils.generateToken(payload);
        });

        test('should get token expiration', () => {
            const expiration = testUtils.getTokenExpiration(token);
            expect(expiration).toBeInstanceOf(Date);
            expect(expiration.getTime()).toBeGreaterThan(Date.now());
        });

        test('should check if token is expired', async () => {
            expect(testUtils.isTokenExpired(token)).toBe(false);
            
            const expiredToken = testUtils.generateToken({
                userId: 'user123',
                username: 'testuser'
            }, { expiresIn: '0s' });
            
            // Wait a moment for expiration
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(testUtils.isTokenExpired(expiredToken)).toBe(true);
        });
    });

    describe('Blacklist Management', () => {
        test('should blacklist and check tokens', () => {
            const token = 'test.token.here';
            
            expect(testUtils.isTokenBlacklisted(token)).toBe(false);
            
            testUtils.blacklistToken(token);
            expect(testUtils.isTokenBlacklisted(token)).toBe(true);
        });

        test('should get blacklist statistics', () => {
            const token1 = 'token1';
            const token2 = 'token2';
            
            testUtils.blacklistToken(token1);
            testUtils.blacklistToken(token2);
            
            const stats = testUtils.getBlacklistStats();
            expect(stats.totalBlacklisted).toBe(2);
            expect(stats.tokens).toContain(token1);
            expect(stats.tokens).toContain(token2);
        });

        test('should cleanup expired tokens from blacklist', async () => {
            // Create an expired token
            const expiredToken = testUtils.generateToken({
                userId: 'user123',
                username: 'testuser'
            }, { expiresIn: '0s' });
            
            const validToken = testUtils.generateToken({
                userId: 'user456',
                username: 'testuser2'
            });
            
            testUtils.blacklistToken(expiredToken);
            testUtils.blacklistToken(validToken);
            
            expect(testUtils.getBlacklistStats().totalBlacklisted).toBe(2);
            
            // Wait for expiration then cleanup
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const cleanedCount = testUtils.cleanupBlacklist();
            expect(cleanedCount).toBe(1); // Only expired token should be cleaned
            expect(testUtils.getBlacklistStats().totalBlacklisted).toBe(1);
            expect(testUtils.isTokenBlacklisted(validToken)).toBe(true);
        });
    });

    describe('Singleton Instance', () => {
        test('should provide working singleton instance', () => {
            const payload = {
                userId: 'user123',
                username: 'testuser'
            };

            const token = jwtUtils.generateToken(payload);
            expect(token).toBeDefined();
            
            const decoded = jwtUtils.verifyToken(token);
            expect(decoded.userId).toBe('user123');
        });
    });
});