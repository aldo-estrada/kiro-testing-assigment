const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { database } = require('../database');

/**
 * User model with validation and password management
 */
class User {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.username = data.username;
        this.passwordHash = data.passwordHash;
        this.createdAt = data.createdAt || new Date();
        this.lastActive = data.lastActive || new Date();
    }

    // Validation methods
    static validateUsername(username) {
        const errors = [];

        if (!username) {
            errors.push('Username is required');
        } else {
            if (typeof username !== 'string') {
                errors.push('Username must be a string');
            }
            if (username.length < 3) {
                errors.push('Username must be at least 3 characters long');
            }
            if (username.length > 30) {
                errors.push('Username must be no more than 30 characters long');
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                errors.push('Username can only contain letters, numbers, underscores, and hyphens');
            }
        }

        return errors;
    }

    static validatePassword(password) {
        const errors = [];

        if (!password) {
            errors.push('Password is required');
        } else {
            if (typeof password !== 'string') {
                errors.push('Password must be a string');
            }
            if (password.length < 6) {
                errors.push('Password must be at least 6 characters long');
            }
            if (password.length > 100) {
                errors.push('Password must be no more than 100 characters long');
            }
        }

        return errors;
    }

    static validate(userData) {
        const errors = [];

        // Validate username
        const usernameErrors = this.validateUsername(userData.username);
        errors.push(...usernameErrors);

        // Validate password (only if provided - for updates, password might not be included)
        if (userData.password !== undefined) {
            const passwordErrors = this.validatePassword(userData.password);
            errors.push(...passwordErrors);
        }

        return errors;
    }

    // Password utilities
    static async hashPassword(password) {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    }

    static async comparePassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Database operations
    static async create(userData) {
        // Validate input
        const validationErrors = this.validate(userData);
        if (validationErrors.length > 0) {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = validationErrors;
            throw error;
        }

        // Check if username already exists
        const existingUser = await this.findByUsername(userData.username);
        if (existingUser) {
            const error = new Error('Username already exists');
            error.code = 'USERNAME_EXISTS';
            throw error;
        }

        // Hash password
        const passwordHash = await this.hashPassword(userData.password);

        // Create user record
        const userRecord = {
            id: uuidv4(),
            username: userData.username,
            passwordHash: passwordHash,
            createdAt: new Date(),
            lastActive: new Date()
        };

        const created = await database.create('users', userRecord);
        return new User(created);
    }

    static async findById(id) {
        const record = await database.findById('users', id);
        return record ? new User(record) : null;
    }

    static async findByUsername(username) {
        const record = await database.findOne('users', { username });
        return record ? new User(record) : null;
    }

    static async findAll() {
        const records = await database.findMany('users');
        return records.map(record => new User(record));
    }

    static async authenticate(username, password) {
        // Find user by username
        const user = await this.findByUsername(username);
        if (!user) {
            const error = new Error('Invalid credentials');
            error.code = 'INVALID_CREDENTIALS';
            throw error;
        }

        // Verify password
        const isValid = await this.comparePassword(password, user.passwordHash);
        if (!isValid) {
            const error = new Error('Invalid credentials');
            error.code = 'INVALID_CREDENTIALS';
            throw error;
        }

        // Update last active timestamp
        await user.updateLastActive();

        return user;
    }

    // Instance methods
    async save() {
        const record = await database.updateById('users', this.id, {
            username: this.username,
            passwordHash: this.passwordHash,
            lastActive: this.lastActive
        });

        if (record) {
            Object.assign(this, record);
            return this;
        }
        return null;
    }

    async updateLastActive() {
        this.lastActive = new Date();
        return await this.save();
    }

    async updatePassword(newPassword) {
        // Validate new password
        const passwordErrors = User.validatePassword(newPassword);
        if (passwordErrors.length > 0) {
            const error = new Error('Password validation failed');
            error.code = 'VALIDATION_ERROR';
            error.details = passwordErrors;
            throw error;
        }

        // Hash new password
        this.passwordHash = await User.hashPassword(newPassword);
        return await this.save();
    }

    async delete() {
        return await database.deleteById('users', this.id);
    }

    // Serialization (exclude sensitive data)
    toJSON() {
        return {
            id: this.id,
            username: this.username,
            createdAt: this.createdAt,
            lastActive: this.lastActive
        };
    }

    toPublic() {
        return {
            id: this.id,
            username: this.username
        };
    }
}

module.exports = User;