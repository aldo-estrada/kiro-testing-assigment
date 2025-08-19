/**
 * Client-side routing system with navigation guards and authentication
 */
class ClientRouter {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.isInitialized = false;
        this.history = [];
        this.maxHistoryLength = 50;
        
        // Define route configurations
        this.defineRoutes();
    }

    /**
     * Define all application routes
     */
    defineRoutes() {
        // Public routes (no authentication required)
        this.addRoute('/', {
            name: 'home',
            title: 'Chat Web Room',
            requiresAuth: false,
            component: 'home',
            redirect: () => {
                // Redirect to rooms if authenticated, login if not
                return Auth.isAuthenticated() ? '/rooms' : '/login';
            }
        });

        this.addRoute('/login', {
            name: 'login',
            title: 'Login - Chat Web Room',
            requiresAuth: false,
            component: 'login',
            beforeEnter: (to, from, next) => {
                // Redirect to rooms if already authenticated
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
                // Redirect to rooms if already authenticated
                if (Auth.isAuthenticated()) {
                    next('/rooms');
                } else {
                    next();
                }
            }
        });

        // Protected routes (authentication required)
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
                // Check if room is selected
                const roomId = sessionStorage.getItem('currentRoomId');
                if (!roomId) {
                    next('/rooms');
                } else {
                    next();
                }
            }
        });

        // Catch-all route for 404s
        this.addRoute('*', {
            name: 'notFound',
            title: '404 - Page Not Found',
            requiresAuth: false,
            component: '404',
            redirect: () => Auth.isAuthenticated() ? '/rooms' : '/login'
        });
    }

    /**
     * Add a route to the router
     */
    addRoute(path, config) {
        this.routes.set(path, {
            path,
            ...config
        });
    }

    /**
     * Initialize the router
     */
    init() {
        if (this.isInitialized) {
            console.warn('Router already initialized');
            return;
        }

        console.log('Router initialized');
        this.isInitialized = true;

        // Set up global navigation guards
        this.setupGlobalGuards();

        // Handle initial route
        this.handleRoute();

        // Listen for hash changes (for hash-based routing)
        window.addEventListener('hashchange', () => {
            this.handleRoute();
        });

        // Listen for popstate events (for history API)
        window.addEventListener('popstate', (event) => {
            this.handleRoute(event.state?.path);
        });

        // Handle page load
        window.addEventListener('load', () => {
            this.handleRoute();
        });
    }

    /**
     * Set up global navigation guards
     */
    setupGlobalGuards() {
        // Global before guard for authentication
        this.beforeEach((to, from, next) => {
            console.log(`Navigating from ${from?.path || 'unknown'} to ${to.path}`);

            // Check authentication for protected routes
            if (to.requiresAuth && !Auth.isAuthenticated()) {
                console.log('Route requires authentication, redirecting to login');
                next('/login');
                return;
            }

            // Check if user is authenticated but trying to access auth pages
            if (!to.requiresAuth && Auth.isAuthenticated() && 
                (to.path === '/login' || to.path === '/register')) {
                console.log('User already authenticated, redirecting to rooms');
                next('/rooms');
                return;
            }

            next();
        });

        // Global after guard for logging and analytics
        this.afterEach((to, from) => {
            console.log(`Navigation completed: ${from?.path || 'unknown'} -> ${to.path}`);
            this.addToHistory(to);
        });
    }

    /**
     * Add before navigation hook
     */
    beforeEach(hook) {
        this.beforeEachHooks.push(hook);
    }

    /**
     * Add after navigation hook
     */
    afterEach(hook) {
        this.afterEachHooks.push(hook);
    }

    /**
     * Handle route navigation
     */
    async handleRoute(path = null) {
        try {
            // Get current path
            const currentPath = path || this.getCurrentPath();
            const route = this.matchRoute(currentPath);

            if (!route) {
                console.error(`No route found for path: ${currentPath}`);
                this.navigate('/rooms');
                return;
            }

            // Handle redirects
            if (route.redirect) {
                const redirectPath = typeof route.redirect === 'function' 
                    ? route.redirect() 
                    : route.redirect;
                this.navigate(redirectPath);
                return;
            }

            // Create route objects for navigation guards
            const to = { ...route };
            const from = this.currentRoute;

            // Run global before hooks
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

            // Run route-specific before guard
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

            // Load the route
            await this.loadRoute(route);

            // Update current route
            this.currentRoute = route;

            // Run global after hooks
            for (const hook of this.afterEachHooks) {
                hook(to, from);
            }

        } catch (error) {
            console.error('Route handling error:', error);
            this.navigate('/rooms');
        }
    }

    /**
     * Get current path from URL
     */
    getCurrentPath() {
        // Check for hash-based routing first
        const hash = window.location.hash;
        if (hash && hash.startsWith('#')) {
            return hash.substring(1) || '/';
        }

        // Use pathname for history API routing
        return window.location.pathname;
    }

    /**
     * Match route from path
     */
    matchRoute(path) {
        // Direct match
        if (this.routes.has(path)) {
            return this.routes.get(path);
        }

        // Check for catch-all route
        if (this.routes.has('*')) {
            return this.routes.get('*');
        }

        return null;
    }

    /**
     * Load route component/page
     */
    async loadRoute(route) {
        try {
            // Update document title
            document.title = route.title;

            // Handle different routing strategies based on current page
            const currentPath = window.location.pathname;
            const targetPath = this.getPagePath(route.component);

            // If we're not on the target page, navigate there
            if (currentPath !== targetPath && targetPath !== currentPath) {
                window.location.href = targetPath;
                return;
            }

            // If we're already on the correct page, just update the state
            console.log(`Already on ${route.component} page, updating state`);

        } catch (error) {
            console.error('Error loading route:', error);
            throw error;
        }
    }

    /**
     * Get page path for component
     */
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

    /**
     * Navigate to a route
     */
    navigate(path, replace = false) {
        if (!path) {
            console.error('Navigate called without path');
            return;
        }

        console.log(`Navigating to: ${path}`);

        // Use hash-based routing for client-side navigation
        if (replace) {
            window.location.replace(`#${path}`);
        } else {
            window.location.hash = path;
        }
    }

    /**
     * Go back in history
     */
    back() {
        if (this.history.length > 1) {
            // Remove current route
            this.history.pop();
            // Get previous route
            const previousRoute = this.history[this.history.length - 1];
            this.navigate(previousRoute.path, true);
        } else {
            // Default back behavior
            window.history.back();
        }
    }

    /**
     * Go forward in history
     */
    forward() {
        window.history.forward();
    }

    /**
     * Add route to history
     */
    addToHistory(route) {
        this.history.push({
            path: route.path,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    /**
     * Get current route
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * Get route by name
     */
    getRouteByName(name) {
        for (const route of this.routes.values()) {
            if (route.name === name) {
                return route;
            }
        }
        return null;
    }

    /**
     * Check if route exists
     */
    hasRoute(path) {
        return this.routes.has(path);
    }

    /**
     * Get all routes
     */
    getRoutes() {
        return Array.from(this.routes.values());
    }

    /**
     * Get navigation history
     */
    getHistory() {
        return [...this.history];
    }

    /**
     * Clear navigation history
     */
    clearHistory() {
        this.history = [];
    }

    /**
     * Destroy router instance
     */
    destroy() {
        this.isInitialized = false;
        this.routes.clear();
        this.beforeEachHooks = [];
        this.afterEachHooks = [];
        this.history = [];
        this.currentRoute = null;
    }
}

// Create router instance
const Router = new ClientRouter();

// Make Router available globally
window.Router = Router;