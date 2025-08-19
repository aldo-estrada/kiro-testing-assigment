// Routes index
const express = require('express');
const authRoutes = require('./auth.routes');
const roomRoutes = require('./room.routes');

const router = express.Router();

// Health check route
router.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Chat API is running',
        timestamp: new Date().toISOString()
    });
});

// Authentication routes
router.use('/auth', authRoutes);

// Room management routes
router.use('/rooms', roomRoutes);

module.exports = router;