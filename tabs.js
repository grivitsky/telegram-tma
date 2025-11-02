/**
 * Tab Manager - Handles tab switching with optimized performance and clean architecture
 */

class TabManager {
    constructor() {
        this.tabItems = null;
        this.tabContents = null;
        this.tabContentMap = new Map(); // Cache for quick lookup
        this.currentTabIndex = null;
        this.handlers = new Map(); // Registry for tab-specific handlers
        this.currencyChanged = false; // Flag to track currency changes
        
        // Tab indices as constants (more maintainable than magic strings)
        this.TABS = {
            SPENDINGS: '0',
            CATEGORIZE: '1',
            INSIGHTS: '2',
            SETTINGS: '3'
        };
    }

    /**
     * Initialize the tab manager
     */
    init() {
        this.tabItems = document.querySelectorAll('.tab-item');
        this.tabContents = document.querySelectorAll('.tab-content');
        
        // Build content map for O(1) lookup instead of querySelector
        this.tabContents.forEach(content => {
            const tabIndex = content.getAttribute('data-tab');
            this.tabContentMap.set(tabIndex, content);
        });

        // Set initial active tab
        this.currentTabIndex = this.getActiveTabIndex();

        // Attach click listeners
        this.tabItems.forEach(item => {
            item.addEventListener('click', (e) => this.handleTabClick(e, item));
        });
    }

    /**
     * Register a handler for a specific tab
     * @param {string} tabIndex - Tab index (0-3)
     * @param {Function} handler - Function to call when switching to this tab
     */
    registerHandler(tabIndex, handler) {
        this.handlers.set(tabIndex, handler);
    }

    /**
     * Get the currently active tab index
     * @returns {string|null} Active tab index or null
     */
    getActiveTabIndex() {
        const activeTab = document.querySelector('.tab-content.active');
        return activeTab?.getAttribute('data-tab') || null;
    }

    /**
     * Switch to a specific tab programmatically
     * @param {string} tabIndex - Tab index to switch to
     */
    switchToTab(tabIndex) {
        const tabItem = Array.from(this.tabItems).find(
            item => item.getAttribute('data-tab') === tabIndex
        );
        if (tabItem) {
            this.handleTabSwitch(tabItem, tabIndex, null);
        }
    }

    /**
     * Handle tab click event
     */
    handleTabClick(event, item) {
        const tabIndex = item.getAttribute('data-tab');
        
        // Prevent redundant switching if already active
        if (this.currentTabIndex === tabIndex && item.classList.contains('active')) {
            return;
        }

        this.handleTabSwitch(item, tabIndex, event);
    }

    /**
     * Core tab switching logic
     */
    handleTabSwitch(item, tabIndex, event) {
        // Create ripple effect if it's a user click
        if (event) {
            this.createRipple(event, item);
            this.triggerHapticFeedback('light');
        }

        // Update active states
        this.updateActiveStates(item, tabIndex);

        // Execute tab-specific handler
        this.executeTabHandler(tabIndex);

        // Update current tab index
        this.currentTabIndex = tabIndex;
    }

    /**
     * Update active classes for tabs and content
     */
    updateActiveStates(activeItem, tabIndex) {
        // Remove active class from all tabs and contents
        this.tabItems.forEach(t => t.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab
        activeItem.classList.add('active');

        // Add active class to corresponding content (using cached map)
        const activeContent = this.tabContentMap.get(tabIndex);
        if (activeContent) {
            activeContent.classList.add('active');
        }
    }

    /**
     * Execute the handler for a specific tab
     */
    executeTabHandler(tabIndex) {
        const handler = this.handlers.get(tabIndex);
        if (handler && typeof handler === 'function') {
            handler();
        }
    }

    /**
     * Mark that currency has changed (used by settings tab)
     */
    markCurrencyChanged() {
        this.currencyChanged = true;
    }

    /**
     * Check if currency changed and clear the flag
     */
    hasCurrencyChanged() {
        if (this.currencyChanged) {
            this.currencyChanged = false;
            return true;
        }
        return false;
    }

    /**
     * Create ripple effect for tab click
     */
    createRipple(event, element) {
        const ripple = document.createElement('span');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        element.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }

    /**
     * Trigger haptic feedback
     */
    triggerHapticFeedback(type = 'light') {
        if (typeof tgWebApp === 'undefined' || !tgWebApp) {
            return;
        }

        if (tgWebApp.HapticFeedback) {
            try {
                tgWebApp.HapticFeedback.impactOccurred(type);
            } catch (e) {
                // Fallback if HapticFeedback not available
                if (tgWebApp.impactOccurred) {
                    tgWebApp.impactOccurred(type);
                }
            }
        }
    }
}

// Create global instance
const tabManager = new TabManager();

