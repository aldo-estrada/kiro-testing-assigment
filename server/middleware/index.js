const { jwtUtils } = require('../utils/jwt');
const { User } = require('../models');

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    
    res.status(statusCode).json({
        success: false,
        error: {
            code: err.code || 'INTERNAL_ERROR',
            message: message,
            ...(process.env.NODE_ENV === 'development' && { details: err.stack })
        }
    });
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = jwtUtils.extractTokenFromHeader(authHeader);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'TOKEN_REQUIRED',
                    message: 'Authentication token is required'
                }
            });
        }

        // Verify token
        const decoded = jwtUtils.verifyToken(token);
        
        // Get user from database to ensure they still exist
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User associated with token not found'
                }
            });
        }

        // Attach user info to request
        req.user = {
            id: user.id,
            username: user.username
        };
        req.token = token;

        next();
    } catch (error) {
        let statusCode = 401;
        let errorCode = 'AUTHENTICATION_FAILED';
        let errorMessage = 'Authentication failed';

        switch (error.code) {
            case 'TOKEN_REQUIRED':
                errorMessage = 'Authentication token is required';
                break;
            case 'TOKEN_EXPIRED':
                errorMessage = 'Authentication token has expired';
                break;
            case 'TOKEN_INVALID':
                errorMessage = 'Invalid authentication token';
                break;
            case 'TOKEN_BLACKLISTED':
                errorMessage = 'Authentication token has been invalidated';
                break;
            case 'TOKEN_NOT_ACTIVE':
                errorMessage = 'Authentication token is not yet active';
                break;
            default:
                errorMessage = error.message || 'Authentication failed';
        }

        return res.status(statusCode).json({
            success: false,
            error: {
                code: errorCode,
                message: errorMessage
            }
        });
    }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = jwtUtils.extractTokenFromHeader(authHeader);

        if (token) {
            const decoded = jwtUtils.verifyToken(token);
            const user = await User.findById(decoded.userId);
            
            if (user) {
                req.user = {
                    id: user.id,
                    username: user.username
                };
                req.token = token;
            }
        }

        next();
    } catch (error) {
        // For optional auth, we don't fail on errors, just continue without user
        next();
    }
};

// Middleware to check if user is authenticated (after authenticateToken)
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authentication is required for this endpoint'
            }
        });
    }
    next();
};

// Rate limiting middleware (simple implementation)
const rateLimiter = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
    const requests = new Map();

    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        if (requests.has(clientId)) {
            const clientRequests = requests.get(clientId);
            const validRequests = clientRequests.filter(timestamp => timestamp > windowStart);
            requests.set(clientId, validRequests);
        }

        // Check current request count
        const currentRequests = requests.get(clientId) || [];
        
        if (currentRequests.length >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many requests, please try again later'
                }
            });
        }

        // Add current request
        currentRequests.push(now);
        requests.set(clientId, currentRequests);

        next();
    };
};

// CORS middleware
const corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
};

module.exports = {
    errorHandler,
    authenticateToken,
    optionalAuth,
    requireAuth,
    rateLimiter,
    corsMiddleware
};