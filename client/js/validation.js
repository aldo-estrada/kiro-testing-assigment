/**
 * Client-side validation utilities
 */
const Validation = {
    /**
     * Validate username
     * @param {string} username 
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    validateUsername(username) {
        const errors = [];

        if (!username) {
            errors.push('Username is required');
        } else {
            if (typeof username !== 'string') {
                errors.push('Username must be a string');
            } else {
                const trimmed = username.trim();
                if (trimmed.length < 3) {
                    errors.push('Username must be at least 3 characters long');
                }
                if (trimmed.length > 30) {
                    errors.push('Username must be no more than 30 characters long');
                }
                if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
                    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate password
     * @param {string} password 
     * @returns {Object} { isValid: boolean, errors: string[], strength: string }
     */
    validatePassword(password) {
        const errors = [];
        let strength = 'weak';

        if (!password) {
            errors.push('Password is required');
        } else {
            if (typeof password !== 'string') {
                errors.push('Password must be a string');
            } else {
                if (password.length < 6) {
                    errors.push('Password must be at least 6 characters long');
                }
                if (password.length > 100) {
                    errors.push('Password must be no more than 100 characters long');
                }

                // Calculate password strength
                strength = this.calculatePasswordStrength(password);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            strength
        };
    },

    /**
     * Calculate password strength
     * @param {string} password 
     * @returns {string} 'weak' | 'medium' | 'strong'
     */
    calculatePasswordStrength(password) {
        if (!password || password.length < 6) {
            return 'weak';
        }

        let score = 0;

        // Length bonus
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;

        // Character variety
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;

        if (score < 3) return 'weak';
        if (score < 5) return 'medium';
        return 'strong';
    },

    /**
     * Validate password confirmation
     * @param {string} password 
     * @param {string} confirmPassword 
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    validatePasswordConfirmation(password, confirmPassword) {
        const errors = [];

        if (!confirmPassword) {
            errors.push('Password confirmation is required');
        } else if (password !== confirmPassword) {
            errors.push('Passwords do not match');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate email (if needed in future)
     * @param {string} email 
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    validateEmail(email) {
        const errors = [];

        if (!email) {
            errors.push('Email is required');
        } else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                errors.push('Please enter a valid email address');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    /**
     * Show field error
     * @param {string} fieldId 
     * @param {string[]} errors 
     */
    showFieldError(fieldId, errors) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(`${fieldId}-error`);
        const formGroup = field?.closest('.form-group');

        if (field && errorElement && formGroup) {
            if (errors.length > 0) {
                errorElement.textContent = errors[0];
                formGroup.classList.add('has-error');
                formGroup.classList.remove('has-success');
            } else {
                errorElement.textContent = '';
                formGroup.classList.remove('has-error');
                formGroup.classList.add('has-success');
            }
        }
    },

    /**
     * Clear field error
     * @param {string} fieldId 
     */
    clearFieldError(fieldId) {
        const field = document.getElementById(fieldId);
        const errorElement = document.getElementById(`${fieldId}-error`);
        const formGroup = field?.closest('.form-group');

        if (field && errorElement && formGroup) {
            errorElement.textContent = '';
            formGroup.classList.remove('has-error', 'has-success');
        }
    },

    /**
     * Show password strength indicator
     * @param {string} fieldId 
     * @param {string} strength 
     */
    showPasswordStrength(fieldId, strength) {
        const field = document.getElementById(fieldId);
        const formGroup = field?.closest('.form-group');
        
        if (!formGroup) return;

        // Remove existing strength indicator
        const existingIndicator = formGroup.querySelector('.password-strength');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        // Create new strength indicator
        const strengthContainer = document.createElement('div');
        strengthContainer.className = 'password-strength';
        
        const bars = [];
        for (let i = 0; i < 3; i++) {
            const bar = document.createElement('div');
            bar.className = 'strength-bar';
            bars.push(bar);
            strengthContainer.appendChild(bar);
        }

        const strengthText = document.createElement('div');
        strengthText.className = 'strength-text';
        
        // Set strength level
        switch (strength) {
            case 'weak':
                bars[0].classList.add('weak');
                strengthText.textContent = 'Weak password';
                break;
            case 'medium':
                bars[0].classList.add('medium');
                bars[1].classList.add('medium');
                strengthText.textContent = 'Medium password';
                break;
            case 'strong':
                bars[0].classList.add('strong');
                bars[1].classList.add('strong');
                bars[2].classList.add('strong');
                strengthText.textContent = 'Strong password';
                break;
        }

        strengthContainer.appendChild(strengthText);
        
        // Insert after the input field
        const helpText = formGroup.querySelector('.field-help');
        if (helpText) {
            formGroup.insertBefore(strengthContainer, helpText);
        } else {
            formGroup.appendChild(strengthContainer);
        }
    },

    /**
     * Debounce function for real-time validation
     * @param {Function} func 
     * @param {number} wait 
     * @returns {Function}
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Make Validation available globally
window.Validation = Validation;