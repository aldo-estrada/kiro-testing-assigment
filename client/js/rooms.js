/**
 * Rooms page functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    // Only run if we're on the rooms page
    if (!document.getElementById('all-rooms-grid')) {
        return;
    }

    // Check authentication
    if (!Auth.requireAuth()) {
        return;
    }

    // DOM elements
    const createRoomBtn = document.getElementById('create-room-btn');
    const createRoomModal = document.getElementById('create-room-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const cancelCreateBtn = document.getElementById('cancel-create');
    const createRoomForm = document.getElementById('create-room-form');
    const roomNameField = document.getElementById('room-name');
    const errorContainer = document.getElementById('error-container');
    const successContainer = document.getElementById('success-container');
    const usernameDisplay = document.getElementById('username-display');

    // Tab elements
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Grid elements
    const allRoomsGrid = document.getElementById('all-rooms-grid');
    const myRoomsGrid = document.getElementById('my-rooms-grid');
    const allRoomsLoading = document.getElementById('all-rooms-loading');
    const myRoomsLoading = document.getElementById('my-rooms-loading');
    const allRoomsEmpty = document.getElementById('all-rooms-empty');
    const myRoomsEmpty = document.getElementById('my-rooms-empty');

    // Stats elements
    const totalRoomsCount = document.getElementById('total-rooms-count');
    const myRoomsCount = document.getElementById('my-rooms-count');
    const activeUsersCount = document.getElementById('active-users-count');

    // State
    let currentTab = 'all-rooms';
    let allRooms = [];
    let myRooms = [];

    // Event listeners
    createRoomBtn.addEventListener('click', openCreateModal);
    closeModalBtn.addEventListener('click', closeCreateModal);
    cancelCreateBtn.addEventListener('click', closeCreateModal);
    createRoomForm.addEventListener('submit', handleCreateRoom);
    
    // Tab switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Modal close on backdrop click
    createRoomModal.addEventListener('click', (e) => {
        if (e.target === createRoomModal) {
            closeCreateModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    /**
     * Initialize the page
     */
    function init() {
        displayUserInfo();
        loadRooms();
        
        // Refresh rooms every 30 seconds
        setInterval(loadRooms, 30000);
    }

    /**
     * Display user information
     */
    function displayUserInfo() {
        const user = Auth.getCurrentUser();
        if (user && user.username) {
            usernameDisplay.textContent = user.username;
        }
    }

    /**
     * Load rooms data
     */
    async function loadRooms() {
        try {
            await Promise.all([
                loadAllRooms(),
                loadMyRooms()
            ]);
            updateStats();
        } catch (error) {
            console.error('Error loading rooms:', error);
            showError('Failed to load rooms. Please refresh the page.');
        }
    }

    /**
     * Load all rooms
     */
    async function loadAllRooms() {
        showLoading('all-rooms', true);
        
        try {
            const response = await ErrorHandler.wrapAsync(async () => {
                return await Auth.makeAuthenticatedRequest('/api/rooms');
            }, { context: 'load-rooms' })();
            
            const data = await response.json();
            
            if (data.success) {
                allRooms = data.data.rooms;
                displayRooms(allRooms, 'all-rooms');
            } else {
                ErrorHandler.handleError({
                    type: 'SERVER',
                    message: data.error?.message || 'Failed to load rooms',
                    details: data.error,
                    source: 'load-rooms'
                });
                throw new Error(data.error?.message || 'Failed to load rooms');
            }
        } catch (error) {
            console.error('Error loading all rooms:', error);
            showEmptyState('all-rooms');
            throw error;
        } finally {
            showLoading('all-rooms', false);
        }
    }

    /**
     * Load user's rooms
     */
    async function loadMyRooms() {
        showLoading('my-rooms', true);
        
        try {
            const response = await Auth.makeAuthenticatedRequest('/api/rooms/my-rooms');
            const data = await response.json();
            
            if (data.success) {
                myRooms = data.data.rooms;
                displayRooms(myRooms, 'my-rooms');
            } else {
                throw new Error(data.error?.message || 'Failed to load your rooms');
            }
        } catch (error) {
            console.error('Error loading my rooms:', error);
            showEmptyState('my-rooms');
            throw error;
        } finally {
            showLoading('my-rooms', false);
        }
    }

    /**
     * Display rooms in grid
     */
    function displayRooms(rooms, tabId) {
        const grid = tabId === 'all-rooms' ? allRoomsGrid : myRoomsGrid;
        const emptyState = tabId === 'all-rooms' ? allRoomsEmpty : myRoomsEmpty;
        
        // Clear existing content
        const existingCards = grid.querySelectorAll('.room-card');
        existingCards.forEach(card => card.remove());
        
        if (rooms.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            
            rooms.forEach(room => {
                const roomCard = createRoomCard(room, tabId === 'my-rooms');
                grid.appendChild(roomCard);
            });
        }
    }

    /**
     * Create room card element
     */
    function createRoomCard(room, isMyRoom = false) {
        const card = document.createElement('div');
        card.className = `room-card ${isMyRoom ? 'my-room' : ''}`;
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Join room ${room.name}`);
        
        const currentUser = Auth.getCurrentUser();
        const isCreator = currentUser && room.createdBy === currentUser.id;
        
        card.innerHTML = `
            <div class="room-header">
                <h3 class="room-name">${escapeHtml(room.name)}</h3>
                ${isCreator ? `
                    <div class="room-actions">
                        <button class="action-btn edit" onclick="editRoom('${room.id}')" title="Edit room">
                            ✏️
                        </button>
                        <button class="action-btn delete" onclick="deleteRoom('${room.id}')" title="Delete room">
                            🗑️
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="room-info">
                <div class="participant-count">${room.participantCount || 0} participants</div>
                <div class="room-status ${room.isActive ? 'active' : 'inactive'}">
                    ${room.isActive ? 'Active' : 'Inactive'}
                </div>
            </div>
            <div class="room-created">
                Created ${formatDate(room.createdAt)}
            </div>
            <button class="join-room-btn" onclick="joinRoom('${room.id}')">
                Join Room
            </button>
        `;
        
        // Add click handler for the entire card
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on action buttons
            if (!e.target.closest('.room-actions')) {
                joinRoom(room.id);
            }
        });
        
        // Add keyboard handler
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                joinRoom(room.id);
            }
        });
        
        return card;
    }

    /**
     * Open create room modal
     */
    function openCreateModal() {
        createRoomModal.classList.remove('hidden');
        roomNameField.focus();
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close create room modal
     */
    function closeCreateModal() {
        createRoomModal.classList.add('hidden');
        createRoomForm.reset();
        clearFieldErrors();
        hideMessages();
        document.body.style.overflow = '';
    }

    /**
     * Handle create room form submission
     */
    async function handleCreateRoom(event) {
        event.preventDefault();
        
        const roomName = roomNameField.value.trim();
        
        // Validate room name
        if (!validateRoomName(roomName)) {
            return;
        }
        
        setCreateLoading(true);
        
        try {
            const response = await Auth.makeAuthenticatedRequest('/api/rooms', {
                method: 'POST',
                body: JSON.stringify({ name: roomName })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showSuccess('Room created successfully!');
                closeCreateModal();
                
                // Refresh rooms
                await loadRooms();
                
                // Switch to my rooms tab to show the new room
                switchTab('my-rooms');
                
            } else {
                handleCreateError(data.error);
            }
            
        } catch (error) {
            console.error('Error creating room:', error);
            showError('Failed to create room. Please try again.');
        } finally {
            setCreateLoading(false);
        }
    }

    /**
     * Validate room name
     */
    function validateRoomName(name) {
        const errors = [];
        
        if (!name) {
            errors.push('Room name is required');
        } else {
            if (name.length < 1) {
                errors.push('Room name cannot be empty');
            }
            if (name.length > 50) {
                errors.push('Room name must be no more than 50 characters');
            }
            if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) {
                errors.push('Room name can only contain letters, numbers, spaces, underscores, and hyphens');
            }
        }
        
        if (errors.length > 0) {
            showFieldError('room-name', errors[0]);
            return false;
        }
        
        clearFieldError('room-name');
        return true;
    }

    /**
     * Handle create room errors
     */
    function handleCreateError(error) {
        if (error.code === 'ROOM_NAME_EXISTS') {
            showFieldError('room-name', 'A room with this name already exists');
        } else if (error.code === 'VALIDATION_ERROR') {
            showFieldError('room-name', error.details?.[0] || 'Invalid room name');
        } else {
            showError(error.message || 'Failed to create room');
        }
    }

    /**
     * Switch between tabs
     */
    function switchTab(tabId) {
        currentTab = tabId;
        
        // Update tab buttons
        tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Update tab panes
        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === tabId);
        });
    }

    /**
     * Show/hide loading state
     */
    function showLoading(tabId, show) {
        const loading = tabId === 'all-rooms' ? allRoomsLoading : myRoomsLoading;
        loading.classList.toggle('hidden', !show);
    }

    /**
     * Show empty state
     */
    function showEmptyState(tabId) {
        const emptyState = tabId === 'all-rooms' ? allRoomsEmpty : myRoomsEmpty;
        emptyState.classList.remove('hidden');
    }

    /**
     * Update statistics
     */
    function updateStats() {
        totalRoomsCount.textContent = allRooms.length;
        myRoomsCount.textContent = myRooms.length;
        
        // Calculate active users (sum of all participants)
        const activeUsers = allRooms.reduce((sum, room) => sum + (room.participantCount || 0), 0);
        activeUsersCount.textContent = activeUsers;
    }

    /**
     * Set create button loading state
     */
    function setCreateLoading(isLoading) {
        const submitBtn = document.getElementById('submit-create');
        submitBtn.disabled = isLoading;
        
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        
        if (isLoading) {
            btnText.classList.add('hidden');
            btnLoading.classList.remove('hidden');
        } else {
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
        }
        
        roomNameField.disabled = isLoading;
    }

    /**
     * Show field error
     */
    function showFieldError(fieldId, message) {
        const errorElement = document.getElementById(`${fieldId}-error`);
        if (errorElement) {
            errorElement.textContent = message;
        }
    }

    /**
     * Clear field error
     */
    function clearFieldError(fieldId) {
        const errorElement = document.getElementById(`${fieldId}-error`);
        if (errorElement) {
            errorElement.textContent = '';
        }
    }

    /**
     * Clear all field errors
     */
    function clearFieldErrors() {
        clearFieldError('room-name');
    }

    /**
     * Show error message
     */
    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorContainer.classList.add('hidden');
        }, 5000);
    }

    /**
     * Show success message
     */
    function showSuccess(message) {
        successContainer.textContent = message;
        successContainer.classList.remove('hidden');
        successContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            successContainer.classList.add('hidden');
        }, 3000);
    }

    /**
     * Hide all messages
     */
    function hideMessages() {
        errorContainer.classList.add('hidden');
        successContainer.classList.add('hidden');
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboardShortcuts(event) {
        // Escape key closes modal
        if (event.key === 'Escape' && !createRoomModal.classList.contains('hidden')) {
            closeCreateModal();
        }
        
        // Ctrl/Cmd + N opens create modal
        if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
            event.preventDefault();
            openCreateModal();
        }
    }

    /**
     * Utility functions
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    // Global functions for room actions (called from HTML)
    window.joinRoom = function(roomId) {
        // Store room ID for chat page
        sessionStorage.setItem('currentRoomId', roomId);
        Router.navigate('/chat');
    };

    window.editRoom = function(roomId) {
        // TODO: Implement room editing
        console.log('Edit room:', roomId);
        showError('Room editing feature coming soon!');
    };

    window.deleteRoom = function(roomId) {
        // TODO: Implement room deletion with confirmation
        console.log('Delete room:', roomId);
        if (confirm('Are you sure you want to delete this room? This action cannot be undone.')) {
            // Implement deletion logic
            showError('Room deletion feature coming soon!');
        }
    };

    // Initialize the page
    init();
});