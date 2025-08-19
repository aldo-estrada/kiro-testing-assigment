/**
 * Centralized frontend error handling system
 */
class ErrorHandler {
    constructor() {
        this.errorQueue = [];
        this.maxQueueSize = 50;
        this.errorCallbacks = [];
        this.retryCallbacks = new Map();
        this.isInitialized = false;
        
        // Error type configurations
        this.errorTypes = {
            NETWORK: {
                name: 'Network Error',
                icon: '🌐',
                color: '#e74c3c',
                retryable: true,
                autoRetry: true,
                maxRetries: 3
            },
            AUTH: {
                name: 'Authentication Error',
                icon: '🔒',
                color: '#f39c12',
                retryable: false,
                autoRetry: false,
                redirectToLogin: true
            },
            VALIDATION: {
                name: 'Validation Error',
                icon: '⚠️',
                color: '#e67e22',
                retryable: false,
                autoRetry: false
            },
            SERVER: {
                name: 'Server Error',
                icon: '🔧',
                color: '#e74c3c',
                retryable: true,
                autoRetry: false,
                maxRetries: 2
            },
            SOCKET: {
                name: 'Connection Error',
                icon: '📡',
                color: '#9b59b6',
                retryable: true,
                autoRetry: true,
                maxRetries: 5
            },
            CLIENT: {
                name: 'Application Error',
                icon: '💻',
                color: '#34495e',
                retryable: false,
                autoRetry: false
            }
        };
        
        this.init();
    }

    /**
     * Initialize error handler
     */
    init() {
        if (this.isInitialized) return;
        
        this.setupGlobalErrorHandlers();
        this.setupNotificationSystem();
        this.isInitialized = true;
        
        console.log('ErrorHandler initialized');
    }

    /**
     * Set up global error handlers
     */
    setupGlobalErrorHandlers() {
        // Handle unhandled JavaScript errors
        window.addEventListener('error', (event) => {
            this.handleError({
                type: 'CLIENT',
                message: event.message || 'An unexpected error occurred',
                details: {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    stack: event.error?.stack
                },
                source: 'window.error'
            });
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError({
                type: 'CLIENT',
                message: 'Unhandled promise rejection',
                details: {
                    reason: event.reason,
                    stack: event.reason?.stack
                },
                source: 'unhandledrejection'
            });
        });

        // Handle fetch errors globally
        this.interceptFetch();
    }

    /**
     * Intercept fetch requests to handle errors globally
     */
    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                
                // Handle HTTP error status codes
                if (!response.ok) {
                    const errorData = await this.extractErrorFromResponse(response);
                    
                    this.handleError({
                        type: this.getErrorTypeFromStatus(response.status),
                        message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
                        details: {
                            status: response.status,
                            statusText: response.statusText,
                            url: response.url,
                            ...errorData
                        },
                        source: 'fetch',
                        retryable: this.isRetryableStatus(response.status)
                    });
                }
                
                return response;
            } catch (error) {
                // Handle network errors
                this.handleError({
                    type: 'NETWORK',
                    message: 'Network request failed',
                    details: {
                        url: args[0],
                        error: error.message,
                        stack: error.stack
                    },
                    source: 'fetch',
                    retryable: true
                });
                
                throw error;
            }
        };
    }

    /**
     * Extract error information from response
     */
    async extractErrorFromResponse(response) {
        try {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return {
                    message: data.error?.message || data.message || 'Request failed',
                    code: data.error?.code || data.code,
                    details: data.error?.details || data.details
                };
            } else {
                const text = await response.text();
                return {
                    message: text || 'Request failed',
                    rawResponse: text
                };
            }
        } catch (parseError) {
            return {
                message: 'Failed to parse error response',
                parseError: parseError.message
            };
        }
    }

    /**
     * Get error type from HTTP status code
     */
    getErrorTypeFromStatus(status) {
        if (status === 401 || status === 403) return 'AUTH';
        if (status >= 400 && status < 500) return 'VALIDATION';
        if (status >= 500) return 'SERVER';
        return 'CLIENT';
    }

    /**
     * Check if status code is retryable
     */
    isRetryableStatus(status) {
        // Retry on server errors and some client errors
        return status >= 500 || status === 408 || status === 429;
    }

    /**
     * Handle error with centralized processing
     */
    handleError(errorInfo) {
        const error = this.normalizeError(errorInfo);
        
        // Add to error queue
        this.addToQueue(error);
        
        // Log error
        this.logError(error);
        
        // Show notification
        this.showErrorNotification(error);
        
        // Handle specific error types
        this.handleSpecificErrorType(error);
        
        // Notify callbacks
        this.notifyErrorCallbacks(error);
        
        // Auto-retry if configured
        if (error.config.autoRetry && error.retryable && error.retryCount < error.config.maxRetries) {
            this.scheduleRetry(error);
        }
        
        return error;
    }

    /**
     * Normalize error information
     */
    normalizeError(errorInfo) {
        const type = errorInfo.type || 'CLIENT';
        const config = this.errorTypes[type] || this.errorTypes.CLIENT;
        
        return {
            id: this.generateErrorId(),
            timestamp: Date.now(),
            type,
            config,
            message: errorInfo.message || 'An error occurred',
            details: errorInfo.details || {},
            source: errorInfo.source || 'unknown',
            retryable: errorInfo.retryable !== undefined ? errorInfo.retryable : config.retryable,
            retryCount: errorInfo.retryCount || 0,
            retryCallback: errorInfo.retryCallback,
            context: errorInfo.context || this.getCurrentContext()
        };
    }

    /**
     * Generate unique error ID
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get current application context
     */
    getCurrentContext() {
        return {
            url: window.location.href,
            pathname: window.location.pathname,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            authenticated: Auth?.isAuthenticated?.() || false,
            currentUser: Auth?.getCurrentUser?.()?.username || 'anonymous'
        };
    }

    /**
     * Add error to queue
     */
    addToQueue(error) {
        this.errorQueue.unshift(error);
        
        // Limit queue size
        if (this.errorQueue.length > this.maxQueueSize) {
            this.errorQueue = this.errorQueue.slice(0, this.maxQueueSize);
        }
    }

    /**
     * Log error to console
     */
    logError(error) {
        const logLevel = error.type === 'CLIENT' ? 'error' : 'warn';
        
        console[logLevel](`[${error.type}] ${error.message}`, {
            id: error.id,
            details: error.details,
            source: error.source,
            context: error.context
        });
    }

    /**
     * Show error notification to user
     */
    showErrorNotification(error) {
        const notification = {
            id: error.id,
            type: 'error',
            title: error.config.name,
            message: this.getUserFriendlyMessage(error),
            icon: error.config.icon,
            color: error.config.color,
            duration: this.getNotificationDuration(error),
            actions: this.getNotificationActions(error)
        };
        
        this.showNotification(notification);
    }

    /**
     * Get user-friendly error message
     */
    getUserFriendlyMessage(error) {
        const friendlyMessages = {
            NETWORK: 'Please check your internet connection and try again.',
            AUTH: 'Your session has expired. Please log in again.',
            VALIDATION: 'Please check your input and try again.',
            SERVER: 'Our servers are experiencing issues. Please try again later.',
            SOCKET: 'Connection lost. Attempting to reconnect...',
            CLIENT: 'Something went wrong. Please refresh the page.'
        };
        
        return friendlyMessages[error.type] || error.message;
    }

    /**
     * Get notification duration based on error type
     */
    getNotificationDuration(error) {
        const durations = {
            NETWORK: 5000,
            AUTH: 0, // Persistent until action
            VALIDATION: 4000,
            SERVER: 6000,
            SOCKET: 3000,
            CLIENT: 5000
        };
        
        return durations[error.type] || 5000;
    }

    /**
     * Get notification actions based on error type
     */
    getNotificationActions(error) {
        const actions = [];
        
        if (error.retryable) {
            actions.push({
                text: 'Retry',
                action: () => this.retryError(error)
            });
        }
        
        if (error.type === 'AUTH') {
            actions.push({
                text: 'Login',
                action: () => Router?.navigate?.('/login') || (window.location.href = '/pages/login.html')
            });
        }
        
        actions.push({
            text: 'Dismiss',
            action: () => this.dismissNotification(error.id)
        });
        
        return actions;
    }

    /**
     * Handle specific error types
     */
    handleSpecificErrorType(error) {
        switch (error.type) {
            case 'AUTH':
                this.handleAuthError(error);
                break;
            case 'SOCKET':
                this.handleSocketError(error);
                break;
            case 'NETWORK':
                this.handleNetworkError(error);
                break;
        }
    }

    /**
     * Handle authentication errors
     */
    handleAuthError(error) {
        // Clear auth data
        if (Auth?.logout) {
            Auth.logout();
        }
        
        // Redirect to login after delay
        setTimeout(() => {
            if (Router?.navigate) {
                Router.navigate('/login');
            } else {
                window.location.href = '/pages/login.html';
            }
        }, 2000);
    }

    /**
     * Handle socket errors
     */
    handleSocketError(error) {
        // Attempt reconnection if SocketManager is available
        if (window.SocketManager && !window.SocketManager.isSocketConnected()) {
            setTimeout(() => {
                try {
                    window.SocketManager.reconnect();
                } catch (reconnectError) {
                    console.warn('Socket reconnection failed:', reconnectError);
                }
            }, 1000);
        }
    }

    /**
     * Handle network errors
     */
    handleNetworkError(error) {
        // Check if we're offline
        if (!navigator.onLine) {
            this.showOfflineNotification();
        }
    }

    /**
     * Show offline notification
     */
    showOfflineNotification() {
        this.showNotification({
            id: 'offline',
            type: 'warning',
            title: 'You are offline',
            message: 'Please check your internet connection.',
            icon: '📶',
            duration: 0, // Persistent
            actions: [{
                text: 'Retry',
                action: () => window.location.reload()
            }]
        });
    }

    /**
     * Schedule error retry
     */
    scheduleRetry(error) {
        const delay = this.getRetryDelay(error.retryCount);
        
        setTimeout(() => {
            this.retryError(error);
        }, delay);
    }

    /**
     * Get retry delay with exponential backoff
     */
    getRetryDelay(retryCount) {
        return Math.min(1000 * Math.pow(2, retryCount), 30000);
    }

    /**
     * Retry error
     */
    async retryError(error) {
        if (!error.retryCallback) {
            console.warn('No retry callback available for error:', error.id);
            return;
        }
        
        error.retryCount++;
        
        try {
            await error.retryCallback();
            this.showNotification({
                type: 'success',
                message: 'Operation completed successfully',
                duration: 3000
            });
        } catch (retryError) {
            this.handleError({
                ...error,
                retryCount: error.retryCount,
                message: `Retry failed: ${retryError.message}`
            });
        }
    }

    /**
     * Set up notification system
     */
    setupNotificationSystem() {
        // Create notification container if it doesn't exist
        if (!document.getElementById('error-notification-container')) {
            const container = document.createElement('div');
            container.id = 'error-notification-container';
            container.className = 'error-notification-container';
            document.body.appendChild(container);
        }
    }

    /**
     * Show notification
     */
    showNotification(notification) {
        const container = document.getElementById('error-notification-container');
        if (!container) return;
        
        const notificationEl = this.createNotificationElement(notification);
        container.appendChild(notificationEl);
        
        // Auto-dismiss if duration is set
        if (notification.duration > 0) {
            setTimeout(() => {
                this.dismissNotification(notification.id);
            }, notification.duration);
        }
    }

    /**
     * Create notification element
     */
    createNotificationElement(notification) {
        const el = document.createElement('div');
        el.className = `error-notification error-notification-${notification.type}`;
        el.id = `notification-${notification.id}`;
        
        el.innerHTML = `
            <div class="error-notification-content">
                <div class="error-notification-header">
                    <span class="error-notification-icon">${notification.icon || '⚠️'}</span>
                    <span class="error-notification-title">${notification.title || 'Error'}</span>
                </div>
                <div class="error-notification-message">${notification.message}</div>
                ${notification.actions ? this.createActionsHTML(notification.actions) : ''}
            </div>
        `;
        
        return el;
    }

    /**
     * Create actions HTML
     */
    createActionsHTML(actions) {
        const actionsHTML = actions.map(action => 
            `<button class="error-notification-action" data-action="${action.text}">${action.text}</button>`
        ).join('');
        
        return `<div class="error-notification-actions">${actionsHTML}</div>`;
    }

    /**
     * Dismiss notification
     */
    dismissNotification(notificationId) {
        const el = document.getElementById(`notification-${notificationId}`);
        if (el) {
            el.remove();
        }
    }

    /**
     * Add error callback
     */
    onError(callback) {
        this.errorCallbacks.push(callback);
    }

    /**
     * Remove error callback
     */
    offError(callback) {
        const index = this.errorCallbacks.indexOf(callback);
        if (index > -1) {
            this.errorCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify error callbacks
     */
    notifyErrorCallbacks(error) {
        this.errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (callbackError) {
                console.error('Error callback failed:', callbackError);
            }
        });
    }

    /**
     * Get error history
     */
    getErrorHistory() {
        return [...this.errorQueue];
    }

    /**
     * Clear error history
     */
    clearErrorHistory() {
        this.errorQueue = [];
    }

    /**
     * Get error statistics
     */
    getErrorStats() {
        const stats = {
            total: this.errorQueue.length,
            byType: {},
            recent: this.errorQueue.filter(e => Date.now() - e.timestamp < 300000) // Last 5 minutes
        };
        
        this.errorQueue.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        });
        
        return stats;
    }

    /**
     * Create loading indicator
     */
    createLoadingIndicator(container, message = 'Loading...') {
        const loader = document.createElement('div');
        loader.className = 'error-handler-loading';
        loader.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message">${message}</div>
        `;
        
        if (container) {
            container.appendChild(loader);
        }
        
        return loader;
    }

    /**
     * Remove loading indicator
     */
    removeLoadingIndicator(loader) {
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    }

    /**
     * Wrap async function with error handling
     */
    wrapAsync(asyncFn, errorContext = {}) {
        return async (...args) => {
            try {
                return await asyncFn(...args);
            } catch (error) {
                this.handleError({
                    type: 'CLIENT',
                    message: error.message,
                    details: { stack: error.stack },
                    source: 'wrapped-async',
                    context: errorContext
                });
                throw error;
            }
        };
    }

    /**
     * Destroy error handler
     */
    destroy() {
        this.errorQueue = [];
        this.errorCallbacks = [];
        this.retryCallbacks.clear();
        this.isInitialized = false;
        
        // Remove notification container
        const container = document.getElementById('error-notification-container');
        if (container) {
            container.remove();
        }
    }
}

// Create global error handler instance
const errorHandler = new ErrorHandler();

// Make it available globally
window.ErrorHandler = errorHandler;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
}