const express = require('express');
const RoomController = require('../controllers/room.controller');
const { authenticateToken, rateLimiter } = require('../middleware');

const router = express.Router();

// Rate limiting for room operations
const roomRateLimit = rateLimiter(20, 15 * 60 * 1000); // 20 requests per 15 minutes
const createRoomRateLimit = rateLimiter(5, 15 * 60 * 1000); // 5 room creations per 15 minutes

/**
 * @route   GET /api/rooms
 * @desc    Get all available rooms
 * @access  Private
 */
router.get('/', authenticateToken, roomRateLimit, RoomController.getRooms);

/**
 * @route   GET /api/rooms/my-rooms
 * @desc    Get rooms created by current user
 * @access  Private
 * @note    This route must come before /:id to avoid conflicts
 */
router.get('/my-rooms', authenticateToken, roomRateLimit, RoomController.getMyRooms);

/**
 * @route   GET /api/rooms/:id
 * @desc    Get a specific room by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, roomRateLimit, RoomController.getRoomById);

/**
 * @route   POST /api/rooms
 * @desc    Create a new room
 * @access  Private
 */
router.post('/', authenticateToken, createRoomRateLimit, RoomController.createRoom);

/**
 * @route   PUT /api/rooms/:id
 * @desc    Update room details (creator only)
 * @access  Private
 */
router.put('/:id', authenticateToken, roomRateLimit, RoomController.updateRoom);

/**
 * @route   DELETE /api/rooms/:id
 * @desc    Delete a room (creator only)
 * @access  Private
 */
router.delete('/:id', authenticateToken, roomRateLimit, RoomController.deleteRoom);

/**
 * @route   GET /api/rooms/:id/messages
 * @desc    Get room message history
 * @access  Private
 */
router.get('/:id/messages', authenticateToken, roomRateLimit, RoomController.getRoomMessages);

module.exports = router;