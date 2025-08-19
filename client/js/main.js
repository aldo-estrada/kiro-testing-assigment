// Main application initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('Chat Web Room application loaded');
    
    // Initialize router
    if (typeof Router !== 'undefined') {
        Router.init();
    }
    
    // Check authentication status
    if (typeof Auth !== 'undefined') {
        Auth.checkAuthStatus();
    }
});

// Global functions for navigation
function showLogin() {
    window.location.href = '/pages/login.html';
}

function showRegister() {
    window.location.href = '/pages/register.html';
}