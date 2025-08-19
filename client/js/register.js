/**
 * Registration page functionality
 */
document.addEventListener('DOMContentLoaded', function() {
    // Only run if we're on the register page
    if (!document.getElementById('register-form')) {
        return;
    }

    const form = document.getElementById('register-form');
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const confirmPasswordField = document.getElementById('confirm-password');
    const submitButton = document.getElementById('register-btn');
    const errorContainer = document.getElementById('error-container');
    const successContainer = document.getElementById('success-container');

    // Real-time validation with debouncing
    const debouncedValidateUsername = Validation.debounce(validateUsername, 300);
    const debouncedValidatePassword = Validation.debounce(validatePassword, 300);
    const debouncedValidateConfirmPassword = Validation.debounce(validateConfirmPassword, 300);

    // Event listeners for real-time validation
    usernameField.addEventListener('input', debouncedValidateUsername);
    usernameField.addEventListener('blur', validateUsername);

    passwordField.addEventListener('input', debouncedValidatePassword);
    passwordField.addEventListener('blur', validatePassword);

    confirmPasswordField.addEventListener('input', debouncedValidateConfirmPassword);
    confirmPasswordField.addEventListener('blur', validateConfirmPassword);

    // Form submission
    form.addEventListener('submit', handleSubmit);

    /**
     * Validate username field
     */
    function validateUsername() {
        const username = usernameField.value.trim();
        const validation = Validation.validateUsername(username);
        
        Validation.showFieldError('username', validation.errors);
        return validation.isValid;
    }

    /**
     * Validate password field
     */
    function validatePassword() {
        const password = passwordField.value;
        const validation = Validation.validatePassword(password);
        
        Validation.showFieldError('password', validation.errors);
        
        // Show password strength indicator
        if (password.length > 0) {
            Validation.showPasswordStrength('password', validation.strength);
        }
        
        // Re-validate confirm password if it has a value
        if (confirmPasswordField.value) {
            validateConfirmPassword();
        }
        
        return validation.isValid;
    }

    /**
     * Validate confirm password field
     */
    function validateConfirmPassword() {
        const password = passwordField.value;
        const confirmPassword = confirmPasswordField.value;
        const validation = Validation.validatePasswordConfirmation(password, confirmPassword);
        
        Validation.showFieldError('confirm-password', validation.errors);
        return validation.isValid;
    }

    /**
     * Validate entire form
     */
    function validateForm() {
        const isUsernameValid = validateUsername();
        const isPasswordValid = validatePassword();
        const isConfirmPasswordValid = validateConfirmPassword();
        
        return isUsernameValid && isPasswordValid && isConfirmPasswordValid;
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(event) {
        event.preventDefault();
        
        // Clear previous messages
        hideMessage(errorContainer);
        hideMessage(successContainer);
        
        // Validate form
        if (!validateForm()) {
            showError('Please fix the errors above before submitting.');
            return;
        }
        
        // Get form data
        const formData = {
            username: usernameField.value.trim(),
            password: passwordField.value
        };
        
        // Set loading state
        const loaderId = LoadingManager.showFormLoading(form, {
            message: 'Creating account...'
        });
        
        try {
            // Make registration request with error handling
            const response = await ErrorHandler.wrapAsync(async () => {
                return await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });
            }, { context: 'registration' })();
            
            const data = await response.json();
            
            if (data.success) {
                // Registration successful
                showSuccess('Account created successfully! Redirecting to chat...');
                
                // Store token
                Auth.setToken(data.data.token);
                
                // Redirect to rooms page after a short delay
                setTimeout(() => {
                    Router.navigate('/rooms');
                }, 1500);
                
            } else {
                // Registration failed - let ErrorHandler handle it
                ErrorHandler.handleError({
                    type: 'VALIDATION',
                    message: data.error?.message || 'Registration failed',
                    details: data.error,
                    source: 'registration'
                });
                
                handleRegistrationError(data.error);
            }
            
        } catch (error) {
            // Network errors are already handled by ErrorHandler
            console.error('Registration error:', error);
            showError('Registration failed. Please try again.');
        } finally {
            LoadingManager.hideLoading(loaderId);
        }
    }

    /**
     * Handle registration errors
     */
    function handleRegistrationError(error) {
        if (error.code === 'VALIDATION_ERROR' && error.details) {
            // Show field-specific errors
            error.details.forEach(detail => {
                if (detail.includes('Username')) {
                    Validation.showFieldError('username', [detail]);
                } else if (detail.includes('Password')) {
                    Validation.showFieldError('password', [detail]);
                }
            });
            showError('Please fix the validation errors above.');
        } else if (error.code === 'USERNAME_EXISTS') {
            Validation.showFieldError('username', ['This username is already taken']);
            showError('Username is already taken. Please choose a different one.');
        } else {
            showError(error.message || 'Registration failed. Please try again.');
        }
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
        confirmPasswordField.disabled = isLoading;
    }

    /**
     * Check if user is already authenticated
     */
    function checkAuthStatus() {
        if (Auth.isAuthenticated()) {
            // User is already logged in, redirect to rooms
            Router.navigate('/rooms');
        }
    }

    // Check auth status on page load
    checkAuthStatus();
});