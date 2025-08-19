// Simple client-side router
const Router = {
    init() {
        console.log('Router initialized');
        this.handleRoute();
        
        // Listen for hash changes
        window.addEventListener('hashchange', () => {
            this.handleRoute();
        });
    },
    
    handleRoute() {
        const hash = window.location.hash || '#home';
        console.log('Current route:', hash);
        
        switch(hash) {
            case '#home':
                this.showHome();
                break;
            case '#login':
                this.showLogin();
                break;
            case '#register':
                this.showRegister();
                break;
            case '#rooms':
                this.showRooms();
                break;
            case '#chat':
                this.showChat();
                break;
            default:
                this.showHome();
        }
    },
    
    showHome() {
        console.log('Showing home page');
        this.loadPage('/', 'Chat Web Room');
    },
    
    showLogin() {
        console.log('Showing login page');
        this.loadPage('/pages/login.html', 'Login - Chat Web Room');
    },
    
    showRegister() {
        console.log('Showing register page');
        this.loadPage('/pages/register.html', 'Register - Chat Web Room');
    },
    
    showRooms() {
        console.log('Showing rooms page');
        // Check authentication
        if (!Auth.isAuthenticated()) {
            this.navigate('#login');
            return;
        }
        this.loadPage('/pages/rooms.html', 'Rooms - Chat Web Room');
    },
    
    showChat() {
        console.log('Showing chat page');
        // Check authentication
        if (!Auth.isAuthenticated()) {
            this.navigate('#login');
            return;
        }
        this.loadPage('/pages/chat.html', 'Chat - Chat Web Room');
    },
    
    loadPage(url, title) {
        // For now, just redirect to the page
        // In a real SPA, we would load content dynamically
        if (url === '/') {
            // Stay on current page for home
            document.title = title;
        } else {
            // Check if we're already on the target page
            const currentPath = window.location.pathname;
            if (currentPath !== url) {
                window.location.href = url;
            } else {
                // Already on the page, just update title
                document.title = title;
            }
        }
    },
    
    navigate(route) {
        window.location.hash = route;
    }
};

// Make Router available globally
window.Router = Router;