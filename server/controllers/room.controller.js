const { Room, Message } = require('../models');

/**
 * Room controller handling room management operations
 */
class RoomController {
    /**
     * Get all available rooms
     * GET /api/rooms
     */
    static async getRooms(req, res) {
        try {
            // Get all active rooms
            const rooms = await Room.findActive();

            // Transform rooms to public format with participant counts
            const roomsData = rooms.map(room => ({
                ...room.toPublic(),
                createdAt: room.createdAt
            }));

            res.json({
                success: true,
                data: {
                    rooms: roomsData,
                    total: roomsData.length
                }
            });

        } catch (error) {
            console.error('Get rooms error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'ROOMS_FETCH_FAILED',
                    message: 'Failed to fetch rooms'
                }
            });
        }
    }

    /**
     * Get a specific room by ID
     * GET /api/rooms/:id
     */
    static async getRoomById(req, res) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_ID',
                        message: 'Room ID is required'
                    }
                });
            }

            const room = await Room.findById(id);

            if (!room) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_NOT_FOUND',
                        message: 'Room not found'
                    }
                });
            }

            if (!room.isActive) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_INACTIVE',
                        message: 'Room is not active'
                    }
                });
            }

            res.json({
                success: true,
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            console.error('Get room by ID error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'ROOM_FETCH_FAILED',
                    message: 'Failed to fetch room'
                }
            });
        }
    }

    /**
     * Create a new room
     * POST /api/rooms
     */
    static async createRoom(req, res) {
        try {
            const { name } = req.body;
            const userId = req.user.id;

            // Validate required fields
            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_NAME',
                        message: 'Room name is required'
                    }
                });
            }

            // Create room
            const room = await Room.create({
                name: name.trim(),
                createdBy: userId
            });

            res.status(201).json({
                success: true,
                message: 'Room created successfully',
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            console.error('Create room error:', error);

            // Handle specific error types
            if (error.code === 'VALIDATION_ERROR') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Room validation failed',
                        details: error.details
                    }
                });
            }

            if (error.code === 'ROOM_NAME_EXISTS') {
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'ROOM_NAME_EXISTS',
                        message: 'Room name already exists'
                    }
                });
            }

            // Generic error response
            res.status(500).json({
                success: false,
                error: {
                    code: 'ROOM_CREATION_FAILED',
                    message: 'Failed to create room'
                }
            });
        }
    }

    /**
     * Update room details
     * PUT /api/rooms/:id
     */
    static async updateRoom(req, res) {
        try {
            const { id } = req.params;
            const { name } = req.body;
            const userId = req.user.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_ID',
                        message: 'Room ID is required'
                    }
                });
            }

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_NAME',
                        message: 'Room name is required'
                    }
                });
            }

            const room = await Room.findById(id);

            if (!room) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_NOT_FOUND',
                        message: 'Room not found'
                    }
                });
            }

            // Check if user is the room creator
            if (room.createdBy !== userId) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Only the room creator can update room details'
                    }
                });
            }

            // Update room name
            await room.updateName(name.trim());

            res.json({
                success: true,
                message: 'Room updated successfully',
                data: {
                    room: room.toJSON()
                }
            });

        } catch (error) {
            console.error('Update room error:', error);

            if (error.code === 'VALIDATION_ERROR') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Room validation failed',
                        details: error.details
                    }
                });
            }

            if (error.code === 'ROOM_NAME_EXISTS') {
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'ROOM_NAME_EXISTS',
                        message: 'Room name already exists'
                    }
                });
            }

            res.status(500).json({
                success: false,
                error: {
                    code: 'ROOM_UPDATE_FAILED',
                    message: 'Failed to update room'
                }
            });
        }
    }

    /**
     * Delete a room
     * DELETE /api/rooms/:id
     */
    static async deleteRoom(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user.id;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_ID',
                        message: 'Room ID is required'
                    }
                });
            }

            const room = await Room.findById(id);

            if (!room) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_NOT_FOUND',
                        message: 'Room not found'
                    }
                });
            }

            // Check if user is the room creator
            if (room.createdBy !== userId) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'Only the room creator can delete the room'
                    }
                });
            }

            // Delete all messages in the room first
            await Message.deleteByRoom(id);

            // Delete the room
            await room.delete();

            res.json({
                success: true,
                message: 'Room deleted successfully'
            });

        } catch (error) {
            console.error('Delete room error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'ROOM_DELETION_FAILED',
                    message: 'Failed to delete room'
                }
            });
        }
    }

    /**
     * Get room message history
     * GET /api/rooms/:id/messages
     */
    static async getRoomMessages(req, res) {
        try {
            const { id } = req.params;
            const { limit = 50, offset = 0, order = 'desc' } = req.query;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'MISSING_ROOM_ID',
                        message: 'Room ID is required'
                    }
                });
            }

            // Verify room exists and is active
            const room = await Room.findById(id);
            if (!room) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_NOT_FOUND',
                        message: 'Room not found'
                    }
                });
            }

            if (!room.isActive) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'ROOM_INACTIVE',
                        message: 'Room is not active'
                    }
                });
            }

            // Parse pagination parameters
            const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 messages
            const offsetNum = Math.max(parseInt(offset) || 0, 0);
            const sortOrder = order === 'asc' ? 'asc' : 'desc';

            // Get messages
            const messages = await Message.findByRoom(id, {
                limit: limitNum,
                offset: offsetNum,
                sortOrder
            });

            // Get total message count for pagination info
            const totalMessages = await Message.countByRoom(id);

            // Transform messages to client format
            const messagesData = messages.map(message => message.toClient());

            res.json({
                success: true,
                data: {
                    messages: messagesData,
                    pagination: {
                        limit: limitNum,
                        offset: offsetNum,
                        total: totalMessages,
                        hasMore: offsetNum + limitNum < totalMessages
                    },
                    room: {
                        id: room.id,
                        name: room.name
                    }
                }
            });

        } catch (error) {
            console.error('Get room messages error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'MESSAGES_FETCH_FAILED',
                    message: 'Failed to fetch room messages'
                }
            });
        }
    }

    /**
     * Get rooms created by the current user
     * GET /api/rooms/my-rooms
     */
    static async getMyRooms(req, res) {
        try {
            const userId = req.user.id;

            const rooms = await Room.findByCreator(userId);

            // Transform rooms to include additional details
            const roomsData = rooms.map(room => ({
                ...room.toJSON(),
                messageCount: 0 // Will be populated if needed
            }));

            res.json({
                success: true,
                data: {
                    rooms: roomsData,
                    total: roomsData.length
                }
            });

        } catch (error) {
            console.error('Get my rooms error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'MY_ROOMS_FETCH_FAILED',
                    message: 'Failed to fetch your rooms'
                }
            });
        }
    }
}

module.exports = RoomController;