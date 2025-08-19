// Authentication module
const Auth = {
    TOKEN_KEY: 'chatToken',
    USER_KEY: 'chatUser',

    /**
     * Check if user is authenticated
     */
    checkAuthStatus() {
        const token = this.getToken();
        if (token) {
            // TODO: Validate token with server in future
            console.log('User has token');
            return true;
        } else {
            console.log('No authentication token found');
            return false;
        }
    },
    
    /**
     * Get stored token
     */
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        if (!token) {
            return false;
        }

        // Basic token validation (check if it's not expired)
        try {
            const payload = this.parseJWT(token);
            const now = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < now) {
                // Token is expired, remove it
                this.logout();
                return false;
            }
            
            return true;
        } catch (error) {
            // Invalid token, remove it
            this.logout();
            return false;
        }
    },
    
    /**
     * Store token and user info
     */
    setToken(token, user = null) {
        localStorage.setItem(this.TOKEN_KEY, token);
        
        if (user) {
            localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        } else {
            // Try to extract user info from token
            try {
                const payload = this.parseJWT(token);
                const userInfo = {
                    id: payload.userId,
                    username: payload.username
                };
                localStorage.setItem(this.USER_KEY, JSON.stringify(userInfo));
            } catch (error) {
                console.warn('Could not extract user info from token');
            }
        }
    },
    
    /**
     * Get current user info
     */
    getCurrentUser() {
        const userStr = localStorage.getItem(this.USER_KEY);
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (error) {
                console.warn('Could not parse user info');
            }
        }
        return null;
    },
    
    /**
     * Remove token and user info (logout)
     */
    async logout() {
        try {
            // Call server logout endpoint if available
            const token = this.getToken();
            if (token) {
                try {
                    await fetch('/api/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                } catch (error) {
                    console.warn('Server logout failed:', error);
                    // Continue with client-side logout even if server call fails
                }
            }

            // Disconnect Socket.io if connected
            if (window.SocketManager && window.SocketManager.isSocketConnected()) {
                // Leave current room if in one
                if (window.SocketManager.getCurrentRoom()) {
                    window.SocketManager.leaveRoom();
                }
                // Disconnect socket
                window.SocketManager.disconnect();
            }

            // Clear session storage
            sessionStorage.clear();

            // Clear local storage auth data
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);

            // Clear any other auth-related data
            localStorage.removeItem('rememberedUsername');

            // Emit logout event for other components to listen to
            this.emitLogoutEvent();

            console.log('Logout completed successfully');

        } catch (error) {
            console.error('Logout error:', error);
            // Force cleanup even if there are errors
            localStorage.removeItem(this.TOKEN_KEY);
            localStorage.removeItem(this.USER_KEY);
            sessionStorage.clear();
        }
    },

    /**
     * Remove token (alias for logout)
     */
    removeToken() {
        this.logout();
    },

    /**
     * Parse JWT token (client-side only, for basic info extraction)
     */
    parseJWT(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            return JSON.parse(jsonPayload);
        } catch (error) {
            throw new Error('Invalid token format');
        }
    },

    /**
     * Make authenticated API request
     */
    async makeAuthenticatedRequest(url, options = {}) {
        const token = this.getToken();
        
        if (!token) {
            throw new Error('No authentication token available');
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // Handle authentication errors
        if (response.status === 401) {
            // Token is invalid or expired
            this.logout();
            throw new Error('Authentication failed. Please log in again.');
        }

        return response;
    },

    /**
     * Redirect to login if not authenticated
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/pages/login.html';
            return false;
        }
        return true;
    },

    /**
     * Emit logout event for other components to listen to
     */
    emitLogoutEvent() {
        const event = new CustomEvent('auth:logout', {
            detail: {
                timestamp: Date.now(),
                reason: 'user_initiated'
            }
        });
        window.dispatchEvent(event);
    },

    /**
     * Logout and redirect to specified page
     */
    async logoutAndRedirect(redirectPath = '/') {
        await this.logout();
        
        // Use router if available, otherwise use window.location
        if (window.Router && typeof window.Router.navigate === 'function') {
            window.Router.navigate(redirectPath);
        } else {
            window.location.href = redirectPath === '/' ? '/' : `/pages${redirectPath}.html`;
        }
    },

    /**
     * Add logout event listener
     */
    onLogout(callback) {
        window.addEventListener('auth:logout', callback);
    },

    /**
     * Remove logout event listener
     */
    offLogout(callback) {
        window.removeEventListener('auth:logout', callback);
    },

    /**
     * Show logout confirmation dialog
     */
    confirmLogout(message = 'Are you sure you want to logout?') {
        return confirm(message);
    },

    /**
     * Handle logout with confirmation
     */
    async handleLogoutWithConfirmation(redirectPath = '/') {
        if (this.confirmLogout()) {
            await this.logoutAndRedirect(redirectPath);
            return true;
        }
        return false;
    }
};

// Make Auth available globally
window.Auth = Auth;