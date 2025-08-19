const jwt = require('jsonwebtoken');

/**
 * JWT utility functions for token generation, validation, and management
 */
class JWTUtils {
    constructor() {
        this.secret = process.env.JWT_SECRET || 'default-secret-change-in-production';
        this.defaultOptions = {
            expiresIn: '24h', // 24 hours
            issuer: 'chat-web-room',
            audience: 'chat-users'
        };
        
        // Token blacklist for logout functionality
        this.blacklistedTokens = new Set();
    }

    /**
     * Generate a JWT token for a user
     * @param {Object} payload - User data to include in token
     * @param {Object} options - JWT options (optional)
     * @returns {string} JWT token
     */
    generateToken(payload, options = {}) {
        if (!payload || !payload.userId) {
            throw new Error('User ID is required for token generation');
        }

        const tokenPayload = {
            userId: payload.userId,
            username: payload.username
        };

        const tokenOptions = {
            ...this.defaultOptions,
            ...options
        };

        return jwt.sign(tokenPayload, this.secret, tokenOptions);
    }

    /**
     * Verify and decode a JWT token
     * @param {string} token - JWT token to verify
     * @param {Object} options - Verification options (optional)
     * @returns {Object} Decoded token payload
     */
    verifyToken(token, options = {}) {
        if (!token) {
            const error = new Error('Token is required');
            error.code = 'TOKEN_REQUIRED';
            throw error;
        }

        // Check if token is blacklisted
        if (this.isTokenBlacklisted(token)) {
            const error = new Error('Token has been invalidated');
            error.code = 'TOKEN_BLACKLISTED';
            throw error;
        }

        try {
            const verifyOptions = {
                issuer: this.defaultOptions.issuer,
                audience: this.defaultOptions.audience,
                ...options
            };

            const decoded = jwt.verify(token, this.secret, verifyOptions);
            return decoded;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                const customError = new Error('Token has expired');
                customError.code = 'TOKEN_EXPIRED';
                throw customError;
            } else if (error.name === 'JsonWebTokenError') {
                const customError = new Error('Invalid token');
                customError.code = 'TOKEN_INVALID';
                throw customError;
            } else if (error.name === 'NotBeforeError') {
                const customError = new Error('Token not active yet');
                customError.code = 'TOKEN_NOT_ACTIVE';
                throw customError;
            }
            throw error;
        }
    }

    /**
     * Decode token without verification (for debugging/inspection)
     * @param {string} token - JWT token to decode
     * @returns {Object} Decoded token payload
     */
    decodeToken(token) {
        if (!token) {
            throw new Error('Token is required');
        }

        const decoded = jwt.decode(token, { complete: true });
        if (!decoded) {
            throw new Error('Invalid token format');
        }
        
        return decoded;
    }

    /**
     * Refresh a token (generate new token with updated expiration)
     * @param {string} token - Current valid token
     * @param {Object} options - New token options (optional)
     * @returns {string} New JWT token
     */
    refreshToken(token, options = {}) {
        const decoded = this.verifyToken(token);
        
        // Blacklist the old token
        this.blacklistToken(token);
        
        // Generate new token with same payload but updated timestamp
        // Add a small delay to ensure different iat timestamp
        const newPayload = {
            userId: decoded.userId,
            username: decoded.username
        };
        
        return this.generateToken(newPayload, options);
    }

    /**
     * Extract token from Authorization header
     * @param {string} authHeader - Authorization header value
     * @returns {string|null} JWT token or null if not found
     */
    extractTokenFromHeader(authHeader) {
        if (!authHeader) {
            return null;
        }

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }

    /**
     * Get token expiration date
     * @param {string} token - JWT token
     * @returns {Date} Expiration date
     */
    getTokenExpiration(token) {
        const decoded = this.decodeToken(token);
        if (!decoded.payload.exp) {
            return null;
        }
        return new Date(decoded.payload.exp * 1000);
    }

    /**
     * Check if token is expired
     * @param {string} token - JWT token
     * @returns {boolean} True if expired
     */
    isTokenExpired(token) {
        try {
            this.verifyToken(token);
            return false;
        } catch (error) {
            return error.code === 'TOKEN_EXPIRED';
        }
    }

    /**
     * Blacklist a token (for logout functionality)
     * @param {string} token - JWT token to blacklist
     */
    blacklistToken(token) {
        if (token) {
            this.blacklistedTokens.add(token);
        }
    }

    /**
     * Check if token is blacklisted
     * @param {string} token - JWT token to check
     * @returns {boolean} True if blacklisted
     */
    isTokenBlacklisted(token) {
        return this.blacklistedTokens.has(token);
    }

    /**
     * Clear expired tokens from blacklist (cleanup)
     */
    cleanupBlacklist() {
        const tokensToRemove = [];
        
        for (const token of this.blacklistedTokens) {
            try {
                const decoded = this.decodeToken(token);
                const exp = decoded.payload.exp;
                if (exp && Date.now() >= exp * 1000) {
                    tokensToRemove.push(token);
                }
            } catch (error) {
                // If token can't be decoded, remove it
                tokensToRemove.push(token);
            }
        }

        tokensToRemove.forEach(token => {
            this.blacklistedTokens.delete(token);
        });

        return tokensToRemove.length;
    }

    /**
     * Get blacklist statistics
     * @returns {Object} Blacklist stats
     */
    getBlacklistStats() {
        return {
            totalBlacklisted: this.blacklistedTokens.size,
            tokens: Array.from(this.blacklistedTokens)
        };
    }
}

// Create singleton instance
const jwtUtils = new JWTUtils();

module.exports = {
    JWTUtils,
    jwtUtils
};