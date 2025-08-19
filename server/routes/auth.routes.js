const express = require('express');
const AuthController = require('../controllers/auth.controller');
const { authenticateToken, rateLimiter } = require('../middleware');

const router = express.Router();

// Rate limiting for auth endpoints
const authRateLimit = rateLimiter(10, 15 * 60 * 1000); // 10 requests per 15 minutes
const loginRateLimit = rateLimiter(5, 15 * 60 * 1000); // 5 login attempts per 15 minutes

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', authRateLimit, AuthController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', loginRateLimit, AuthController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (blacklist token)
 * @access  Private
 */
router.post('/logout', authenticateToken, AuthController.logout);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', authenticateToken, AuthController.refresh);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, AuthController.getProfile);

/**
 * @route   PUT /api/auth/password
 * @desc    Update user password
 * @access  Private
 */
router.put('/password', authenticateToken, AuthController.updatePassword);

module.exports = router;