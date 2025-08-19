const { database } = require('./connection');

/**
 * Database initialization and configuration
 */
class DatabaseManager {
    constructor() {
        this.db = database;
        this.connectionRetries = 3;
        this.retryDelay = 1000; // 1 second
    }

    async initialize() {
        let attempts = 0;
        
        while (attempts < this.connectionRetries) {
            try {
                await this.db.connect();
                console.log('Database initialized successfully');
                
                // Run any initialization scripts
                await this.runInitialSetup();
                
                return true;
            } catch (error) {
                attempts++;
                console.error(`Database connection attempt ${attempts} failed:`, error.message);
                
                if (attempts < this.connectionRetries) {
                    console.log(`Retrying in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                } else {
                    console.error('All database connection attempts failed');
                    throw error;
                }
            }
        }
    }

    async runInitialSetup() {
        // Create default rooms if none exist
        const existingRooms = await this.db.findMany('rooms');
        
        if (existingRooms.length === 0) {
            console.log('Creating default chat rooms...');
            
            const defaultRooms = [
                {
                    name: 'General',
                    createdBy: 'system',
                    participants: [],
                    isActive: true
                },
                {
                    name: 'Random',
                    createdBy: 'system',
                    participants: [],
                    isActive: true
                }
            ];

            for (const roomData of defaultRooms) {
                await this.db.create('rooms', roomData);
            }
            
            console.log(`Created ${defaultRooms.length} default rooms`);
        }
    }

    async healthCheck() {
        try {
            if (!this.db.isConnected()) {
                throw new Error('Database not connected');
            }

            // Test basic operations
            const testId = 'health-check-test';
            const testData = { id: testId, test: true };
            
            // Create test record
            await this.db.create('users', testData);
            
            // Read test record
            const retrieved = await this.db.findById('users', testId);
            if (!retrieved || retrieved.test !== true) {
                throw new Error('Database read operation failed');
            }
            
            // Delete test record
            await this.db.deleteById('users', testId);
            
            return {
                status: 'healthy',
                stats: this.db.getStats(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async shutdown() {
        try {
            await this.db.disconnect();
            console.log('Database connection closed');
        } catch (error) {
            console.error('Error closing database connection:', error);
        }
    }

    // Getter for database instance
    getDatabase() {
        return this.db;
    }
}

// Create singleton instance
const dbManager = new DatabaseManager();

module.exports = {
    dbManager,
    database: dbManager.getDatabase()
};