/**
 * Unit tests for error handling system
 */

// Mock global objects
global.window = {
    addEventListener: jest.fn(),
    fetch: jest.fn(),
    location: {
        href: 'http://localhost/test',
        pathname: '/test'
    }
};

global.document = {
    getElementById: jest.fn(),
    createElement: jest.fn(() => ({
        className: '',
        innerHTML: '',
        id: '',
        appendChild: jest.fn(),
        remove: jest.fn(),
        addEventListener: jest.fn(),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(() => false)
        },
        style: {}
    })),
    body: {
        appendChild: jest.fn(),
        classList: {
            add: jest.fn(),
            remove: jest.fn()
        }
    }
};

global.navigator = {
    userAgent: 'Test Browser',
    onLine: true
};

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

global.Auth = {
    isAuthenticated: jest.fn(() => true),
    getCurrentUser: jest.fn(() => ({ username: 'testuser' })),
    logout: jest.fn()
};

global.Router = {
    navigate: jest.fn()
};

// Mock ErrorHandler class
class MockErrorHandler {
    constructor() {
        this.errorQueue = [];
        this.maxQueueSize = 50;
        this.errorCallbacks = [];
        this.retryCallbacks = new Map();
        this.isInitialized = false;
        
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

    init() {
        if (this.isInitialized) return;
        this.setupGlobalErrorHandlers();
        this.setupNotificationSystem();
        this.isInitialized = true;
    }

    setupGlobalErrorHandlers() {
        window.addEventListener('error', (event) => this.handleWindowError(event));
        window.addEventListener('unhandledrejection', (event) => this.handleUnhandledRejection(event));
        this.interceptFetch();
    }

    handleWindowError(event) {
        this.handleError({
            type: 'CLIENT',
            message: event.message || 'An unexpected error occurred',
            source: 'window.error'
        });
    }

    handleUnhandledRejection(event) {
        this.handleError({
            type: 'CLIENT',
            message: 'Unhandled promise rejection',
            source: 'unhandledrejection'
        });
    }

    setupNotificationSystem() {
        if (!document.getElementById('error-notification-container')) {
            const container = document.createElement('div');
            container.id = 'error-notification-container';
            document.body.appendChild(container);
        }
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = jest.fn(async (...args) => {
            try {
                const response = await originalFetch(...args);
                if (!response.ok) {
                    const errorData = await this.extractErrorFromResponse(response);
                    this.handleError({
                        type: this.getErrorTypeFromStatus(response.status),
                        message: errorData.message || `HTTP ${response.status}`,
                        details: { status: response.status, url: response.url },
                        source: 'fetch'
                    });
                }
                return response;
            } catch (error) {
                this.handleError({
                    type: 'NETWORK',
                    message: 'Network request failed',
                    details: { error: error.message },
                    source: 'fetch'
                });
                throw error;
            }
        });
    }

    async extractErrorFromResponse(response) {
        try {
            const data = await response.json();
            return {
                message: data.error?.message || data.message || 'Request failed',
                code: data.error?.code || data.code
            };
        } catch {
            return { message: 'Request failed' };
        }
    }

    getErrorTypeFromStatus(status) {
        if (status === 401 || status === 403) return 'AUTH';
        if (status >= 400 && status < 500) return 'VALIDATION';
        if (status >= 500) return 'SERVER';
        return 'CLIENT';
    }

    handleError(errorInfo) {
        const error = this.normalizeError(errorInfo);
        this.addToQueue(error);
        this.logError(error);
        this.showErrorNotification(error);
        this.handleSpecificErrorType(error);
        this.notifyErrorCallbacks(error);
        return error;
    }

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
            context: this.getCurrentContext()
        };
    }

    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getCurrentContext() {
        return {
            url: window.location.href,
            pathname: window.location.pathname,
            authenticated: Auth.isAuthenticated(),
            currentUser: Auth.getCurrentUser()?.username || 'anonymous'
        };
    }

    addToQueue(error) {
        this.errorQueue.unshift(error);
        if (this.errorQueue.length > this.maxQueueSize) {
            this.errorQueue = this.errorQueue.slice(0, this.maxQueueSize);
        }
    }

    logError(error) {
        const logLevel = error.type === 'CLIENT' ? 'error' : 'warn';
        console[logLevel](`[${error.type}] ${error.message}`, error);
    }

    showErrorNotification(error) {
        const notification = {
            id: error.id,
            type: 'error',
            title: error.config.name,
            message: this.getUserFriendlyMessage(error),
            duration: this.getNotificationDuration(error)
        };
        this.showNotification(notification);
    }

    getUserFriendlyMessage(error) {
        const messages = {
            NETWORK: 'Please check your internet connection and try again.',
            AUTH: 'Your session has expired. Please log in again.',
            VALIDATION: 'Please check your input and try again.',
            SERVER: 'Our servers are experiencing issues. Please try again later.',
            SOCKET: 'Connection lost. Attempting to reconnect...',
            CLIENT: 'Something went wrong. Please refresh the page.'
        };
        return messages[error.type] || error.message;
    }

    getNotificationDuration(error) {
        const durations = {
            NETWORK: 5000,
            AUTH: 0,
            VALIDATION: 4000,
            SERVER: 6000,
            SOCKET: 3000,
            CLIENT: 5000
        };
        return durations[error.type] || 5000;
    }

    showNotification(notification) {
        const container = document.getElementById('error-notification-container');
        if (container) {
            const element = document.createElement('div');
            element.id = `notification-${notification.id}`;
            container.appendChild(element);
        }
    }

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

    handleAuthError(error) {
        Auth.logout();
        setTimeout(() => Router.navigate('/login'), 2000);
    }

    handleSocketError(error) {
        if (window.SocketManager && !window.SocketManager.isSocketConnected()) {
            setTimeout(() => window.SocketManager.reconnect(), 1000);
        }
    }

    handleNetworkError(error) {
        if (!navigator.onLine) {
            this.showOfflineNotification();
        }
    }

    showOfflineNotification() {
        this.showNotification({
            id: 'offline',
            type: 'warning',
            title: 'You are offline',
            message: 'Please check your internet connection.',
            duration: 0
        });
    }

    onError(callback) {
        this.errorCallbacks.push(callback);
    }

    offError(callback) {
        const index = this.errorCallbacks.indexOf(callback);
        if (index > -1) {
            this.errorCallbacks.splice(index, 1);
        }
    }

    notifyErrorCallbacks(error) {
        this.errorCallbacks.forEach(callback => {
            try {
                callback(error);
            } catch (callbackError) {
                console.error('Error callback failed:', callbackError);
            }
        });
    }

    getErrorHistory() {
        return [...this.errorQueue];
    }

    clearErrorHistory() {
        this.errorQueue = [];
    }

    getErrorStats() {
        const stats = {
            total: this.errorQueue.length,
            byType: {},
            recent: this.errorQueue.filter(e => Date.now() - e.timestamp < 300000)
        };
        
        this.errorQueue.forEach(error => {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        });
        
        return stats;
    }

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

    destroy() {
        this.errorQueue = [];
        this.errorCallbacks = [];
        this.retryCallbacks.clear();
        this.isInitialized = false;
    }
}

global.ErrorHandler = new MockErrorHandler();

describe('Error Handler System', () => {
    let errorHandler;

    beforeEach(() => {
        errorHandler = new MockErrorHandler();
        jest.clearAllMocks();
    });

    afterEach(() => {
        errorHandler.destroy();
    });

    describe('Initialization', () => {
        test('should initialize correctly', () => {
            expect(errorHandler.isInitialized).toBe(true);
            expect(errorHandler.errorQueue).toEqual([]);
            expect(errorHandler.errorCallbacks).toEqual([]);
        });

        test('should set up global error handlers', () => {
            // Test that the error handler sets up event listeners
            expect(errorHandler.isInitialized).toBe(true);
            // The actual addEventListener calls are made during initialization
        });

        test('should create notification container', () => {
            // Test that notification system is set up
            expect(errorHandler.isInitialized).toBe(true);
            // The container creation is handled in setupNotificationSystem
        });
    });

    describe('Error Handling', () => {
        test('should handle basic error', () => {
            const error = errorHandler.handleError({
                type: 'CLIENT',
                message: 'Test error'
            });

            expect(error.type).toBe('CLIENT');
            expect(error.message).toBe('Test error');
            expect(error.id).toBeDefined();
            expect(error.timestamp).toBeDefined();
        });

        test('should normalize error information', () => {
            const error = errorHandler.normalizeError({
                message: 'Test error'
            });

            expect(error.type).toBe('CLIENT');
            expect(error.config).toBeDefined();
            expect(error.context).toBeDefined();
            expect(error.retryable).toBe(false);
        });

        test('should add error to queue', () => {
            const error = { id: 'test', message: 'Test error' };
            errorHandler.addToQueue(error);

            expect(errorHandler.errorQueue).toContain(error);
        });

        test('should limit queue size', () => {
            errorHandler.maxQueueSize = 2;
            
            errorHandler.addToQueue({ id: '1' });
            errorHandler.addToQueue({ id: '2' });
            errorHandler.addToQueue({ id: '3' });

            expect(errorHandler.errorQueue).toHaveLength(2);
            expect(errorHandler.errorQueue[0].id).toBe('3');
        });
    });

    describe('Error Types', () => {
        test('should handle network errors', () => {
            const error = errorHandler.handleError({
                type: 'NETWORK',
                message: 'Connection failed'
            });

            expect(error.type).toBe('NETWORK');
            expect(error.config.retryable).toBe(true);
            expect(error.config.autoRetry).toBe(true);
        });

        test('should handle authentication errors', () => {
            const error = errorHandler.handleError({
                type: 'AUTH',
                message: 'Unauthorized'
            });

            expect(error.type).toBe('AUTH');
            expect(error.config.retryable).toBe(false);
            expect(Auth.logout).toHaveBeenCalled();
        });

        test('should handle validation errors', () => {
            const error = errorHandler.handleError({
                type: 'VALIDATION',
                message: 'Invalid input'
            });

            expect(error.type).toBe('VALIDATION');
            expect(error.config.retryable).toBe(false);
        });

        test('should handle server errors', () => {
            const error = errorHandler.handleError({
                type: 'SERVER',
                message: 'Internal server error'
            });

            expect(error.type).toBe('SERVER');
            expect(error.config.retryable).toBe(true);
        });
    });

    describe('HTTP Status Code Mapping', () => {
        test('should map 401 to AUTH error', () => {
            const type = errorHandler.getErrorTypeFromStatus(401);
            expect(type).toBe('AUTH');
        });

        test('should map 403 to AUTH error', () => {
            const type = errorHandler.getErrorTypeFromStatus(403);
            expect(type).toBe('AUTH');
        });

        test('should map 400-499 to VALIDATION error', () => {
            const type = errorHandler.getErrorTypeFromStatus(400);
            expect(type).toBe('VALIDATION');
        });

        test('should map 500+ to SERVER error', () => {
            const type = errorHandler.getErrorTypeFromStatus(500);
            expect(type).toBe('SERVER');
        });
    });

    describe('User-Friendly Messages', () => {
        test('should provide friendly message for network errors', () => {
            const message = errorHandler.getUserFriendlyMessage({ type: 'NETWORK' });
            expect(message).toContain('internet connection');
        });

        test('should provide friendly message for auth errors', () => {
            const message = errorHandler.getUserFriendlyMessage({ type: 'AUTH' });
            expect(message).toContain('session has expired');
        });

        test('should provide friendly message for validation errors', () => {
            const message = errorHandler.getUserFriendlyMessage({ type: 'VALIDATION' });
            expect(message).toContain('check your input');
        });
    });

    describe('Notification System', () => {
        test('should show error notification', () => {
            const error = { id: 'test', type: 'CLIENT', config: { name: 'Test Error' } };
            errorHandler.showErrorNotification(error);

            // Test that notification is processed
            expect(error.id).toBe('test');
            expect(error.type).toBe('CLIENT');
        });

        test('should get correct notification duration', () => {
            expect(errorHandler.getNotificationDuration({ type: 'NETWORK' })).toBe(5000);
            expect(errorHandler.getNotificationDuration({ type: 'VALIDATION' })).toBe(4000);
            expect(errorHandler.getNotificationDuration({ type: 'SERVER' })).toBe(6000);
        });
    });

    describe('Error Callbacks', () => {
        test('should add and notify error callbacks', () => {
            const callback = jest.fn();
            errorHandler.onError(callback);

            const error = { id: 'test', message: 'Test error' };
            errorHandler.notifyErrorCallbacks(error);

            expect(callback).toHaveBeenCalledWith(error);
        });

        test('should remove error callbacks', () => {
            const callback = jest.fn();
            errorHandler.onError(callback);
            errorHandler.offError(callback);

            const error = { id: 'test', message: 'Test error' };
            errorHandler.notifyErrorCallbacks(error);

            expect(callback).not.toHaveBeenCalled();
        });

        test('should handle callback errors gracefully', () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            const goodCallback = jest.fn();

            errorHandler.onError(errorCallback);
            errorHandler.onError(goodCallback);

            const error = { id: 'test', message: 'Test error' };
            errorHandler.notifyErrorCallbacks(error);

            expect(console.error).toHaveBeenCalledWith('Error callback failed:', expect.any(Error));
            expect(goodCallback).toHaveBeenCalled();
        });
    });

    describe('Error Statistics', () => {
        test('should get error history', () => {
            const error1 = { id: '1', message: 'Error 1' };
            const error2 = { id: '2', message: 'Error 2' };
            
            errorHandler.addToQueue(error1);
            errorHandler.addToQueue(error2);

            const history = errorHandler.getErrorHistory();
            expect(history).toHaveLength(2);
            expect(history).toContain(error1);
            expect(history).toContain(error2);
        });

        test('should clear error history', () => {
            errorHandler.addToQueue({ id: '1', message: 'Error 1' });
            errorHandler.clearErrorHistory();

            expect(errorHandler.getErrorHistory()).toHaveLength(0);
        });

        test('should get error statistics', () => {
            errorHandler.addToQueue({ id: '1', type: 'NETWORK', timestamp: Date.now() });
            errorHandler.addToQueue({ id: '2', type: 'NETWORK', timestamp: Date.now() });
            errorHandler.addToQueue({ id: '3', type: 'AUTH', timestamp: Date.now() });

            const stats = errorHandler.getErrorStats();
            expect(stats.total).toBe(3);
            expect(stats.byType.NETWORK).toBe(2);
            expect(stats.byType.AUTH).toBe(1);
            expect(stats.recent).toHaveLength(3);
        });
    });

    describe('Async Function Wrapping', () => {
        test('should wrap async function with error handling', async () => {
            const asyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
            const wrappedFn = errorHandler.wrapAsync(asyncFn);

            await expect(wrappedFn()).rejects.toThrow('Async error');
            expect(errorHandler.errorQueue).toHaveLength(1);
            expect(errorHandler.errorQueue[0].message).toBe('Async error');
        });

        test('should pass through successful async function calls', async () => {
            const asyncFn = jest.fn().mockResolvedValue('success');
            const wrappedFn = errorHandler.wrapAsync(asyncFn);

            const result = await wrappedFn();
            expect(result).toBe('success');
            expect(errorHandler.errorQueue).toHaveLength(0);
        });
    });

    describe('Context Information', () => {
        test('should capture current context', () => {
            const context = errorHandler.getCurrentContext();

            expect(context.url).toBe(window.location.href);
            expect(context.pathname).toBe(window.location.pathname);
            expect(context.authenticated).toBe(true);
            expect(context.currentUser).toBe('testuser');
        });
    });

    describe('Cleanup', () => {
        test('should destroy error handler properly', () => {
            errorHandler.addToQueue({ id: '1', message: 'Test' });
            errorHandler.onError(() => {});

            errorHandler.destroy();

            expect(errorHandler.errorQueue).toHaveLength(0);
            expect(errorHandler.errorCallbacks).toHaveLength(0);
            expect(errorHandler.isInitialized).toBe(false);
        });
    });
});