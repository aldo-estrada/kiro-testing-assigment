const { v4: uuidv4 } = require('uuid');

/**
 * Simple in-memory database implementation
 * This can be easily replaced with a real database (MongoDB, PostgreSQL, etc.)
 */
class InMemoryDatabase {
    constructor() {
        this.users = new Map();
        this.rooms = new Map();
        this.messages = new Map();
        this.connected = false;
    }

    // Connection management
    async connect() {
        try {
            // Simulate connection delay
            await new Promise(resolve => setTimeout(resolve, 100));
            this.connected = true;
            console.log('Database connected successfully (in-memory)');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            throw error;
        }
    }

    async disconnect() {
        this.connected = false;
        console.log('Database disconnected');
    }

    isConnected() {
        return this.connected;
    }

    // Generic CRUD operations
    async create(collection, data) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        const id = data.id || uuidv4();
        const record = {
            ...data,
            id,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.getCollection(collection).set(id, record);
        return record;
    }

    async findById(collection, id) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        return this.getCollection(collection).get(id) || null;
    }

    async findOne(collection, query) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        const records = Array.from(this.getCollection(collection).values());
        return records.find(record => this.matchesQuery(record, query)) || null;
    }

    async findMany(collection, query = {}) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        const records = Array.from(this.getCollection(collection).values());
        return records.filter(record => this.matchesQuery(record, query));
    }

    async updateById(collection, id, updates) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        const record = this.getCollection(collection).get(id);
        if (!record) {
            return null;
        }

        const updatedRecord = {
            ...record,
            ...updates,
            updatedAt: new Date()
        };

        this.getCollection(collection).set(id, updatedRecord);
        return updatedRecord;
    }

    async deleteById(collection, id) {
        if (!this.connected) {
            throw new Error('Database not connected');
        }

        const record = this.getCollection(collection).get(id);
        if (record) {
            this.getCollection(collection).delete(id);
            return record;
        }
        return null;
    }

    // Helper methods
    getCollection(name) {
        switch (name) {
            case 'users':
                return this.users;
            case 'rooms':
                return this.rooms;
            case 'messages':
                return this.messages;
            default:
                throw new Error(`Unknown collection: ${name}`);
        }
    }

    matchesQuery(record, query) {
        return Object.keys(query).every(key => {
            if (query[key] === undefined) return true;
            return record[key] === query[key];
        });
    }

    // Statistics and health check
    getStats() {
        return {
            connected: this.connected,
            collections: {
                users: this.users.size,
                rooms: this.rooms.size,
                messages: this.messages.size
            }
        };
    }

    // Clear all data (useful for testing)
    async clear() {
        this.users.clear();
        this.rooms.clear();
        this.messages.clear();
    }
}

// Singleton instance
const database = new InMemoryDatabase();

module.exports = {
    database,
    InMemoryDatabase
};