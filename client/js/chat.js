/**
 * Chat messaging JavaScript module
 */
document.addEventListener('DOMContentLoaded', function() {
    // Only run if we're on the chat page
    if (!document.getElementById('messages-area')) {
        return;
    }

    // Check authentication
    if (!Auth.requireAuth()) {
        return;
    }

    // Get room ID from session storage
    const roomId = sessionStorage.getItem('currentRoomId');
    if (!roomId) {
        showNotification('No room selected. Redirecting to rooms...', 'error');
        setTimeout(() => {
            window.location.href = '/pages/rooms.html';
        }, 2000);
        return;
    }

    // DOM elements
    const messagesArea = document.getElementById('messages-area');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const backBtn = document.getElementById('back-btn');
    const participantsToggle = document.getElementById('participants-toggle');
    const participantsPanel = document.getElementById('participants-panel');
    const closeParticipants = document.getElementById('close-participants');
    const participantsList = document.getElementById('participants-list');
    const roomNameEl = document.getElementById('room-name');
    const connectionStatus = document.getElementById('connection-status');
    const participantCount = document.getElementById('participant-count');
    const participantsCountBadge = document.getElementById('participants-count-badge');
    const currentUsername = document.getElementById('current-username');
    const logoutBtn = document.getElementById('logout-btn');
    const scrollToBottomBtn = document.getElementById('scroll-to-bottom');
    const newMessagesCount = scrollToBottomBtn.querySelector('.new-messages-count');
    const typingIndicators = document.getElementById('typing-indicators');
    const typingUsers = document.getElementById('typing-users');
    const charCount = document.getElementById('char-count');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const connectionOverlay = document.getElementById('connection-overlay');
    const manualReconnectBtn = document.getElementById('manual-reconnect');

    // State
    let currentRoom = null;
    let participants = [];
    let messages = [];
    let isAtBottom = true;
    let newMessagesCounter = 0;
    let typingTimeout = null;
    let isTyping = false;
    let typingUsersSet = new Set();

    // Initialize
    init();

    /**
     * Initialize the chat application
     */
    async function init() {
        try {
            setupEventListeners();
            displayUserInfo();
            updateConnectionStatus('connecting');
            
            // Connect to Socket.io
            await SocketManager.connect();
            
            // Join the room
            SocketManager.joinRoom(roomId);
            
            // Load room info and message history
            await loadRoomInfo();
            await loadMessageHistory();
            
        } catch (error) {
            console.error('Chat initialization error:', error);
            showNotification('Failed to connect to chat. Please try again.', 'error');
            showConnectionOverlay(true);
        }
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Socket events
        SocketManager.on('connection-status-changed', handleConnectionStatusChange);
        SocketManager.on('room-joined', handleRoomJoined);
        SocketManager.on('room-left', handleRoomLeft);
        SocketManager.on('new-message', handleNewMessage);
        SocketManager.on('user-joined', handleUserJoined);
        SocketManager.on('user-left', handleUserLeft);
        SocketManager.on('participants-update', handleParticipantsUpdate);
        SocketManager.on('room-participants', handleRoomParticipants);
        SocketManager.on('user-typing', handleUserTyping);
        SocketManager.on('user-stopped-typing', handleUserStoppedTyping);
        SocketManager.on('server-error', handleServerError);
        SocketManager.on('reconnected', handleReconnected);
        SocketManager.on('connection-error', handleConnectionError);

        // UI events
        messageInput.addEventListener('input', handleMessageInput);
        messageInput.addEventListener('keydown', handleMessageKeydown);
        sendBtn.addEventListener('click', sendMessage);
        backBtn.addEventListener('click', goBackToRooms);
        participantsToggle.addEventListener('click', toggleParticipantsPanel);
        closeParticipants.addEventListener('click', closeParticipantsPanel);
        logoutBtn.addEventListener('click', handleLogout);
        scrollToBottomBtn.addEventListener('click', scrollToBottom);
        emojiBtn.addEventListener('click', toggleEmojiPicker);
        manualReconnectBtn.addEventListener('click', handleManualReconnect);

        // Scroll detection
        messagesArea.addEventListener('scroll', handleScroll);

        // Emoji picker events
        const emojiOptions = document.querySelectorAll('.emoji-option');
        emojiOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                insertEmoji(e.target.dataset.emoji);
            });
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
                emojiPicker.classList.add('hidden');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);

        // Window events
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('blur', handleWindowBlur);
    }

    /**
     * Display user information
     */
    function displayUserInfo() {
        const user = Auth.getCurrentUser();
        if (user && user.username) {
            currentUsername.textContent = user.username;
        }
    }

    /**
     * Load room information
     */
    async function loadRoomInfo() {
        try {
            const response = await Auth.makeAuthenticatedRequest(`/api/rooms/${roomId}`);
            const data = await response.json();
            
            if (data.success) {
                currentRoom = data.data.room;
                roomNameEl.textContent = currentRoom.name;
                document.title = `${currentRoom.name} - Chat Web Room`;
            } else {
                throw new Error(data.error?.message || 'Failed to load room info');
            }
        } catch (error) {
            console.error('Error loading room info:', error);
            showNotification('Failed to load room information', 'error');
        }
    }

    /**
     * Load message history
     */
    async function loadMessageHistory() {
        try {
            const response = await Auth.makeAuthenticatedRequest(`/api/rooms/${roomId}/messages?limit=50&order=asc`);
            const data = await response.json();
            
            if (data.success) {
                messages = data.data.messages;
                displayMessages();
                scrollToBottom();
                
                // Hide welcome message if there are messages
                if (messages.length > 0) {
                    const welcomeMessage = messagesArea.querySelector('.welcome-message');
                    if (welcomeMessage) {
                        welcomeMessage.style.display = 'none';
                    }
                }
            } else {
                throw new Error(data.error?.message || 'Failed to load messages');
            }
        } catch (error) {
            console.error('Error loading message history:', error);
            showNotification('Failed to load message history', 'error');
        }
    }

    /**
     * Display messages in the chat area
     */
    function displayMessages() {
        // Clear existing messages (except welcome message)
        const existingMessages = messagesArea.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        messages.forEach(message => {
            displayMessage(message);
        });
    }

    /**
     * Display a single message
     */
    function displayMessage(message) {
        const messageEl = createMessageElement(message);
        messagesArea.appendChild(messageEl);
        
        // Auto-scroll if user is at bottom
        if (isAtBottom) {
            scrollToBottom();
        } else {
            // Show new message indicator
            newMessagesCounter++;
            updateNewMessagesIndicator();
        }
    }

    /**
     * Create message element
     */
    function createMessageElement(message) {
        const messageEl = document.createElement('div');
        const currentUser = Auth.getCurrentUser();
        const isOwnMessage = currentUser && message.sender === currentUser.username;
        const isNotification = message.type === 'notification';
        
        messageEl.className = `message ${isOwnMessage ? 'own' : 'other'} ${isNotification ? 'notification' : ''}`;
        
        if (isNotification) {
            messageEl.innerHTML = `
                <div class="message-bubble">
                    ${escapeHtml(message.message)}
                </div>
            `;
        } else {
            messageEl.innerHTML = `
                <div class="message-bubble">
                    <div class="message-header">
                        <span class="sender-name">${escapeHtml(message.sender)}</span>
                        <span class="message-time">${formatMessageTime(message.timestamp)}</span>
                    </div>
                    <div class="message-content">${escapeHtml(message.message)}</div>
                </div>
            `;
        }
        
        return messageEl;
    }

    /**
     * Handle message input changes
     */
    function handleMessageInput() {
        const content = messageInput.value;
        const length = content.length;
        
        // Update character count
        charCount.textContent = `${length}/1000`;
        charCount.className = 'char-count';
        if (length > 800) {
            charCount.classList.add('warning');
        }
        if (length > 950) {
            charCount.classList.add('error');
        }
        
        // Update send button state
        sendBtn.disabled = !content.trim() || length > 1000;
        
        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        
        // Handle typing indicators
        if (content.trim() && !isTyping) {
            isTyping = true;
            SocketManager.sendTyping(true);
        } else if (!content.trim() && isTyping) {
            isTyping = false;
            SocketManager.sendTyping(false);
        }
        
        // Reset typing timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        if (content.trim()) {
            typingTimeout = setTimeout(() => {
                if (isTyping) {
                    isTyping = false;
                    SocketManager.sendTyping(false);
                }
            }, 3000);
        }
    }

    /**
     * Handle message input keydown
     */
    function handleMessageKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }

    /**
     * Send message
     */
    function sendMessage() {
        const content = messageInput.value.trim();
        
        if (!content || content.length > 1000) {
            return;
        }
        
        try {
            SocketManager.sendMessage(content);
            
            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';
            charCount.textContent = '0/1000';
            charCount.className = 'char-count';
            sendBtn.disabled = true;
            
            // Stop typing indicator
            if (isTyping) {
                isTyping = false;
                SocketManager.sendTyping(false);
            }
            
            // Clear typing timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout);
                typingTimeout = null;
            }
            
        } catch (error) {
            console.error('Error sending message:', error);
            showNotification('Failed to send message. Please try again.', 'error');
        }
    }

    /**
     * Handle scroll events
     */
    function handleScroll() {
        const { scrollTop, scrollHeight, clientHeight } = messagesArea;
        const threshold = 100;
        
        isAtBottom = scrollTop + clientHeight >= scrollHeight - threshold;
        
        // Show/hide scroll to bottom button
        if (isAtBottom) {
            scrollToBottomBtn.classList.add('hidden');
            newMessagesCounter = 0;
            updateNewMessagesIndicator();
        } else {
            scrollToBottomBtn.classList.remove('hidden');
        }
    }

    /**
     * Scroll to bottom of messages
     */
    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
        isAtBottom = true;
        newMessagesCounter = 0;
        updateNewMessagesIndicator();
        scrollToBottomBtn.classList.add('hidden');
    }

    /**
     * Update new messages indicator
     */
    function updateNewMessagesIndicator() {
        if (newMessagesCounter > 0) {
            newMessagesCount.textContent = newMessagesCounter;
            newMessagesCount.classList.remove('hidden');
        } else {
            newMessagesCount.classList.add('hidden');
        }
    }

    /**
     * Toggle participants panel
     */
    function toggleParticipantsPanel() {
        participantsPanel.classList.toggle('hidden');
        
        if (!participantsPanel.classList.contains('hidden')) {
            SocketManager.getRoomParticipants();
        }
    }

    /**
     * Close participants panel
     */
    function closeParticipantsPanel() {
        participantsPanel.classList.add('hidden');
    }

    /**
     * Display participants
     */
    function displayParticipants() {
        participantsList.innerHTML = '';
        
        if (participants.length === 0) {
            participantsList.innerHTML = `
                <div class="loading-participants">
                    <span>No participants online</span>
                </div>
            `;
            return;
        }
        
        participants.forEach(participant => {
            const participantEl = document.createElement('div');
            participantEl.className = 'participant-item';
            
            const avatar = participant.username.charAt(0).toUpperCase();
            
            participantEl.innerHTML = `
                <div class="participant-avatar">${avatar}</div>
                <div class="participant-info">
                    <div class="participant-name">${escapeHtml(participant.username)}</div>
                    <div class="participant-status">Online</div>
                </div>
            `;
            
            participantsList.appendChild(participantEl);
        });
    }

    /**
     * Update connection status
     */
    function updateConnectionStatus(status) {
        connectionStatus.className = `status-indicator ${status}`;
        
        switch (status) {
            case 'connected':
                connectionStatus.textContent = 'Connected';
                break;
            case 'connecting':
                connectionStatus.textContent = 'Connecting...';
                break;
            case 'disconnected':
                connectionStatus.textContent = 'Disconnected';
                break;
            case 'reconnecting':
                connectionStatus.textContent = 'Reconnecting...';
                break;
        }
    }

    /**
     * Show/hide connection overlay
     */
    function showConnectionOverlay(show) {
        connectionOverlay.classList.toggle('hidden', !show);
    }

    /**
     * Toggle emoji picker
     */
    function toggleEmojiPicker() {
        emojiPicker.classList.toggle('hidden');
    }

    /**
     * Insert emoji into message input
     */
    function insertEmoji(emoji) {
        const cursorPos = messageInput.selectionStart;
        const textBefore = messageInput.value.substring(0, cursorPos);
        const textAfter = messageInput.value.substring(messageInput.selectionEnd);
        
        messageInput.value = textBefore + emoji + textAfter;
        messageInput.focus();
        messageInput.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
        
        // Trigger input event to update character count
        messageInput.dispatchEvent(new Event('input'));
        
        emojiPicker.classList.add('hidden');
    }

    /**
     * Go back to rooms
     */
    function goBackToRooms() {
        // Leave current room
        if (SocketManager.getCurrentRoom()) {
            SocketManager.leaveRoom();
        }
        
        // Disconnect socket
        SocketManager.disconnect();
        
        // Clear session storage
        sessionStorage.removeItem('currentRoomId');
        
        // Navigate to rooms
        window.location.href = '/pages/rooms.html';
    }

    /**
     * Handle logout
     */
    function handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            // Leave room and disconnect
            if (SocketManager.getCurrentRoom()) {
                SocketManager.leaveRoom();
            }
            SocketManager.disconnect();
            
            // Clear session storage
            sessionStorage.removeItem('currentRoomId');
            
            // Logout
            Auth.logout();
            window.location.href = '/';
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboardShortcuts(event) {
        // Escape key closes panels
        if (event.key === 'Escape') {
            if (!participantsPanel.classList.contains('hidden')) {
                closeParticipantsPanel();
            } else if (!emojiPicker.classList.contains('hidden')) {
                emojiPicker.classList.add('hidden');
            }
        }
        
        // Ctrl/Cmd + Enter sends message
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            sendMessage();
        }
    }

    /**
     * Socket event handlers
     */
    function handleConnectionStatusChange(data) {
        updateConnectionStatus(data.connected ? 'connected' : 'disconnected');
        showConnectionOverlay(!data.connected);
        
        if (data.connected) {
            showNotification('Connected to chat server', 'success');
        } else {
            showNotification('Disconnected from chat server', 'error');
        }
    }

    function handleRoomJoined(data) {
        showNotification(`Joined room: ${data.roomName}`, 'success');
        updateParticipantCount(data.participants?.length || 0);
    }

    function handleRoomLeft(data) {
        showNotification('Left the room', 'info');
    }

    function handleNewMessage(data) {
        messages.push(data.message);
        displayMessage(data.message);
    }

    function handleUserJoined(data) {
        if (data.message) {
            messages.push(data.message);
            displayMessage(data.message);
        }
    }

    function handleUserLeft(data) {
        if (data.message) {
            messages.push(data.message);
            displayMessage(data.message);
        }
    }

    function handleParticipantsUpdate(data) {
        if (data.roomId === roomId) {
            participants = data.participants || [];
            updateParticipantCount(participants.length);
            displayParticipants();
        }
    }

    function handleRoomParticipants(data) {
        if (data.roomId === roomId) {
            participants = data.participants || [];
            displayParticipants();
        }
    }

    function handleUserTyping(data) {
        typingUsersSet.add(data.username);
        updateTypingIndicators();
    }

    function handleUserStoppedTyping(data) {
        typingUsersSet.delete(data.username);
        updateTypingIndicators();
    }

    function handleServerError(data) {
        showNotification(data.message || 'Server error occurred', 'error');
    }

    function handleReconnected(data) {
        showNotification('Reconnected to chat server', 'success');
        updateConnectionStatus('connected');
        showConnectionOverlay(false);
    }

    function handleConnectionError(data) {
        showNotification('Connection error: ' + data.error, 'error');
        updateConnectionStatus('disconnected');
        showConnectionOverlay(true);
    }

    function handleManualReconnect() {
        updateConnectionStatus('connecting');
        SocketManager.reconnect();
    }

    function handleBeforeUnload() {
        if (SocketManager.getCurrentRoom()) {
            SocketManager.leaveRoom();
        }
        SocketManager.disconnect();
    }

    function handleWindowFocus() {
        // Reset new messages counter when window gains focus
        newMessagesCounter = 0;
        updateNewMessagesIndicator();
    }

    function handleWindowBlur() {
        // Could implement away status here
    }

    /**
     * Update participant count
     */
    function updateParticipantCount(count) {
        participantCount.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
        participantsCountBadge.textContent = count;
    }

    /**
     * Update typing indicators
     */
    function updateTypingIndicators() {
        if (typingUsersSet.size === 0) {
            typingIndicators.classList.add('hidden');
            return;
        }
        
        const users = Array.from(typingUsersSet);
        let text = '';
        
        if (users.length === 1) {
            text = `${users[0]} is typing...`;
        } else if (users.length === 2) {
            text = `${users[0]} and ${users[1]} are typing...`;
        } else {
            text = `${users[0]} and ${users.length - 1} others are typing...`;
        }
        
        typingUsers.textContent = text;
        typingIndicators.classList.remove('hidden');
    }

    /**
     * Show notification
     */
    function showNotification(message, type = 'info') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    /**
     * Utility functions
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatMessageTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        
        if (diffMins < 1) {
            return 'now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffMins < 1440) {
            return `${Math.floor(diffMins / 60)}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
});