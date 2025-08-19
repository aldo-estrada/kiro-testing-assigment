const { User } = require('../models');
const { jwtUtils } = require('../utils/jwt');

/**
 * Authentication controller handling user registration, login, and logout
 */
class AuthController {
    /**
     * Register a new user
     * POST /api/auth/register
     */
    static async register(req, res) {
        try {
            const { username, password } = req.body;

            // Validate required fields
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Username and password are required'
                    }
                });
            }

            // Create user (validation happens in User model)
            const user = await User.create({
                username: username.trim(),
                password
            });

            // Generate JWT token
            const token = jwtUtils.generateToken({
                userId: user.id,
                username: user.username
            });

            // Return success response with token and user info
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: user.toJSON(),
                    token
                }
            });

        } catch (error) {
            console.error('Registration error:', error);

            // Handle specific error types
            if (error.code === 'VALIDATION_ERROR') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Validation failed',
                        details: error.details
                    }
                });
            }

            if (error.code === 'USERNAME_EXISTS') {
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'USERNAME_EXISTS',
                        message: 'Username already exists'
                    }
                });
            }

            // Generic error response
            res.status(500).json({
                success: false,
                error: {
                    code: 'REGISTRATION_FAILED',
                    message: 'Registration failed. Please try again.'
                }
            });
        }
    }

    /**
     * Login user
     * POST /api/auth/login
     */
    static async login(req, res) {
        try {
            const { username, password } = req.body;

            // Validate required fields
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Username and password are required'
                    }
                });
            }

            // Authenticate user
            const user = await User.authenticate(username.trim(), password);

            // Generate JWT token
            const token = jwtUtils.generateToken({
                userId: user.id,
                username: user.username
            });

            // Return success response
            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    user: user.toJSON(),
                    token
                }
            });

        } catch (error) {
            console.error('Login error:', error);

            // Handle authentication errors
            if (error.code === 'INVALID_CREDENTIALS') {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: 'Invalid username or password'
                    }
                });
            }

            // Generic error response
            res.status(500).json({
                success: false,
                error: {
                    code: 'LOGIN_FAILED',
                    message: 'Login failed. Please try again.'
                }
            });
        }
    }

    /**
     * Logout user
     * POST /api/auth/logout
     */
    static async logout(req, res) {
        try {
            // Get token from request (set by authenticateToken middleware)
            const token = req.token;

            if (token) {
                // Blacklist the token
                jwtUtils.blacklistToken(token);
            }

            res.json({
                success: true,
                message: 'Logout successful'
            });

        } catch (error) {
            console.error('Logout error:', error);

            // Even if there's an error, we should still respond with success
            // since the client should clear their token anyway
            res.json({
                success: true,
                message: 'Logout successful'
            });
        }
    }

    /**
     * Refresh JWT token
     * POST /api/auth/refresh
     */
    static async refresh(req, res) {
        try {
            const token = req.token;

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'TOKEN_REQUIRED',
                        message: 'Authentication token is required'
                    }
                });
            }

            // Generate new token
            const newToken = jwtUtils.refreshToken(token);

            res.json({
                success: true,
                message: 'Token refreshed successfully',
                data: {
                    token: newToken
                }
            });

        } catch (error) {
            console.error('Token refresh error:', error);

            let statusCode = 401;
            let errorCode = 'TOKEN_REFRESH_FAILED';
            let errorMessage = 'Token refresh failed';

            if (error.code === 'TOKEN_EXPIRED') {
                errorMessage = 'Token has expired';
            } else if (error.code === 'TOKEN_INVALID') {
                errorMessage = 'Invalid token';
            } else if (error.code === 'TOKEN_BLACKLISTED') {
                errorMessage = 'Token has been invalidated';
            }

            res.status(statusCode).json({
                success: false,
                error: {
                    code: errorCode,
                    message: errorMessage
                }
            });
        }
    }

    /**
     * Get current user profile
     * GET /api/auth/profile
     */
    static async getProfile(req, res) {
        try {
            // User info is set by authenticateToken middleware
            const userId = req.user.id;

            // Get fresh user data from database
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found'
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    user: user.toJSON()
                }
            });

        } catch (error) {
            console.error('Get profile error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'PROFILE_FETCH_FAILED',
                    message: 'Failed to fetch user profile'
                }
            });
        }
    }

    /**
     * Update user password
     * PUT /api/auth/password
     */
    static async updatePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.id;

            // Validate required fields
            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_FIELDS',
                        message: 'Current password and new password are required'
                    }
                });
            }

            // Get user from database
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found'
                    }
                });
            }

            // Verify current password
            const isCurrentPasswordValid = await User.comparePassword(currentPassword, user.passwordHash);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_CURRENT_PASSWORD',
                        message: 'Current password is incorrect'
                    }
                });
            }

            // Update password
            await user.updatePassword(newPassword);

            res.json({
                success: true,
                message: 'Password updated successfully'
            });

        } catch (error) {
            console.error('Password update error:', error);

            if (error.code === 'VALIDATION_ERROR') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Password validation failed',
                        details: error.details
                    }
                });
            }

            res.status(500).json({
                success: false,
                error: {
                    code: 'PASSWORD_UPDATE_FAILED',
                    message: 'Failed to update password'
                }
            });
        }
    }
}

module.exports = AuthController;