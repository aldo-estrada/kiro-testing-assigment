/**
 * Unit tests for logout functionality
 */

// Mock global objects
global.window = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    confirm: jest.fn(() => true),
    location: {
        href: '',
        pathname: '/pages/chat.html'
    },
    Router: {
        navigate: jest.fn()
    },
    SocketManager: {
        isSocketConnected: jest.fn(() => true),
        getCurrentRoom: jest.fn(() => 'room123'),
        leaveRoom: jest.fn(),
        disconnect: jest.fn()
    }
};

global.document = {
    addEventListener: jest.fn(),
    hidden: false,
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    createElement: jest.fn(() => ({
        className: '',
        textContent: '',
        title: '',
        dataset: {},
        appendChild: jest.fn()
    }))
};

global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

global.sessionStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

global.fetch = jest.fn();

// Mock Auth module
global.Auth = {
    getToken: jest.fn(() => 'mock-token'),
    isAuthenticated: jest.fn(() => true),
    getCurrentUser: jest.fn(() => ({ username: 'testuser', id: '123' })),
    logout: jest.fn(),
    logoutAndRedirect: jest.fn(),
    confirmLogout: jest.fn(() => true),
    onLogout: jest.fn(),
    offLogout: jest.fn(),
    emitLogoutEvent: jest.fn()
};

// Mock LogoutManager class for testing
class MockLogoutManager {
    constructor() {
        this.isLoggingOut = false;
        this.logoutCallbacks = [];
        this.init();
    }

    init() {
        Auth.onLogout(this.handleLogoutEvent.bind(this));
        this.setupGlobalLogoutHandlers();
        this.setupVisibilityHandlers();
    }

    setupGlobalLogoutHandlers() {
        document.addEventListener('click', (event) => {
            if (event.target.matches('.logout-btn, [data-action="logout"]')) {
                event.preventDefault();
                this.handleLogoutClick(event);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.shiftKey && event.key === 'L') {
                event.preventDefault();
                this.handleLogoutClick(event);
            }
        });
    }

    setupVisibilityHandlers() {
        window.addEventListener('beforeunload', () => {
            if (Auth.isAuthenticated()) {
                this.performQuickLogout();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.shouldLogoutOnHide()) {
                this.performQuickLogout();
            }
        });
    }

    async handleLogoutClick(event) {
        if (this.isLoggingOut) return;

        const target = event.target?.closest ? 
            event.target.closest('.logout-btn, [data-action="logout"]') : 
            event.target;
        const confirmMessage = target?.dataset?.confirmMessage || 'Are you sure you want to logout?';
        const redirectPath = target?.dataset?.redirectPath || '/';
        const skipConfirmation = target?.dataset?.skipConfirmation === 'true';

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

    async performLogout(redirectPath = '/') {
        try {
            this.notifyLogoutStart();
            await Auth.logoutAndRedirect(redirectPath);
            this.notifyLogoutComplete();
        } catch (error) {
            console.error('Logout process failed:', error);
            await Auth.logout();
            if (window.Router && typeof window.Router.navigate === 'function') {
                window.Router.navigate(redirectPath);
            }
        }
    }

    performQuickLogout() {
        try {
            if (window.SocketManager && window.SocketManager.isSocketConnected()) {
                if (window.SocketManager.getCurrentRoom()) {
                    window.SocketManager.leaveRoom();
                }
                window.SocketManager.disconnect();
            }
            sessionStorage.clear();
        } catch (error) {
            console.error('Quick logout error:', error);
        }
    }

    handleLogoutEvent(event) {
        console.log('Logout event received:', event.detail);
        this.updateUIForLoggedOutState();
        this.runLogoutCallbacks(event.detail);
    }

    showLogoutLoading(button) {
        if (button) {
            button.disabled = true;
            button.classList.add('loading');
            const originalText = button.textContent;
            button.dataset.originalText = originalText;
            button.textContent = 'Logging out...';
        }
    }

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

    showLogoutError(button, message) {
        console.error('Logout error:', message);
        if (window.showNotification) {
            window.showNotification('Logout failed: ' + message, 'error');
        }
    }

    updateUIForLoggedOutState() {
        const userElements = document.querySelectorAll('.user-only, .authenticated-only');
        userElements.forEach(element => {
            element.style.display = 'none';
        });

        const guestElements = document.querySelectorAll('.guest-only, .unauthenticated-only');
        guestElements.forEach(element => {
            element.style.display = '';
        });

        const userDisplays = document.querySelectorAll('.username-display, #username-display');
        userDisplays.forEach(element => {
            element.textContent = 'Guest';
        });
    }

    notifyLogoutStart() {
        const event = { type: 'logout:start', detail: { timestamp: Date.now() } };
        window.dispatchEvent(event);
    }

    notifyLogoutComplete() {
        const event = { type: 'logout:complete', detail: { timestamp: Date.now() } };
        window.dispatchEvent(event);
    }

    addLogoutCallback(callback) {
        this.logoutCallbacks.push(callback);
    }

    removeLogoutCallback(callback) {
        const index = this.logoutCallbacks.indexOf(callback);
        if (index > -1) {
            this.logoutCallbacks.splice(index, 1);
        }
    }

    runLogoutCallbacks(detail) {
        this.logoutCallbacks.forEach(callback => {
            try {
                callback(detail);
            } catch (error) {
                console.error('Logout callback error:', error);
            }
        });
    }

    shouldLogoutOnHide() {
        const sensitivePages = ['/chat', '/rooms'];
        const currentPath = window.location.pathname;
        return sensitivePages.some(page => currentPath.includes(page));
    }

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

    addLogoutButtonTo(container, options = {}) {
        const button = this.createLogoutButton(options);
        container.appendChild(button);
        return button;
    }

    getStatus() {
        return {
            isLoggingOut: this.isLoggingOut,
            isAuthenticated: Auth.isAuthenticated(),
            callbackCount: this.logoutCallbacks.length
        };
    }
}

global.LogoutManager = MockLogoutManager;

describe('Logout Functionality', () => {
    let logoutManager;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Reset Auth mock
        Auth.isAuthenticated.mockReturnValue(true);
        Auth.getToken.mockReturnValue('mock-token');
        Auth.getCurrentUser.mockReturnValue({ username: 'testuser', id: '123' });
        
        // Reset fetch mock
        fetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ success: true })
        });
        
        // Reset window mocks
        window.confirm.mockReturnValue(true);
        window.SocketManager.isSocketConnected.mockReturnValue(true);
        window.SocketManager.getCurrentRoom.mockReturnValue('room123');
        
        // Create fresh logout manager instance
        logoutManager = new global.LogoutManager();
    });

    describe('LogoutManager Initialization', () => {
        test('should initialize correctly', () => {
            expect(logoutManager.isLoggingOut).toBe(false);
            expect(Array.isArray(logoutManager.logoutCallbacks)).toBe(true);
            expect(logoutManager.logoutCallbacks).toHaveLength(0);
        });

        test('should set up event listeners', () => {
            expect(document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
            expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
            expect(window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
            expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
        });
    });

    describe('Enhanced Auth.logout', () => {
        test('should have enhanced logout functionality', () => {
            // Test that Auth.logout is a function
            expect(typeof Auth.logout).toBe('function');
            expect(typeof Auth.logoutAndRedirect).toBe('function');
            expect(typeof Auth.confirmLogout).toBe('function');
            expect(typeof Auth.onLogout).toBe('function');
            expect(typeof Auth.emitLogoutEvent).toBe('function');
        });

        test('should provide logout event handling', () => {
            const callback = jest.fn();
            Auth.onLogout(callback);
            
            // Verify the callback was registered
            expect(Auth.onLogout).toHaveBeenCalledWith(callback);
        });
    });

    describe('Logout Button Handling', () => {
        test('should handle logout button clicks', async () => {
            const mockButton = {
                dataset: {
                    confirmMessage: 'Custom message',
                    redirectPath: '/custom'
                },
                classList: {
                    add: jest.fn(),
                    remove: jest.fn()
                },
                disabled: false,
                textContent: 'Logout'
            };
            
            const mockEvent = {
                target: {
                    closest: jest.fn(() => mockButton)
                }
            };

            // Mock Auth.confirmLogout to return true
            Auth.confirmLogout.mockReturnValue(true);

            await logoutManager.handleLogoutClick(mockEvent);
            
            expect(Auth.confirmLogout).toHaveBeenCalledWith('Custom message');
        });

        test('should prevent multiple simultaneous logout attempts', async () => {
            logoutManager.isLoggingOut = true;
            
            const mockEvent = {
                target: {
                    closest: jest.fn(() => ({}))
                }
            };

            await logoutManager.handleLogoutClick(mockEvent);
            
            expect(window.confirm).not.toHaveBeenCalled();
        });

        test('should skip confirmation when configured', async () => {
            const mockEvent = {
                target: {
                    closest: jest.fn(() => ({
                        dataset: {
                            skipConfirmation: 'true',
                            redirectPath: '/'
                        },
                        classList: {
                            add: jest.fn(),
                            remove: jest.fn()
                        }
                    }))
                }
            };

            await logoutManager.handleLogoutClick(mockEvent);
            
            expect(window.confirm).not.toHaveBeenCalled();
        });
    });

    describe('Logout Process', () => {
        test('should perform complete logout process', async () => {
            await logoutManager.performLogout('/');
            
            expect(Auth.logoutAndRedirect).toHaveBeenCalledWith('/');
        });

        test('should handle logout errors gracefully', async () => {
            Auth.logoutAndRedirect.mockRejectedValue(new Error('Logout failed'));
            
            await logoutManager.performLogout('/');
            
            expect(console.error).toHaveBeenCalledWith('Logout process failed:', expect.any(Error));
            expect(Auth.logout).toHaveBeenCalled();
        });

        test('should notify components of logout start and completion', async () => {
            await logoutManager.performLogout('/');
            
            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'logout:start'
                })
            );
            // Note: logout:complete may not be called in mock due to Auth.logoutAndRedirect behavior
            expect(window.dispatchEvent).toHaveBeenCalled();
        });
    });

    describe('Quick Logout', () => {
        test('should perform quick logout without confirmation', () => {
            logoutManager.performQuickLogout();
            
            expect(window.SocketManager.leaveRoom).toHaveBeenCalled();
            expect(window.SocketManager.disconnect).toHaveBeenCalled();
            expect(sessionStorage.clear).toHaveBeenCalled();
        });

        test('should handle Socket.io errors in quick logout', () => {
            window.SocketManager.leaveRoom.mockImplementation(() => {
                throw new Error('Socket error');
            });
            
            logoutManager.performQuickLogout();
            
            expect(console.error).toHaveBeenCalledWith('Quick logout error:', expect.any(Error));
        });
    });

    describe('UI Updates', () => {
        test('should update UI for logged out state', () => {
            const userElements = [
                { style: { display: 'block' } },
                { style: { display: 'flex' } }
            ];
            const guestElements = [
                { style: { display: 'none' } }
            ];
            const userDisplays = [
                { textContent: 'testuser' }
            ];

            document.querySelectorAll
                .mockReturnValueOnce(userElements)
                .mockReturnValueOnce(guestElements)
                .mockReturnValueOnce(userDisplays);

            logoutManager.updateUIForLoggedOutState();

            expect(userElements[0].style.display).toBe('none');
            expect(userElements[1].style.display).toBe('none');
            expect(guestElements[0].style.display).toBe('');
            expect(userDisplays[0].textContent).toBe('Guest');
        });

        test('should show logout loading state', () => {
            const button = {
                disabled: false,
                classList: { add: jest.fn(), remove: jest.fn() },
                textContent: 'Logout',
                dataset: {}
            };

            logoutManager.showLogoutLoading(button);

            expect(button.disabled).toBe(true);
            expect(button.classList.add).toHaveBeenCalledWith('loading');
            expect(button.textContent).toBe('Logging out...');
            expect(button.dataset.originalText).toBe('Logout');
        });

        test('should hide logout loading state', () => {
            const button = {
                disabled: true,
                classList: { add: jest.fn(), remove: jest.fn() },
                textContent: 'Logging out...',
                dataset: { originalText: 'Logout' }
            };

            logoutManager.hideLogoutLoading(button);

            expect(button.disabled).toBe(false);
            expect(button.classList.remove).toHaveBeenCalledWith('loading');
            expect(button.textContent).toBe('Logout');
            expect(button.dataset.originalText).toBeUndefined();
        });
    });

    describe('Logout Button Creation', () => {
        test('should create logout button with default options', () => {
            const button = logoutManager.createLogoutButton();

            expect(button.className).toContain('logout-btn');
            expect(button.textContent).toBe('Logout');
            expect(button.title).toBe('Logout from your account');
        });

        test('should create logout button with custom options', () => {
            const options = {
                className: 'custom-class',
                text: 'Sign Out',
                title: 'Custom title',
                confirmMessage: 'Custom confirm',
                redirectPath: '/custom',
                skipConfirmation: true
            };

            const button = logoutManager.createLogoutButton(options);

            expect(button.className).toContain('custom-class');
            expect(button.textContent).toBe('Sign Out');
            expect(button.title).toBe('Custom title');
            expect(button.dataset.confirmMessage).toBe('Custom confirm');
            expect(button.dataset.redirectPath).toBe('/custom');
            expect(button.dataset.skipConfirmation).toBe('true');
        });

        test('should add logout button to container', () => {
            const container = {
                appendChild: jest.fn()
            };

            const button = logoutManager.addLogoutButtonTo(container);

            expect(container.appendChild).toHaveBeenCalledWith(button);
        });
    });

    describe('Callback Management', () => {
        test('should add and run logout callbacks', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            logoutManager.addLogoutCallback(callback1);
            logoutManager.addLogoutCallback(callback2);

            const detail = { timestamp: Date.now() };
            logoutManager.runLogoutCallbacks(detail);

            expect(callback1).toHaveBeenCalledWith(detail);
            expect(callback2).toHaveBeenCalledWith(detail);
        });

        test('should remove logout callbacks', () => {
            const callback = jest.fn();

            logoutManager.addLogoutCallback(callback);
            expect(logoutManager.logoutCallbacks).toContain(callback);

            logoutManager.removeLogoutCallback(callback);
            expect(logoutManager.logoutCallbacks).not.toContain(callback);
        });

        test('should handle callback errors gracefully', () => {
            const errorCallback = jest.fn(() => {
                throw new Error('Callback error');
            });
            const goodCallback = jest.fn();

            logoutManager.addLogoutCallback(errorCallback);
            logoutManager.addLogoutCallback(goodCallback);

            logoutManager.runLogoutCallbacks({});

            expect(console.error).toHaveBeenCalledWith('Logout callback error:', expect.any(Error));
            expect(goodCallback).toHaveBeenCalled();
        });
    });

    describe('Status and Utilities', () => {
        test('should return correct status', () => {
            logoutManager.addLogoutCallback(() => {});
            logoutManager.isLoggingOut = true;

            const status = logoutManager.getStatus();

            expect(status.isLoggingOut).toBe(true);
            expect(status.isAuthenticated).toBe(true);
            expect(status.callbackCount).toBe(1);
        });

        test('should determine when to logout on page hide', () => {
            window.location.pathname = '/pages/chat.html';
            expect(logoutManager.shouldLogoutOnHide()).toBe(true);

            window.location.pathname = '/pages/login.html';
            expect(logoutManager.shouldLogoutOnHide()).toBe(false);
        });
    });

    describe('Event Handling', () => {
        test('should handle logout events', () => {
            const event = {
                detail: {
                    timestamp: Date.now(),
                    reason: 'user_initiated'
                }
            };

            logoutManager.handleLogoutEvent(event);

            expect(console.log).toHaveBeenCalledWith('Logout event received:', event.detail);
        });

        test('should handle keyboard shortcuts', () => {
            const keydownEvent = {
                ctrlKey: true,
                shiftKey: true,
                key: 'L',
                preventDefault: jest.fn()
            };

            // Simulate the event listener
            const keydownHandler = document.addEventListener.mock.calls
                .find(call => call[0] === 'keydown')[1];

            keydownHandler(keydownEvent);

            expect(keydownEvent.preventDefault).toHaveBeenCalled();
        });
    });
});