/**
 * Centralized logout functionality for all pages
 */
class LogoutManager {
    constructor() {
        this.isLoggingOut = false;
        this.logoutCallbacks = [];
        this.init();
    }

    /**
     * Initialize logout manager
     */
    init() {
        // Listen for auth logout events
        Auth.onLogout(this.handleLogoutEvent.bind(this));

        // Set up global logout handlers
        this.setupGlobalLogoutHandlers();

        // Handle page visibility changes (logout on tab close in some cases)
        this.setupVisibilityHandlers();
    }

    /**
     * Set up global logout event handlers
     */
    setupGlobalLogoutHandlers() {
        // Handle logout buttons across all pages
        document.addEventListener('click', (event) => {
            if (event.target.matches('.logout-btn, [data-action="logout"]')) {
                event.preventDefault();
                this.handleLogoutClick(event);
            }
        });

        // Handle keyboard shortcuts (Ctrl+Shift+L for logout)
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.shiftKey && event.key === 'L') {
                event.preventDefault();
                this.handleLogoutClick(event);
            }
        });

        // Handle logout from context menu or other sources
        window.addEventListener('logout-requested', (event) => {
            this.handleLogoutClick(event);
        });
    }

    /**
     * Set up page visibility handlers
     */
    setupVisibilityHandlers() {
        // Handle page unload (cleanup on page close)
        window.addEventListener('beforeunload', () => {
            if (Auth.isAuthenticated()) {
                // Quick cleanup without confirmation
                this.performQuickLogout();
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.shouldLogoutOnHide()) {
                this.performQuickLogout();
            }
        });
    }

    /**
     * Handle logout button clicks
     */
    async handleLogoutClick(event) {
        if (this.isLoggingOut) {
            return; // Prevent multiple simultaneous logout attempts
        }

        const target = event.target.closest('.logout-btn, [data-action="logout"]');
        const confirmMessage = target?.dataset.confirmMessage || 'Are you sure you want to logout?';
        const redirectPath = target?.dataset.redirectPath || '/';
        const skipConfirmation = target?.dataset.skipConfirmation === 'true';

        try {
            this.isLoggingOut = true;
            this.showLogoutLoading(target);

            if (skipConfirmation || Auth.confirmLogout(confirmMessage)) {
                await this.performLogout(redirectPath);
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showLogoutError(target, error.message);
        } finally {
            this.isLoggingOut = false;
            this.hideLogoutLoading(target);
        }
    }

    /**
     * Perform the actual logout process
     */
    async performLogout(redirectPath = '/') {
        try {
            // Notify components that logout is starting
            this.notifyLogoutStart();

            // Call Auth logout
            await Auth.logoutAndRedirect(redirectPath);

            // Notify components that logout is complete
            this.notifyLogoutComplete();

        } catch (error) {
            console.error('Logout process failed:', error);
            // Force cleanup and redirect even if logout fails
            await Auth.logout();
            if (window.Router && typeof window.Router.navigate === 'function') {
                window.Router.navigate(redirectPath);
            } else {
                window.location.href = redirectPath === '/' ? '/' : `/pages${redirectPath}.html`;
            }
        }
    }

    /**
     * Perform quick logout without confirmation (for page unload)
     */
    performQuickLogout() {
        try {
            // Disconnect Socket.io if connected
            if (window.SocketManager && window.SocketManager.isSocketConnected()) {
                if (window.SocketManager.getCurrentRoom()) {
                    window.SocketManager.leaveRoom();
                }
                window.SocketManager.disconnect();
            }

            // Clear session storage
            sessionStorage.clear();

            // Don't clear localStorage on quick logout to preserve login state
            // This is useful for browser refresh scenarios
        } catch (error) {
            console.error('Quick logout error:', error);
        }
    }

    /**
     * Handle logout events from Auth module
     */
    handleLogoutEvent(event) {
        console.log('Logout event received:', event.detail);
        
        // Update UI to reflect logged out state
        this.updateUIForLoggedOutState();
        
        // Run any registered logout callbacks
        this.runLogoutCallbacks(event.detail);
    }

    /**
     * Show logout loading state
     */
    showLogoutLoading(button) {
        if (button) {
            button.disabled = true;
            button.classList.add('loading');
            
            const originalText = button.textContent;
            button.dataset.originalText = originalText;
            button.textContent = 'Logging out...';
        }
    }

    /**
     * Hide logout loading state
     */
    hideLogoutLoading(button) {
        if (button) {
            button.disabled = false;
            button.classList.remove('loading');
            
            const originalText = button.dataset.originalText;
            if (originalText) {
                button.textContent = originalText;
                delete button.dataset.originalText;
            }
        }
    }

    /**
     * Show logout error
     */
    showLogoutError(button, message) {
        console.error('Logout error:', message);
        
        // Show error notification if notification system is available
        if (window.showNotification) {
            window.showNotification('Logout failed: ' + message, 'error');
        } else {
            alert('Logout failed: ' + message);
        }
    }

    /**
     * Update UI for logged out state
     */
    updateUIForLoggedOutState() {
        // Hide user-specific elements
        const userElements = document.querySelectorAll('.user-only, .authenticated-only');
        userElements.forEach(element => {
            element.style.display = 'none';
        });

        // Show guest elements
        const guestElements = document.querySelectorAll('.guest-only, .unauthenticated-only');
        guestElements.forEach(element => {
            element.style.display = '';
        });

        // Update user display elements
        const userDisplays = document.querySelectorAll('.username-display, #username-display');
        userDisplays.forEach(element => {
            element.textContent = 'Guest';
        });
    }

    /**
     * Notify components that logout is starting
     */
    notifyLogoutStart() {
        const event = new CustomEvent('logout:start', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }

    /**
     * Notify components that logout is complete
     */
    notifyLogoutComplete() {
        const event = new CustomEvent('logout:complete', {
            detail: { timestamp: Date.now() }
        });
        window.dispatchEvent(event);
    }

    /**
     * Add logout callback
     */
    addLogoutCallback(callback) {
        this.logoutCallbacks.push(callback);
    }

    /**
     * Remove logout callback
     */
    removeLogoutCallback(callback) {
        const index = this.logoutCallbacks.indexOf(callback);
        if (index > -1) {
            this.logoutCallbacks.splice(index, 1);
        }
    }

    /**
     * Run logout callbacks
     */
    runLogoutCallbacks(detail) {
        this.logoutCallbacks.forEach(callback => {
            try {
                callback(detail);
            } catch (error) {
                console.error('Logout callback error:', error);
            }
        });
    }

    /**
     * Check if should logout on page hide
     */
    shouldLogoutOnHide() {
        // Only logout on hide for sensitive pages or if configured
        const sensitivePages = ['/chat', '/rooms'];
        const currentPath = window.location.pathname;
        
        return sensitivePages.some(page => currentPath.includes(page));
    }

    /**
     * Create logout button element
     */
    createLogoutButton(options = {}) {
        const button = document.createElement('button');
        button.className = `logout-btn ${options.className || ''}`;
        button.textContent = options.text || 'Logout';
        button.title = options.title || 'Logout from your account';
        
        if (options.confirmMessage) {
            button.dataset.confirmMessage = options.confirmMessage;
        }
        
        if (options.redirectPath) {
            button.dataset.redirectPath = options.redirectPath;
        }
        
        if (options.skipConfirmation) {
            button.dataset.skipConfirmation = 'true';
        }
        
        return button;
    }

    /**
     * Add logout button to element
     */
    addLogoutButtonTo(container, options = {}) {
        const button = this.createLogoutButton(options);
        container.appendChild(button);
        return button;
    }

    /**
     * Get logout status
     */
    getStatus() {
        return {
            isLoggingOut: this.isLoggingOut,
            isAuthenticated: Auth.isAuthenticated(),
            callbackCount: this.logoutCallbacks.length
        };
    }
}

// Create global logout manager instance
const logoutManager = new LogoutManager();

// Make it available globally
window.LogoutManager = logoutManager;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LogoutManager;
}