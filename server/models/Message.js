const { v4: uuidv4 } = require('uuid');
const { database } = require('../database');

/**
 * Message model for chat history and real-time messaging
 */
class Message {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.roomId = data.roomId;
        this.senderId = data.senderId;
        this.senderUsername = data.senderUsername;
        this.content = data.content;
        this.timestamp = data.timestamp || new Date();
        this.messageType = data.messageType || 'message'; // 'message' | 'notification'
    }

    // Validation methods
    static validateContent(content) {
        const errors = [];

        if (!content) {
            errors.push('Message content is required');
        } else {
            if (typeof content !== 'string') {
                errors.push('Message content must be a string');
            } else {
                if (content.trim().length < 1) {
                    errors.push('Message content cannot be empty');
                }
                if (content.length > 1000) {
                    errors.push('Message content must be no more than 1000 characters long');
                }
            }
        }

        return errors;
    }

    static validateMessageType(messageType) {
        const validTypes = ['message', 'notification'];
        const errors = [];

        if (messageType && !validTypes.includes(messageType)) {
            errors.push(`Message type must be one of: ${validTypes.join(', ')}`);
        }

        return errors;
    }

    static validate(messageData) {
        const errors = [];

        // Validate required fields
        if (!messageData.roomId) {
            errors.push('Room ID is required');
        } else if (typeof messageData.roomId !== 'string') {
            errors.push('Room ID must be a valid string');
        }

        if (!messageData.senderId) {
            errors.push('Sender ID is required');
        } else if (typeof messageData.senderId !== 'string') {
            errors.push('Sender ID must be a valid string');
        }

        if (!messageData.senderUsername) {
            errors.push('Sender username is required');
        } else if (typeof messageData.senderUsername !== 'string') {
            errors.push('Sender username must be a valid string');
        }

        // Validate content
        const contentErrors = this.validateContent(messageData.content);
        errors.push(...contentErrors);

        // Validate message type if provided
        if (messageData.messageType !== undefined) {
            const typeErrors = this.validateMessageType(messageData.messageType);
            errors.push(...typeErrors);
        }

        return errors;
    }

    // Database operations
    static async create(messageData) {
        // Validate input
        const validationErrors = this.validate(messageData);
        if (validationErrors.length > 0) {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = validationErrors;
            throw error;
        }

        // Create message record
        const messageRecord = {
            id: uuidv4(),
            roomId: messageData.roomId,
            senderId: messageData.senderId,
            senderUsername: messageData.senderUsername,
            content: messageData.content.trim(),
            timestamp: new Date(),
            messageType: messageData.messageType || 'message'
        };

        const created = await database.create('messages', messageRecord);
        return new Message(created);
    }

    static async findById(id) {
        const record = await database.findById('messages', id);
        return record ? new Message(record) : null;
    }

    static async findByRoom(roomId, options = {}) {
        const { limit = 50, offset = 0, sortOrder = 'desc' } = options;
        
        // Get all messages for the room
        const allMessages = await database.findMany('messages', { roomId });
        
        // Sort by timestamp
        allMessages.sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
        });

        // Apply pagination
        const paginatedMessages = allMessages.slice(offset, offset + limit);
        
        return paginatedMessages.map(record => new Message(record));
    }

    static async findBySender(senderId, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const allMessages = await database.findMany('messages', { senderId });
        
        // Sort by timestamp (newest first)
        allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Apply pagination
        const paginatedMessages = allMessages.slice(offset, offset + limit);
        
        return paginatedMessages.map(record => new Message(record));
    }

    static async findByType(messageType, options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const allMessages = await database.findMany('messages', { messageType });
        
        // Sort by timestamp (newest first)
        allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Apply pagination
        const paginatedMessages = allMessages.slice(offset, offset + limit);
        
        return paginatedMessages.map(record => new Message(record));
    }

    static async findRecent(options = {}) {
        const { limit = 50, roomId = null } = options;
        
        let allMessages;
        if (roomId) {
            allMessages = await database.findMany('messages', { roomId });
        } else {
            allMessages = await database.findMany('messages');
        }
        
        // Sort by timestamp (newest first)
        allMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Apply limit
        const recentMessages = allMessages.slice(0, limit);
        
        return recentMessages.map(record => new Message(record));
    }

    static async countByRoom(roomId) {
        const messages = await database.findMany('messages', { roomId });
        return messages.length;
    }

    static async deleteByRoom(roomId) {
        const messages = await database.findMany('messages', { roomId });
        const deletePromises = messages.map(message => 
            database.deleteById('messages', message.id)
        );
        
        const results = await Promise.all(deletePromises);
        return results.filter(result => result !== null).length;
    }

    // Static utility methods
    static createNotification(roomId, content, senderId = 'system', senderUsername = 'System') {
        return this.create({
            roomId,
            senderId,
            senderUsername,
            content,
            messageType: 'notification'
        });
    }

    static async createUserJoinedNotification(roomId, username) {
        return this.createNotification(roomId, `${username} joined the room`);
    }

    static async createUserLeftNotification(roomId, username) {
        return this.createNotification(roomId, `${username} left the room`);
    }

    // Instance methods
    async save() {
        const record = await database.updateById('messages', this.id, {
            roomId: this.roomId,
            senderId: this.senderId,
            senderUsername: this.senderUsername,
            content: this.content,
            messageType: this.messageType
        });

        if (record) {
            Object.assign(this, record);
            return this;
        }
        return null;
    }

    async delete() {
        return await database.deleteById('messages', this.id);
    }

    // Content manipulation
    async updateContent(newContent) {
        // Validate new content
        const contentErrors = Message.validateContent(newContent);
        if (contentErrors.length > 0) {
            const error = new Error('Content validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = contentErrors;
            throw error;
        }

        this.content = newContent.trim();
        return await this.save();
    }

    // Utility methods
    isNotification() {
        return this.messageType === 'notification';
    }

    isMessage() {
        return this.messageType === 'message';
    }

    getAge() {
        return Date.now() - new Date(this.timestamp).getTime();
    }

    isRecent(maxAgeMs = 300000) { // 5 minutes default
        return this.getAge() < maxAgeMs;
    }

    // Serialization
    toJSON() {
        return {
            id: this.id,
            roomId: this.roomId,
            senderId: this.senderId,
            senderUsername: this.senderUsername,
            content: this.content,
            timestamp: this.timestamp,
            messageType: this.messageType
        };
    }

    toPublic() {
        return {
            id: this.id,
            senderUsername: this.senderUsername,
            content: this.content,
            timestamp: this.timestamp,
            messageType: this.messageType
        };
    }

    toClient() {
        return {
            id: this.id,
            sender: this.senderUsername,
            message: this.content,
            timestamp: this.timestamp,
            type: this.messageType
        };
    }
}

module.exports = Message;