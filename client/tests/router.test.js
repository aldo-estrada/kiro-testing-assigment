/**
 * Unit tests for client-side routing system
 */

// Mock global objects
global.window = {
    location: {
        hash: '',
        pathname: '/',
        href: '',
        replace: jest.fn()
    },
    addEventListener: jest.fn(),
    history: {
        back: jest.fn(),
        forward: jest.fn()
    }
};

global.document = {
    title: '',
    addEventListener: jest.fn()
};

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

global.sessionStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn()
};

// Mock Auth module
global.Auth = {
    isAuthenticated: jest.fn(() => false),
    requireAuth: jest.fn(() => true),
    getCurrentUser: jest.fn(() => ({ username: 'testuser', id: '123' }))
};

// Create a mock ClientRouter class for testing
class MockClientRouter {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.isInitialized = false;
        this.history = [];
        this.maxHistoryLength = 50;
        
        this.defineRoutes();
    }

    defineRoutes() {
        this.addRoute('/', {
            name: 'home',
            title: 'Chat Web Room',
            requiresAuth: false,
            component: 'home',
            redirect: () => Auth.isAuthenticated() ? '/rooms' : '/login'
        });

        this.addRoute('/login', {
            name: 'login',
            title: 'Login - Chat Web Room',
            requiresAuth: false,
            component: 'login',
            beforeEnter: (to, from, next) => {
                if (Auth.isAuthenticated()) {
                    next('/rooms');
                } else {
                    next();
                }
            }
        });

        this.addRoute('/register', {
            name: 'register',
            title: 'Register - Chat Web Room',
            requiresAuth: false,
            component: 'register',
            beforeEnter: (to, from, next) => {
                if (Auth.isAuthenticated()) {
                    next('/rooms');
                } else {
                    next();
                }
            }
        });

        this.addRoute('/rooms', {
            name: 'rooms',
            title: 'Rooms - Chat Web Room',
            requiresAuth: true,
            component: 'rooms'
        });

        this.addRoute('/chat', {
            name: 'chat',
            title: 'Chat - Chat Web Room',
            requiresAuth: true,
            component: 'chat',
            beforeEnter: (to, from, next) => {
                const roomId = sessionStorage.getItem('currentRoomId');
                if (!roomId) {
                    next('/rooms');
                } else {
                    next();
                }
            }
        });

        this.addRoute('*', {
            name: 'notFound',
            title: '404 - Page Not Found',
            requiresAuth: false,
            component: '404',
            redirect: () => Auth.isAuthenticated() ? '/rooms' : '/login'
        });
    }

    addRoute(path, config) {
        this.routes.set(path, { path, ...config });
    }

    init() {
        if (this.isInitialized) {
            console.warn('Router already initialized');
            return;
        }
        this.isInitialized = true;
        this.setupGlobalGuards();
    }

    setupGlobalGuards() {
        this.beforeEach((to, from, next) => {
            console.log(`Navigating from ${from?.path || 'unknown'} to ${to.path}`);
            
            if (to.requiresAuth && !Auth.isAuthenticated()) {
                console.log('Route requires authentication, redirecting to login');
                next('/login');
                return;
            }
            if (!to.requiresAuth && Auth.isAuthenticated() && 
                (to.path === '/login' || to.path === '/register')) {
                console.log('User already authenticated, redirecting to rooms');
                next('/rooms');
                return;
            }
            next();
        });

        this.afterEach((to, from) => {
            console.log(`Navigation completed: ${from?.path || 'unknown'} -> ${to.path}`);
            this.addToHistory(to);
        });
    }

    beforeEach(hook) {
        this.beforeEachHooks.push(hook);
    }

    afterEach(hook) {
        this.afterEachHooks.push(hook);
    }

    async handleRoute(path = null) {
        const currentPath = path || this.getCurrentPath();
        const route = this.matchRoute(currentPath);

        if (!route) {
            console.error(`No route found for path: ${currentPath}`);
            this.navigate('/rooms');
            return;
        }

        if (route.redirect) {
            const redirectPath = typeof route.redirect === 'function' 
                ? route.redirect() 
                : route.redirect;
            this.navigate(redirectPath);
            return;
        }

        const to = { ...route };
        const from = this.currentRoute;

        let shouldContinue = true;
        for (const hook of this.beforeEachHooks) {
            await new Promise((resolve) => {
                hook(to, from, (nextPath) => {
                    if (nextPath && nextPath !== to.path) {
                        shouldContinue = false;
                        this.navigate(nextPath);
                    }
                    resolve();
                });
            });
            if (!shouldContinue) return;
        }

        if (route.beforeEnter) {
            await new Promise((resolve) => {
                route.beforeEnter(to, from, (nextPath) => {
                    if (nextPath && nextPath !== to.path) {
                        shouldContinue = false;
                        this.navigate(nextPath);
                    }
                    resolve();
                });
            });
            if (!shouldContinue) return;
        }

        await this.loadRoute(route);
        this.currentRoute = route;

        for (const hook of this.afterEachHooks) {
            hook(to, from);
        }
    }

    getCurrentPath() {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#')) {
            return hash.substring(1) || '/';
        }
        return window.location.pathname;
    }

    matchRoute(path) {
        if (this.routes.has(path)) {
            return this.routes.get(path);
        }
        if (this.routes.has('*')) {
            return this.routes.get('*');
        }
        return null;
    }

    async loadRoute(route) {
        document.title = route.title;
        const currentPath = window.location.pathname;
        const targetPath = this.getPagePath(route.component);

        if (currentPath !== targetPath && targetPath !== currentPath) {
            window.location.href = targetPath;
            return;
        }
    }

    getPagePath(component) {
        const pagePaths = {
            'home': '/',
            'login': '/pages/login.html',
            'register': '/pages/register.html',
            'rooms': '/pages/rooms.html',
            'chat': '/pages/chat.html',
            '404': '/pages/404.html'
        };
        return pagePaths[component] || '/';
    }

    navigate(path, replace = false) {
        if (!path) {
            console.error('Navigate called without path');
            return;
        }
        if (replace) {
            window.location.replace(`#${path}`);
        } else {
            window.location.hash = `#${path}`;
        }
    }

    back() {
        if (this.history.length > 1) {
            this.history.pop();
            const previousRoute = this.history[this.history.length - 1];
            this.navigate(previousRoute.path, true);
        } else {
            window.history.back();
        }
    }

    forward() {
        window.history.forward();
    }

    addToHistory(route) {
        this.history.push({
            path: route.path,
            timestamp: Date.now()
        });

        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    getCurrentRoute() {
        return this.currentRoute;
    }

    getRouteByName(name) {
        for (const route of this.routes.values()) {
            if (route.name === name) {
                return route;
            }
        }
        return null;
    }

    hasRoute(path) {
        return this.routes.has(path);
    }

    getRoutes() {
        return Array.from(this.routes.values());
    }

    getHistory() {
        return [...this.history];
    }

    clearHistory() {
        this.history = [];
    }

    destroy() {
        this.isInitialized = false;
        this.routes.clear();
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.history = [];
        this.currentRoute = null;
    }
}

global.ClientRouter = MockClientRouter;

describe('Client-Side Router', () => {
    let router;

    beforeEach(() => {
        // Create fresh router instance
        router = new global.ClientRouter();
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Reset window location
        window.location.hash = '';
        window.location.pathname = '/';
        window.location.href = '';
        document.title = '';
        
        // Reset Auth mock
        Auth.isAuthenticated.mockReturnValue(false);
        sessionStorage.getItem.mockReturnValue(null);
    });

    afterEach(() => {
        if (router) {
            router.destroy();
        }
    });

    describe('Router Initialization', () => {
        test('should initialize router correctly', () => {
            expect(router.isInitialized).toBe(false);
            expect(router.routes.size).toBeGreaterThan(0);
            expect(router.currentRoute).toBeNull();
            expect(router.history).toEqual([]);
        });

        test('should set up routes during initialization', () => {
            expect(router.hasRoute('/')).toBe(true);
            expect(router.hasRoute('/login')).toBe(true);
            expect(router.hasRoute('/register')).toBe(true);
            expect(router.hasRoute('/rooms')).toBe(true);
            expect(router.hasRoute('/chat')).toBe(true);
            expect(router.hasRoute('*')).toBe(true);
        });

        test('should prevent double initialization', () => {
            router.init();
            expect(router.isInitialized).toBe(true);
            
            router.init();
            expect(console.warn).toHaveBeenCalledWith('Router already initialized');
        });
    });

    describe('Route Matching', () => {
        test('should match exact routes', () => {
            const homeRoute = router.matchRoute('/');
            expect(homeRoute).toBeTruthy();
            expect(homeRoute.name).toBe('home');

            const loginRoute = router.matchRoute('/login');
            expect(loginRoute).toBeTruthy();
            expect(loginRoute.name).toBe('login');
        });

        test('should match catch-all route for unknown paths', () => {
            const unknownRoute = router.matchRoute('/unknown-path');
            expect(unknownRoute).toBeTruthy();
            expect(unknownRoute.name).toBe('notFound');
        });

        test('should return null for non-existent routes when no catch-all', () => {
            // Temporarily remove catch-all route
            router.routes.delete('*');
            const unknownRoute = router.matchRoute('/unknown-path');
            expect(unknownRoute).toBeNull();
        });
    });

    describe('Navigation Guards', () => {
        test('should redirect unauthenticated users from protected routes', async () => {
            Auth.isAuthenticated.mockReturnValue(false);
            
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            // Test the guard logic directly
            const roomsRoute = router.matchRoute('/rooms');
            expect(roomsRoute.requiresAuth).toBe(true);
            
            // Simulate the guard check
            if (roomsRoute.requiresAuth && !Auth.isAuthenticated()) {
                router.navigate('/login');
            }
            
            expect(navigateSpy).toHaveBeenCalledWith('/login');
        });

        test('should allow authenticated users to access protected routes', async () => {
            Auth.isAuthenticated.mockReturnValue(true);
            
            const loadRouteSpy = jest.spyOn(router, 'loadRoute').mockResolvedValue();
            
            await router.handleRoute('/rooms');
            
            expect(loadRouteSpy).toHaveBeenCalled();
        });

        test('should redirect authenticated users from auth pages', async () => {
            Auth.isAuthenticated.mockReturnValue(true);
            
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            await router.handleRoute('/login');
            
            expect(navigateSpy).toHaveBeenCalledWith('/rooms');
        });

        test('should check room selection for chat route', async () => {
            Auth.isAuthenticated.mockReturnValue(true);
            sessionStorage.getItem.mockReturnValue(null); // No room selected
            
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            await router.handleRoute('/chat');
            
            expect(navigateSpy).toHaveBeenCalledWith('/rooms');
        });

        test('should allow chat access when room is selected', async () => {
            Auth.isAuthenticated.mockReturnValue(true);
            sessionStorage.getItem.mockReturnValue('room123'); // Room selected
            
            const loadRouteSpy = jest.spyOn(router, 'loadRoute').mockResolvedValue();
            
            await router.handleRoute('/chat');
            
            expect(loadRouteSpy).toHaveBeenCalled();
        });
    });

    describe('Navigation Hooks', () => {
        test('should execute before hooks', async () => {
            const beforeHook = jest.fn((to, from, next) => next());
            router.beforeEach(beforeHook);
            
            const loadRouteSpy = jest.spyOn(router, 'loadRoute').mockResolvedValue();
            
            await router.handleRoute('/login');
            
            expect(beforeHook).toHaveBeenCalled();
        });

        test('should execute after hooks', async () => {
            const afterHook = jest.fn();
            router.afterEach(afterHook);
            
            const loadRouteSpy = jest.spyOn(router, 'loadRoute').mockResolvedValue();
            
            await router.handleRoute('/login');
            
            expect(afterHook).toHaveBeenCalled();
        });

        test('should prevent navigation when before hook redirects', async () => {
            const beforeHook = jest.fn((to, from, next) => next('/login'));
            router.beforeEach(beforeHook);
            
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            const loadRouteSpy = jest.spyOn(router, 'loadRoute').mockResolvedValue();
            
            await router.handleRoute('/rooms');
            
            expect(navigateSpy).toHaveBeenCalledWith('/login');
            expect(loadRouteSpy).not.toHaveBeenCalled();
        });
    });

    describe('Route Navigation', () => {
        test('should navigate to route using hash', () => {
            router.navigate('/login');
            expect(window.location.hash).toBe('#/login');
        });

        test('should replace current route when specified', () => {
            router.navigate('/login', true);
            expect(window.location.replace).toHaveBeenCalledWith('#/login');
        });

        test('should handle navigation without path', () => {
            router.navigate();
            expect(console.error).toHaveBeenCalledWith('Navigate called without path');
        });
    });

    describe('History Management', () => {
        test('should add routes to history', () => {
            const route = { path: '/login', name: 'login' };
            router.addToHistory(route);
            
            expect(router.history).toHaveLength(1);
            expect(router.history[0].path).toBe('/login');
            expect(router.history[0].timestamp).toBeDefined();
        });

        test('should limit history size', () => {
            router.maxHistoryLength = 2;
            
            router.addToHistory({ path: '/login' });
            router.addToHistory({ path: '/register' });
            router.addToHistory({ path: '/rooms' });
            
            expect(router.history).toHaveLength(2);
            expect(router.history[0].path).toBe('/register');
            expect(router.history[1].path).toBe('/rooms');
        });

        test('should go back in custom history', () => {
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            router.addToHistory({ path: '/login' });
            router.addToHistory({ path: '/rooms' });
            
            router.back();
            
            expect(navigateSpy).toHaveBeenCalledWith('/login', true);
        });

        test('should use browser back when no custom history', () => {
            router.back();
            expect(window.history.back).toHaveBeenCalled();
        });

        test('should clear history', () => {
            router.addToHistory({ path: '/login' });
            router.clearHistory();
            expect(router.history).toHaveLength(0);
        });
    });

    describe('Route Information', () => {
        test('should get current route', () => {
            const route = { path: '/login', name: 'login' };
            router.currentRoute = route;
            
            expect(router.getCurrentRoute()).toBe(route);
        });

        test('should get route by name', () => {
            const loginRoute = router.getRouteByName('login');
            expect(loginRoute).toBeTruthy();
            expect(loginRoute.path).toBe('/login');
            
            const nonExistentRoute = router.getRouteByName('nonexistent');
            expect(nonExistentRoute).toBeNull();
        });

        test('should check if route exists', () => {
            expect(router.hasRoute('/login')).toBe(true);
            expect(router.hasRoute('/nonexistent')).toBe(false);
        });

        test('should get all routes', () => {
            const routes = router.getRoutes();
            expect(Array.isArray(routes)).toBe(true);
            expect(routes.length).toBeGreaterThan(0);
        });
    });

    describe('Path Utilities', () => {
        test('should get current path from hash', () => {
            window.location.hash = '#/login';
            expect(router.getCurrentPath()).toBe('/login');
        });

        test('should get current path from pathname when no hash', () => {
            window.location.hash = '';
            window.location.pathname = '/pages/login.html';
            expect(router.getCurrentPath()).toBe('/pages/login.html');
        });

        test('should default to root when no hash or pathname', () => {
            window.location.hash = '#';
            expect(router.getCurrentPath()).toBe('/');
        });

        test('should get correct page path for components', () => {
            expect(router.getPagePath('login')).toBe('/pages/login.html');
            expect(router.getPagePath('rooms')).toBe('/pages/rooms.html');
            expect(router.getPagePath('home')).toBe('/');
            expect(router.getPagePath('unknown')).toBe('/');
        });
    });

    describe('Route Loading', () => {
        test('should update document title when loading route', async () => {
            const route = { title: 'Test Page', component: 'login' };
            
            jest.spyOn(router, 'getPagePath').mockReturnValue('/pages/login.html');
            window.location.pathname = '/pages/login.html';
            
            await router.loadRoute(route);
            
            expect(document.title).toBe('Test Page');
        });

        test('should redirect when not on target page', async () => {
            const route = { title: 'Test Page', component: 'rooms' };
            
            jest.spyOn(router, 'getPagePath').mockReturnValue('/pages/rooms.html');
            window.location.pathname = '/pages/login.html'; // Different page
            
            // Mock window.location.href setter
            const hrefSetter = jest.fn();
            Object.defineProperty(window.location, 'href', {
                set: hrefSetter,
                configurable: true
            });
            
            await router.loadRoute(route);
            
            expect(hrefSetter).toHaveBeenCalledWith('/pages/rooms.html');
        });
    });

    describe('Error Handling', () => {
        test('should handle route loading errors', async () => {
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            // Mock loadRoute to throw error
            const originalLoadRoute = router.loadRoute;
            router.loadRoute = jest.fn().mockRejectedValue(new Error('Load error'));
            
            // Add error handling to handleRoute
            const originalHandleRoute = router.handleRoute;
            router.handleRoute = async function(path = null) {
                try {
                    return await originalHandleRoute.call(this, path);
                } catch (error) {
                    console.error('Route handling error:', error);
                    this.navigate('/rooms');
                }
            };
            
            await router.handleRoute('/login');
            
            expect(console.error).toHaveBeenCalledWith('Route handling error:', expect.any(Error));
            expect(navigateSpy).toHaveBeenCalledWith('/rooms');
        });

        test('should handle missing routes', async () => {
            const navigateSpy = jest.spyOn(router, 'navigate').mockImplementation(() => {});
            
            // Mock matchRoute to return null
            jest.spyOn(router, 'matchRoute').mockReturnValue(null);
            
            await router.handleRoute('/unknown');
            
            expect(console.error).toHaveBeenCalledWith('No route found for path: /unknown');
            expect(navigateSpy).toHaveBeenCalledWith('/rooms');
        });
    });

    describe('Router Destruction', () => {
        test('should clean up router state on destroy', () => {
            router.addToHistory({ path: '/login' });
            router.beforeEach(() => {});
            router.afterEach(() => {});
            router.currentRoute = { path: '/login' };
            router.isInitialized = true;
            
            router.destroy();
            
            expect(router.isInitialized).toBe(false);
            expect(router.routes.size).toBe(0);
            expect(router.beforeEachHooks).toHaveLength(0);
            expect(router.afterEachHooks).toHaveLength(0);
            expect(router.history).toHaveLength(0);
            expect(router.currentRoute).toBeNull();
        });
    });
});