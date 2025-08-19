const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { dbManager } = require('./database');
const { errorHandler } = require('./middleware');
const apiRoutes = require('./routes');
const SocketHandler = require('./socket/socketHandler');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Socket.io handler
let socketHandler;
const initializeSocketHandler = () => {
  socketHandler = new SocketHandler(io);
  console.log('Socket.io handler initialized');
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../client')));

// API routes
app.use('/api', apiRoutes);

// Basic route for serving the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Health check endpoint (also available via API routes)
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await dbManager.healthCheck();
    res.json({ 
      status: 'OK', 
      message: 'Chat server is running',
      database: dbHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Server health check failed',
      error: error.message
    });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Socket.io will be initialized after database connection

const PORT = process.env.PORT || 3000;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    await dbManager.initialize();
    
    // Initialize Socket.io handler
    initializeSocketHandler();
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`Chat server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await dbManager.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await dbManager.shutdown();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { app, server, io, dbManager, getSocketHandler: () => socketHandler };