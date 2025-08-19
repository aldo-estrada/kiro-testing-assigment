/**
 * Loading states manager for consistent loading indicators
 */
class LoadingManager {
    constructor() {
        this.activeLoaders = new Map();
        this.globalLoadingCount = 0;
        this.loadingCallbacks = [];
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize loading manager
     */
    init() {
        if (this.isInitialized) return;
        
        this.setupGlobalLoadingIndicator();
        this.isInitialized = true;
        
        console.log('LoadingManager initialized');
    }

    /**
     * Set up global loading indicator
     */
    setupGlobalLoadingIndicator() {
        // Create global loading overlay
        const overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = 'global-loading-overlay hidden';
        overlay.innerHTML = `
            <div class="global-loading-content">
                <div class="global-loading-spinner"></div>
                <div class="global-loading-message">Loading...</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    /**
     * Show loading state for a specific element
     */
    showLoading(element, options = {}) {
        if (!element) {
            console.warn('LoadingManager.showLoading: element is required');
            return null;
        }

        const loaderId = this.generateLoaderId();
        const config = {
            id: loaderId,
            element,
            message: options.message || 'Loading...',
            overlay: options.overlay !== false,
            spinner: options.spinner !== false,
            disableElement: options.disableElement !== false,
            className: options.className || '',
            position: options.position || 'center',
            size: options.size || 'medium',
            ...options
        };

        // Create loading indicator
        const loader = this.createLoader(config);
        
        // Store loader reference
        this.activeLoaders.set(loaderId, {
            config,
            loader,
            startTime: Date.now()
        });

        // Apply loading state to element
        this.applyLoadingState(element, loader, config);

        // Update global loading count
        this.updateGlobalLoading(1);

        return loaderId;
    }

    /**
     * Hide loading state
     */
    hideLoading(loaderId) {
        if (!loaderId || !this.activeLoaders.has(loaderId)) {
            return false;
        }

        const { config, loader } = this.activeLoaders.get(loaderId);
        
        // Remove loading state from element
        this.removeLoadingState(config.element, loader, config);
        
        // Remove loader reference
        this.activeLoaders.delete(loaderId);

        // Update global loading count
        this.updateGlobalLoading(-1);

        return true;
    }

    /**
     * Generate unique loader ID
     */
    generateLoaderId() {
        return `loader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Create loader element
     */
    createLoader(config) {
        const loader = document.createElement('div');
        loader.className = `loading-indicator ${config.className}`;
        loader.setAttribute('data-loader-id', config.id);
        loader.setAttribute('aria-label', config.message);
        loader.setAttribute('role', 'status');

        const content = document.createElement('div');
        content.className = `loading-content loading-${config.position} loading-${config.size}`;

        if (config.spinner) {
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            content.appendChild(spinner);
        }

        if (config.message) {
            const message = document.createElement('div');
            message.className = 'loading-message';
            message.textContent = config.message;
            content.appendChild(message);
        }

        loader.appendChild(content);
        return loader;
    }

    /**
     * Apply loading state to element
     */
    applyLoadingState(element, loader, config) {
        // Add loading class to element
        element.classList.add('loading-active');
        
        // Disable element if configured
        if (config.disableElement) {
            this.disableElement(element);
        }

        // Add overlay if configured
        if (config.overlay) {
            this.addOverlay(element, loader);
        } else {
            // Insert loader directly
            element.appendChild(loader);
        }

        // Store original element state
        element.setAttribute('data-original-disabled', element.disabled || false);
        element.setAttribute('data-original-readonly', element.readOnly || false);
    }

    /**
     * Remove loading state from element
     */
    removeLoadingState(element, loader, config) {
        // Remove loading class
        element.classList.remove('loading-active');
        
        // Re-enable element if it was disabled
        if (config.disableElement) {
            this.enableElement(element);
        }

        // Remove loader
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }

        // Clean up attributes
        element.removeAttribute('data-original-disabled');
        element.removeAttribute('data-original-readonly');
    }

    /**
     * Add overlay to element
     */
    addOverlay(element, loader) {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.appendChild(loader);

        // Position overlay relative to element
        const rect = element.getBoundingClientRect();
        const isFixed = window.getComputedStyle(element).position === 'fixed';
        
        if (isFixed) {
            overlay.style.position = 'fixed';
            overlay.style.top = rect.top + 'px';
            overlay.style.left = rect.left + 'px';
        } else {
            overlay.style.position = 'absolute';
            
            // Make element relative if it's not positioned
            const elementPosition = window.getComputedStyle(element).position;
            if (elementPosition === 'static') {
                element.style.position = 'relative';
            }
        }

        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';

        document.body.appendChild(overlay);
    }

    /**
     * Disable element
     */
    disableElement(element) {
        if (element.tagName === 'BUTTON' || element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
            element.disabled = true;
        } else {
            element.style.pointerEvents = 'none';
            element.setAttribute('aria-disabled', 'true');
        }
    }

    /**
     * Enable element
     */
    enableElement(element) {
        const originalDisabled = element.getAttribute('data-original-disabled') === 'true';
        
        if (!originalDisabled) {
            if (element.tagName === 'BUTTON' || element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
                element.disabled = false;
            } else {
                element.style.pointerEvents = '';
                element.removeAttribute('aria-disabled');
            }
        }
    }

    /**
     * Update global loading state
     */
    updateGlobalLoading(delta) {
        this.globalLoadingCount += delta;
        
        const overlay = document.getElementById('global-loading-overlay');
        if (!overlay) return;

        if (this.globalLoadingCount > 0) {
            overlay.classList.remove('hidden');
            document.body.classList.add('global-loading');
        } else {
            overlay.classList.add('hidden');
            document.body.classList.remove('global-loading');
        }

        // Notify callbacks
        this.notifyLoadingCallbacks({
            isLoading: this.globalLoadingCount > 0,
            count: this.globalLoadingCount
        });
    }

    /**
     * Show global loading
     */
    showGlobalLoading(message = 'Loading...') {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            const messageEl = overlay.querySelector('.global-loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            overlay.classList.remove('hidden');
            document.body.classList.add('global-loading');
        }
        
        return 'global';
    }

    /**
     * Hide global loading
     */
    hideGlobalLoading() {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            document.body.classList.remove('global-loading');
        }
    }

    /**
     * Show loading for button
     */
    showButtonLoading(button, options = {}) {
        if (!button) return null;

        const originalText = button.textContent;
        const loadingText = options.loadingText || 'Loading...';
        
        button.setAttribute('data-original-text', originalText);
        button.textContent = loadingText;
        button.disabled = true;
        button.classList.add('loading');

        const loaderId = this.generateLoaderId();
        this.activeLoaders.set(loaderId, {
            config: { type: 'button', element: button, originalText },
            loader: null,
            startTime: Date.now()
        });

        return loaderId;
    }

    /**
     * Hide button loading
     */
    hideButtonLoading(loaderId) {
        if (!loaderId || !this.activeLoaders.has(loaderId)) {
            return false;
        }

        const { config } = this.activeLoaders.get(loaderId);
        
        if (config.type === 'button') {
            const button = config.element;
            const originalText = button.getAttribute('data-original-text');
            
            button.textContent = originalText || 'Submit';
            button.disabled = false;
            button.classList.remove('loading');
            button.removeAttribute('data-original-text');
        }

        this.activeLoaders.delete(loaderId);
        return true;
    }

    /**
     * Show loading for form
     */
    showFormLoading(form, options = {}) {
        if (!form) return null;

        const config = {
            message: options.message || 'Processing...',
            disableInputs: options.disableInputs !== false,
            ...options
        };

        const loaderId = this.showLoading(form, config);

        if (config.disableInputs) {
            const inputs = form.querySelectorAll('input, button, select, textarea');
            inputs.forEach(input => {
                input.disabled = true;
            });
        }

        return loaderId;
    }

    /**
     * Wrap async function with loading state
     */
    wrapWithLoading(asyncFn, element, options = {}) {
        return async (...args) => {
            const loaderId = this.showLoading(element, options);
            
            try {
                const result = await asyncFn(...args);
                return result;
            } finally {
                this.hideLoading(loaderId);
            }
        };
    }

    /**
     * Wrap button click with loading state
     */
    wrapButtonClick(button, asyncFn, options = {}) {
        const originalHandler = button.onclick;
        
        button.onclick = async (event) => {
            const loaderId = this.showButtonLoading(button, options);
            
            try {
                if (originalHandler) {
                    await originalHandler.call(button, event);
                } else {
                    await asyncFn(event);
                }
            } finally {
                this.hideButtonLoading(loaderId);
            }
        };
    }

    /**
     * Add loading callback
     */
    onLoadingChange(callback) {
        this.loadingCallbacks.push(callback);
    }

    /**
     * Remove loading callback
     */
    offLoadingChange(callback) {
        const index = this.loadingCallbacks.indexOf(callback);
        if (index > -1) {
            this.loadingCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify loading callbacks
     */
    notifyLoadingCallbacks(state) {
        this.loadingCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                console.error('Loading callback error:', error);
            }
        });
    }

    /**
     * Get active loaders
     */
    getActiveLoaders() {
        return Array.from(this.activeLoaders.entries()).map(([id, data]) => ({
            id,
            duration: Date.now() - data.startTime,
            config: data.config
        }));
    }

    /**
     * Clear all loading states
     */
    clearAllLoading() {
        const loaderIds = Array.from(this.activeLoaders.keys());
        loaderIds.forEach(id => this.hideLoading(id));
        this.hideGlobalLoading();
    }

    /**
     * Get loading statistics
     */
    getLoadingStats() {
        return {
            active: this.activeLoaders.size,
            global: this.globalLoadingCount,
            loaders: this.getActiveLoaders()
        };
    }

    /**
     * Destroy loading manager
     */
    destroy() {
        this.clearAllLoading();
        this.activeLoaders.clear();
        this.loadingCallbacks = [];
        this.isInitialized = false;

        // Remove global loading overlay
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.remove();
        }

        document.body.classList.remove('global-loading');
    }
}

// Create global loading manager instance
const loadingManager = new LoadingManager();

// Make it available globally
window.LoadingManager = loadingManager;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingManager;
}