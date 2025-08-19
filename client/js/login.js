/**
 * Login page functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    // Only run if we're on the login page
    if (!document.getElementById('login-form')) {
        return;
    }

    const form = document.getElementById('login-form');
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const rememberMeField = document.getElementById('remember-me');
    const submitButton = document.getElementById('login-btn');
    const errorContainer = document.getElementById('error-container');
    const successContainer = document.getElementById('success-container');

    // Event listeners
    form.addEventListener('submit', handleSubmit);
    usernameField.addEventListener('input', clearFieldErrors);
    passwordField.addEventListener('input', clearFieldErrors);

    // Load saved username if remember me was checked
    loadSavedCredentials();

    /**
     * Handle form submission
     */
    async function handleSubmit(event) {
        event.preventDefault();
        
        // Clear previous messages
        hideMessage(errorContainer);
        hideMessage(successContainer);
        clearAllFieldErrors();
        
        // Get form data
        const formData = {
            username: usernameField.value.trim(),
            password: passwordField.value
        };
        
        // Basic validation
        if (!validateForm(formData)) {
            return;
        }
        
        // Set loading state
        setLoading(true);
        
        try {
            // Make login request
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Login successful
                showSuccess('Login successful! Redirecting to chat...');
                
                // Store token
                Auth.setToken(data.data.token);
                
                // Handle remember me
                handleRememberMe(formData.username);
                
                // Redirect to rooms page after a short delay
                setTimeout(() => {
                    Router.navigate('#rooms');
                }, 1500);
                
            } else {
                // Login failed
                handleLoginError(data.error);
            }
            
        } catch (error) {
            console.error('Login error:', error);
            showError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Validate form data
     */
    function validateForm(formData) {
        let isValid = true;

        if (!formData.username) {
            showFieldError('username', 'Username is required');
            isValid = false;
        }

        if (!formData.password) {
            showFieldError('password', 'Password is required');
            isValid = false;
        }

        if (!isValid) {
            showError('Please fill in all required fields.');
        }

        return isValid;
    }

    /**
     * Handle login errors
     */
    function handleLoginError(error) {
        if (error.code === 'INVALID_CREDENTIALS') {
            showFieldError('username', 'Invalid username or password');
            showFieldError('password', 'Invalid username or password');
            showError('Invalid username or password. Please try again.');
        } else if (error.code === 'MISSING_FIELDS') {
            showError('Please fill in all required fields.');
        } else {
            showError(error.message || 'Login failed. Please try again.');
        }
        
        // Focus on username field for retry
        usernameField.focus();
    }

    /**
     * Handle remember me functionality
     */
    function handleRememberMe(username) {
        if (rememberMeField.checked) {
            // Save username to localStorage
            localStorage.setItem('rememberedUsername', username);
        } else {
            // Remove saved username
            localStorage.removeItem('rememberedUsername');
        }
    }

    /**
     * Load saved credentials
     */
    function loadSavedCredentials() {
        const rememberedUsername = localStorage.getItem('rememberedUsername');
        if (rememberedUsername) {
            usernameField.value = rememberedUsername;
            rememberMeField.checked = true;
            // Focus on password field since username is already filled
            passwordField.focus();
        } else {
            // Focus on username field
            usernameField.focus();
        }
    }

    /**
     * Show field error
     */
    function showFieldError(fieldId, message) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(`${fieldId}-error`);
        const formGroup = field?.closest('.form-group');

        if (field && errorElement && formGroup) {
            errorElement.textContent = message;
            formGroup.classList.add('has-error');
            formGroup.classList.remove('has-success');
        }
    }

    /**
     * Clear field errors
     */
    function clearFieldErrors() {
        clearAllFieldErrors();
        hideMessage(errorContainer);
    }

    /**
     * Clear all field errors
     */
    function clearAllFieldErrors() {
        const errorElements = document.querySelectorAll('.field-error');
        const formGroups = document.querySelectorAll('.form-group');

        errorElements.forEach(element => {
            element.textContent = '';
        });

        formGroups.forEach(group => {
            group.classList.remove('has-error', 'has-success');
        });
    }

    /**
     * Show error message
     */
    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Show success message
     */
    function showSuccess(message) {
        successContainer.textContent = message;
        successContainer.classList.remove('hidden');
        successContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Hide message container
     */
    function hideMessage(container) {
        container.classList.add('hidden');
        container.textContent = '';
    }

    /**
     * Set loading state
     */
    function setLoading(isLoading) {
        submitButton.disabled = isLoading;
        
        if (isLoading) {
            submitButton.querySelector('.btn-text').style.display = 'none';
            submitButton.querySelector('.btn-loading').style.display = 'inline';
        } else {
            submitButton.querySelector('.btn-text').style.display = 'inline';
            submitButton.querySelector('.btn-loading').style.display = 'none';
        }
        
        // Disable form fields during loading
        usernameField.disabled = isLoading;
        passwordField.disabled = isLoading;
        rememberMeField.disabled = isLoading;
    }

    /**
     * Check if user is already authenticated
     */
    function checkAuthStatus() {
        if (Auth.isAuthenticated()) {
            // User is already logged in, redirect to rooms
            Router.navigate('#rooms');
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    function handleKeyboardShortcuts(event) {
        // Enter key in username field should focus password field
        if (event.target === usernameField && event.key === 'Enter') {
            event.preventDefault();
            passwordField.focus();
        }
    }

    // Add keyboard event listeners
    usernameField.addEventListener('keydown', handleKeyboardShortcuts);

    // Check auth status on page load
    checkAuthStatus();
});