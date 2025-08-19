/**
 * Socket.io client connection module
 */
class SocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentRoom = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.eventHandlers = new Map();
        this.connectionCallbacks = [];
        this.disconnectionCallbacks = [];
    }

    /**
     * Initialize Socket.io connection
     */
    async connect() {
        try {
            const token = Auth.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }

            // Initialize Socket.io connection with authentication
            this.socket = io({
                auth: {
                    token: token
                },
                transports: ['websocket', 'polling'],
                timeout: 10000,
                forceNew: true
            });

            this.setupEventHandlers();
            
            // Wait for connection
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.socket.on('connect', () => {
                    clearTimeout(timeout);
                    this.handleConnection();
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    clearTimeout(timeout);
                    this.handleConnectionError(error);
                    reject(error);
                });
            });

        } catch (error) {
            console.error('Socket connection error:', error);
            throw error;
        }
    }

    /**
     * Set up Socket.io event handlers
     */
    setupEventHandlers() {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => this.handleConnection());
        this.socket.on('disconnect', (reason) => this.handleDisconnection(reason));
        this.socket.on('connect_error', (error) => this.handleConnectionError(error));
        this.socket.on('reconnect', (attemptNumber) => this.handleReconnection(attemptNumber));
        this.socket.on('reconnect_error', (error) => this.handleReconnectionError(error));
        this.socket.on('reconnect_failed', () => this.handleReconnectionFailed());

        // Server confirmation events
        this.socket.on('connected', (data) => this.handleServerConfirmation(data));

        // Room events
        this.socket.on('room-joined', (data) => this.handleRoomJoined(data));
        this.socket.on('room-left', (data) => this.handleRoomLeft(data));
        this.socket.on('user-joined', (data) => this.handleUserJoined(data));
        this.socket.on('user-left', (data) => this.handleUserLeft(data));

        // Message events
        this.socket.on('new-message', (data) => this.handleNewMessage(data));

        // Participant events
        this.socket.on('participants-update', (data) => this.handleParticipantsUpdate(data));
        this.socket.on('room-participants', (data) => this.handleRoomParticipants(data));

        // Error events
        this.socket.on('error', (data) => this.handleServerError(data));

        // Typing events (for future implementation)
        this.socket.on('user-typing', (data) => this.handleUserTyping(data));
        this.socket.on('user-stopped-typing', (data) => this.handleUserStoppedTyping(data));
    }

    /**
     * Handle successful connection
     */
    handleConnection() {
        console.log('Socket.io connected:', this.socket.id);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Notify connection callbacks
        this.connectionCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Connection callback error:', error);
            }
        });

        // Emit custom event
        this.emit('connection-status-changed', { connected: true });
    }

    /**
     * Handle disconnection
     */
    handleDisconnection(reason) {
        console.log('Socket.io disconnected:', reason);
        this.isConnected = false;
        this.currentRoom = null;

        // Notify disconnection callbacks
        this.disconnectionCallbacks.forEach(callback => {
            try {
                callback(reason);
            } catch (error) {
                console.error('Disconnection callback error:', error);
            }
        });

        // Emit custom event
        this.emit('connection-status-changed', { connected: false, reason });
    }

    /**
     * Handle connection error
     */
    handleConnectionError(error) {
        console.error('Socket.io connection error:', error);
        this.isConnected = false;

        // Emit custom event
        this.emit('connection-error', { error: error.message });
    }

    /**
     * Handle successful reconnection
     */
    handleReconnection(attemptNumber) {
        console.log('Socket.io reconnected after', attemptNumber, 'attempts');
        this.reconnectAttempts = 0;

        // Rejoin current room if we were in one
        if (this.currentRoom) {
            this.joinRoom(this.currentRoom);
        }

        // Emit custom event
        this.emit('reconnected', { attempts: attemptNumber });
    }

    /**
     * Handle reconnection error
     */
    handleReconnectionError(error) {
        this.reconnectAttempts++;
        console.error(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);

        // Emit custom event
        this.emit('reconnection-error', { 
            error: error.message, 
            attempts: this.reconnectAttempts 
        });
    }

    /**
     * Handle reconnection failure
     */
    handleReconnectionFailed() {
        console.error('Socket.io reconnection failed after maximum attempts');
        
        // Emit custom event
        this.emit('reconnection-failed', { 
            maxAttempts: this.maxReconnectAttempts 
        });
    }

    /**
     * Handle server confirmation
     */
    handleServerConfirmation(data) {
        console.log('Server confirmation:', data);
        this.emit('server-confirmation', data);
    }

    /**
     * Handle room joined event
     */
    handleRoomJoined(data) {
        console.log('Room joined:', data);
        this.currentRoom = data.roomId;
        this.emit('room-joined', data);
    }

    /**
     * Handle room left event
     */
    handleRoomLeft(data) {
        console.log('Room left:', data);
        this.currentRoom = null;
        this.emit('room-left', data);
    }

    /**
     * Handle user joined event
     */
    handleUserJoined(data) {
        console.log('User joined:', data);
        this.emit('user-joined', data);
    }

    /**
     * Handle user left event
     */
    handleUserLeft(data) {
        console.log('User left:', data);
        this.emit('user-left', data);
    }

    /**
     * Handle new message event
     */
    handleNewMessage(data) {
        console.log('New message:', data);
        this.emit('new-message', data);
    }

    /**
     * Handle participants update event
     */
    handleParticipantsUpdate(data) {
        console.log('Participants update:', data);
        this.emit('participants-update', data);
    }

    /**
     * Handle room participants event
     */
    handleRoomParticipants(data) {
        console.log('Room participants:', data);
        this.emit('room-participants', data);
    }

    /**
     * Handle server error event
     */
    handleServerError(data) {
        console.error('Server error:', data);
        this.emit('server-error', data);
    }

    /**
     * Handle user typing event
     */
    handleUserTyping(data) {
        this.emit('user-typing', data);
    }

    /**
     * Handle user stopped typing event
     */
    handleUserStoppedTyping(data) {
        this.emit('user-stopped-typing', data);
    }

    /**
     * Join a room
     */
    joinRoom(roomId) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Socket not connected');
        }

        console.log('Joining room:', roomId);
        this.socket.emit('join-room', { roomId });
    }

    /**
     * Leave current room
     */
    leaveRoom() {
        if (!this.isConnected || !this.socket || !this.currentRoom) {
            return;
        }

        console.log('Leaving room:', this.currentRoom);
        this.socket.emit('leave-room', { roomId: this.currentRoom });
    }

    /**
     * Send a message
     */
    sendMessage(content) {
        if (!this.isConnected || !this.socket || !this.currentRoom) {
            throw new Error('Not connected to a room');
        }

        if (!content || !content.trim()) {
            throw new Error('Message content is required');
        }

        console.log('Sending message:', content);
        this.socket.emit('send-message', {
            roomId: this.currentRoom,
            content: content.trim()
        });
    }

    /**
     * Get room participants
     */
    getRoomParticipants(roomId = null) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Socket not connected');
        }

        const targetRoomId = roomId || this.currentRoom;
        if (!targetRoomId) {
            throw new Error('No room specified');
        }

        console.log('Getting room participants:', targetRoomId);
        this.socket.emit('get-room-participants', { roomId: targetRoomId });
    }

    /**
     * Send typing indicator
     */
    sendTyping(isTyping = true) {
        if (!this.isConnected || !this.socket || !this.currentRoom) {
            return;
        }

        this.socket.emit(isTyping ? 'start-typing' : 'stop-typing', {
            roomId: this.currentRoom
        });
    }

    /**
     * Disconnect from Socket.io
     */
    disconnect() {
        if (this.socket) {
            console.log('Disconnecting Socket.io');
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.currentRoom = null;
        }
    }

    /**
     * Manually reconnect
     */
    reconnect() {
        if (this.socket) {
            console.log('Manually reconnecting Socket.io');
            this.socket.connect();
        } else {
            this.connect();
        }
    }

    /**
     * Add event listener
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    /**
     * Remove event listener
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * Emit custom event
     */
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Event handler error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Add connection callback
     */
    onConnect(callback) {
        this.connectionCallbacks.push(callback);
    }

    /**
     * Add disconnection callback
     */
    onDisconnect(callback) {
        this.disconnectionCallbacks.push(callback);
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            socketId: this.socket?.id,
            currentRoom: this.currentRoom,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Check if connected
     */
    isSocketConnected() {
        return this.isConnected && this.socket && this.socket.connected;
    }

    /**
     * Get current room ID
     */
    getCurrentRoom() {
        return this.currentRoom;
    }

    /**
     * Set connection options
     */
    setConnectionOptions(options) {
        this.maxReconnectAttempts = options.maxReconnectAttempts || this.maxReconnectAttempts;
        this.reconnectDelay = options.reconnectDelay || this.reconnectDelay;
    }
}

// Create singleton instance
const socketManager = new SocketManager();

// Make it available globally
window.SocketManager = socketManager;