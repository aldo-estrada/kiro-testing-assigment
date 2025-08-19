const { v4: uuidv4 } = require('uuid');
const { database } = require('../database');

/**
 * Room model with participant tracking and management
 */
class Room {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.name = data.name;
        this.createdBy = data.createdBy;
        this.createdAt = data.createdAt || new Date();
        this.participants = data.participants || [];
        this.isActive = data.isActive !== undefined ? data.isActive : true;
    }

    // Validation methods
    static validateName(name) {
        const errors = [];

        if (!name) {
            errors.push('Room name is required');
        } else {
            if (typeof name !== 'string') {
                errors.push('Room name must be a string');
            } else {
                if (name.trim().length < 1) {
                    errors.push('Room name cannot be empty');
                }
                if (name.length > 50) {
                    errors.push('Room name must be no more than 50 characters long');
                }
                if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
                    errors.push('Room name can only contain letters, numbers, spaces, underscores, and hyphens');
                }
            }
        }

        return errors;
    }

    static validate(roomData) {
        const errors = [];

        // Validate room name
        const nameErrors = this.validateName(roomData.name);
        errors.push(...nameErrors);

        // Validate createdBy (should be a user ID)
        if (!roomData.createdBy) {
            errors.push('Room creator is required');
        } else if (typeof roomData.createdBy !== 'string') {
            errors.push('Room creator must be a valid user ID');
        }

        // Validate participants array if provided
        if (roomData.participants !== undefined) {
            if (!Array.isArray(roomData.participants)) {
                errors.push('Participants must be an array');
            } else {
                roomData.participants.forEach((participantId, index) => {
                    if (typeof participantId !== 'string') {
                        errors.push(`Participant at index ${index} must be a valid user ID`);
                    }
                });
            }
        }

        return errors;
    }

    // Database operations
    static async create(roomData) {
        // Validate input
        const validationErrors = this.validate(roomData);
        if (validationErrors.length > 0) {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = validationErrors;
            throw error;
        }

        // Check if room name already exists
        const existingRoom = await this.findByName(roomData.name.trim());
        if (existingRoom) {
            const error = new Error('Room name already exists');
            error.code = 'ROOM_NAME_EXISTS';
            throw error;
        }

        // Create room record
        const roomRecord = {
            id: uuidv4(),
            name: roomData.name.trim(),
            createdBy: roomData.createdBy,
            createdAt: new Date(),
            participants: roomData.participants || [],
            isActive: roomData.isActive !== undefined ? roomData.isActive : true
        };

        const created = await database.create('rooms', roomRecord);
        return new Room(created);
    }

    static async findById(id) {
        const record = await database.findById('rooms', id);
        return record ? new Room(record) : null;
    }

    static async findByName(name) {
        const record = await database.findOne('rooms', { name: name.trim() });
        return record ? new Room(record) : null;
    }

    static async findAll() {
        const records = await database.findMany('rooms');
        return records.map(record => new Room(record));
    }

    static async findActive() {
        const records = await database.findMany('rooms', { isActive: true });
        return records.map(record => new Room(record));
    }

    static async findByCreator(creatorId) {
        const records = await database.findMany('rooms', { createdBy: creatorId });
        return records.map(record => new Room(record));
    }

    // Instance methods
    async save() {
        const record = await database.updateById('rooms', this.id, {
            name: this.name,
            createdBy: this.createdBy,
            participants: this.participants,
            isActive: this.isActive
        });

        if (record) {
            Object.assign(this, record);
            return this;
        }
        return null;
    }

    async delete() {
        return await database.deleteById('rooms', this.id);
    }

    // Participant management
    async addParticipant(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid user ID is required');
        }

        if (!this.participants.includes(userId)) {
            this.participants.push(userId);
            await this.save();
        }

        return this;
    }

    async removeParticipant(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid user ID is required');
        }

        const index = this.participants.indexOf(userId);
        if (index > -1) {
            this.participants.splice(index, 1);
            await this.save();
        }

        return this;
    }

    hasParticipant(userId) {
        return this.participants.includes(userId);
    }

    getParticipantCount() {
        return this.participants.length;
    }

    async clearParticipants() {
        this.participants = [];
        await this.save();
        return this;
    }

    // Room status management
    async activate() {
        this.isActive = true;
        await this.save();
        return this;
    }

    async deactivate() {
        this.isActive = false;
        await this.save();
        return this;
    }

    // Utility methods
    async updateName(newName) {
        // Validate new name
        const nameErrors = Room.validateName(newName);
        if (nameErrors.length > 0) {
            const error = new Error('Room name validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = nameErrors;
            throw error;
        }

        // Check if new name already exists (excluding current room)
        const existingRoom = await Room.findByName(newName.trim());
        if (existingRoom && existingRoom.id !== this.id) {
            const error = new Error('Room name already exists');
            error.code = 'ROOM_NAME_EXISTS';
            throw error;
        }

        this.name = newName.trim();
        await this.save();
        return this;
    }

    // Serialization
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
            participantCount: this.getParticipantCount(),
            isActive: this.isActive
        };
    }

    toPublic() {
        return {
            id: this.id,
            name: this.name,
            participantCount: this.getParticipantCount(),
            isActive: this.isActive
        };
    }

    toDetailed() {
        return {
            id: this.id,
            name: this.name,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
            participants: this.participants,
            participantCount: this.getParticipantCount(),
            isActive: this.isActive
        };
    }
}

module.exports = Room;