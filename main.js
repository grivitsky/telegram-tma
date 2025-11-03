
    const totalEl = document.getElementById('total');
    const listEl  = document.getElementById('transactions');

    // Store loadData function globally so it can be called when switching tabs
    let spendingsLoadData = null;
    let currentPeriod = 'month'; // Default period

    // Store functions for tab-specific actions
    let categorizeLoadFunctions = null;
    let loadCurrentCurrency = null;
    let insightsLoadData = null;

    // Store Telegram WebApp instance for haptic feedback
    let tgWebApp = null;
    
    // Store insights data
    let insightsPeriod = 'month'; // Default insights period

    // Store current currency code globally
    let currentCurrencyCode = 'USD'; // Default to USD

    // Initialize tab manager
    tabManager.init();

    // Register tab handlers
    tabManager.registerHandler(tabManager.TABS.SPENDINGS, () => {
        // Reload Spendings data when switching to Spendings tab
        // This ensures currency is up-to-date if it was changed in settings
        if (spendingsLoadData) {
            // Check if currency changed and we need to reload
            if (tabManager.hasCurrencyChanged()) {
                spendingsLoadData(false, false); // Disable haptics for background reload
            } else {
                spendingsLoadData();
            }
        }
    });

    tabManager.registerHandler(tabManager.TABS.CATEGORIZE, () => {
        // Load categorize data when switching to Categorize tab
        if (categorizeLoadFunctions) {
            categorizeLoadFunctions();
        }
    });

    tabManager.registerHandler(tabManager.TABS.INSIGHTS, () => {
        // Load Insights data when switching to Insights tab
        if (insightsLoadData) {
            insightsLoadData();
        }
    });

    tabManager.registerHandler(tabManager.TABS.SETTINGS, () => {
        // Load current currency when switching to Settings tab
        if (loadCurrentCurrency) {
            loadCurrentCurrency();
        }
    });

    // Helper function to get active tab index (for other parts of code)
    function getActiveTabIndex() {
        return tabManager.getActiveTabIndex();
    }

    function setError(msg) {
        totalEl.innerHTML = '<span class="currency-label">Error:</span> <span class="amount-value">' + msg + '</span>';
    }

    function formatDateHeader(date) {
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const dayName = days[date.getDay()];
        const day = date.getDate();
        const month = months[date.getMonth()];
        return `${dayName}, ${day} ${month}`;
    }

    function formatTime(date) {
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minutesStr = minutes.toString().padStart(2, '0');
        return `${hours}:${minutesStr} ${ampm}`;
    }

    function formatAmount(amount) {
        const absAmount = Math.abs(amount);
        const parts = absAmount.toFixed(2).split('.');
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `${parts[1] ? integerPart + ',' + parts[1] : integerPart}`;
    }

    function truncateName(name) {
        if (!name) return '';
        if (name.length <= 12) return name;
        return name.substring(0, 12) + '...';
    }

    // Function to create total skeleton HTML
    function createTotalSkeleton() {
        return `
            <div id="total-skeleton" class="skeleton-total">
                <span class="skeleton-box skeleton-currency"></span>
                <span class="skeleton-box skeleton-amount"></span>
            </div>
        `;
    }

    // Function to create transactions skeleton HTML
    function createTransactionsSkeleton() {
        return `
            <div id="transactions-skeleton" class="skeleton-transactions">
                <div class="skeleton-transaction-group">
                    <div class="skeleton-date-header">
                        <span class="skeleton-box skeleton-date-label"></span>
                        <span class="skeleton-box skeleton-date-subtotal"></span>
                    </div>
                    <div class="skeleton-date-divider"></div>
                    <div class="skeleton-transaction">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-box skeleton-name"></div>
                            <div class="skeleton-box skeleton-time"></div>
                        </div>
                        <div class="skeleton-box skeleton-amount-right"></div>
                    </div>
                    <div class="skeleton-transaction">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-box skeleton-name"></div>
                            <div class="skeleton-box skeleton-time"></div>
                        </div>
                        <div class="skeleton-box skeleton-amount-right"></div>
                    </div>
                    <div class="skeleton-transaction">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-box skeleton-name"></div>
                            <div class="skeleton-box skeleton-time"></div>
                        </div>
                        <div class="skeleton-box skeleton-amount-right"></div>
                    </div>
                </div>
                <div class="skeleton-transaction-group">
                    <div class="skeleton-date-header">
                        <span class="skeleton-box skeleton-date-label"></span>
                        <span class="skeleton-box skeleton-date-subtotal"></span>
                    </div>
                    <div class="skeleton-transaction">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-box skeleton-name"></div>
                            <div class="skeleton-box skeleton-time"></div>
                        </div>
                        <div class="skeleton-box skeleton-amount-right"></div>
                    </div>
                    <div class="skeleton-transaction">
                        <div class="skeleton-icon"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-box skeleton-name"></div>
                            <div class="skeleton-box skeleton-time"></div>
                        </div>
                        <div class="skeleton-box skeleton-amount-right"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // Function to show skeleton loaders
    function showSkeletons() {
        const totalSkeleton = document.getElementById('total-skeleton');
        const transactionsSkeleton = document.getElementById('transactions-skeleton');
        
        // Recreate skeletons if they don't exist (e.g., after tab switch)
        if (!totalSkeleton && totalEl) {
            totalEl.innerHTML = createTotalSkeleton();
        } else if (totalSkeleton) {
            totalSkeleton.style.display = 'block';
        }
        
        if (!transactionsSkeleton && listEl) {
            listEl.innerHTML = createTransactionsSkeleton();
        } else if (transactionsSkeleton) {
            transactionsSkeleton.style.display = 'block';
        }
    }

    // Function to hide skeleton loaders
    function hideSkeletons() {
        const totalSkeleton = document.getElementById('total-skeleton');
        const transactionsSkeleton = document.getElementById('transactions-skeleton');
        if (totalSkeleton) totalSkeleton.style.display = 'none';
        if (transactionsSkeleton) transactionsSkeleton.style.display = 'none';
    }

    // Show skeletons initially - wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showSkeletons);
    } else {
        showSkeletons();
    }
    
    // Check if Telegram WebApp SDK is available
    if (typeof Telegram === 'undefined' || !Telegram.WebApp) {
        setError('Telegram Web App SDK not loaded');
        console.error('Telegram WebApp SDK is not available');
        hideSkeletons();
    } else {
        const tg = Telegram.WebApp;
        tg.ready();
        
        // Store Telegram WebApp instance for haptic feedback in tabs
        tgWebApp = tg;

        async function loadData(showLoadingState = true, enableHaptics = true) {
            try {
                if (!tg || !tg.initData) {
                    setError('Open inside Telegram');
                    console.warn('No initData — likely opened outside Telegram WebApp.');
                    hideSkeletons();
                    return;
                }

                // Show skeletons when loading (unless already showing)
                if (showLoadingState) {
                    showSkeletons();
                }

                // Ensure user exists in database (create if new user)
                // Skip if already verified during initialization
                if (!window._preVerifiedUser) {
                    console.log('➡️ Verifying/creating user via /api/auth/verify');
                    try {
                        const userRes = await fetch('/api/auth/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ initData: tg.initData })
                        });
                        if (!userRes.ok) {
                            const errorText = await userRes.text();
                            let errorMsg = 'Failed to verify user';
                            try {
                                const errorData = JSON.parse(errorText);
                                errorMsg = errorData.error || errorMsg;
                            } catch (e) {
                                errorMsg = `HTTP ${userRes.status}: ${errorText || 'Unknown error'}`;
                            }
                            setError(errorMsg);
                            hideSkeletons();
                            return;
                        }
                        const userData = await userRes.json();
                        if (!userData.ok || !userData.user) {
                            setError('Failed to verify user');
                            hideSkeletons();
                            return;
                        }
                        console.log('✅ User verified/created:', userData.user.id);
                        window._preVerifiedUser = userData.user;
                    } catch (err) {
                        console.error('Failed to verify user:', err);
                        setError('Failed to verify user');
                        hideSkeletons();
                        return;
                    }
                } else {
                    console.log('✅ Using pre-verified user:', window._preVerifiedUser.id);
                    // Clear the pre-verified flag after first use
                    delete window._preVerifiedUser;
                }

                console.log('➡️ Fetching /api/spendings/list with period:', currentPeriod);
                const res = await fetch('/api/spendings/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        initData: tg.initData,
                        period: currentPeriod
                    })
                });

                console.log('⬅️ Response status:', res.status);
                
                if (!res.ok) {
                    const errorText = await res.text();
                    let errorMsg = 'Network error';
                    try {
                        const errorData = JSON.parse(errorText);
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) {
                        errorMsg = `HTTP ${res.status}: ${errorText || 'Unknown error'}`;
                    }
                    setError(errorMsg);
                    hideSkeletons();
                    return;
                }

                const data = await res.json();
                console.log('⬅️ Response body:', data);

                if (!data.ok) {
                    setError(data.error || 'Unknown API error');
                    hideSkeletons();
                    return;
                }

                // Format total amount
                const total = Number(data.total);
                totalEl.innerHTML = `
                    <span class="currency-label">${currentCurrencyCode}</span>
                    <span class="amount-value">${formatAmount(total)}</span>
                `;
                // Clear any existing animation classes and add hidden class initially, then animate
                totalEl.classList.remove('total-reveal');
                totalEl.classList.add('total-hidden');

                // Group spendings by date
                const groupedByDate = {};
                for (const s of data.spendings) {
                    const date = new Date(s.created_at || s.date_of_log);
                    const dateKey = date.toDateString();
                    if (!groupedByDate[dateKey]) {
                        groupedByDate[dateKey] = [];
                    }
                    groupedByDate[dateKey].push(s);
                }

                // Sort dates descending
                const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
                    return new Date(b) - new Date(a);
                });

                listEl.innerHTML = '';
                
                // Collect all transaction elements for stagger animation
                const allTransactionElements = [];
                
                if (sortedDates.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'empty-state';
                    const periodText = currentPeriod === 'today' ? 'today' : 
                                     currentPeriod === 'week' ? 'this week' :
                                     currentPeriod === 'month' ? 'this month' : 'this year';
                    empty.innerText = `No transactions ${periodText}.`;
                    listEl.appendChild(empty);
                    // Hide skeleton immediately for empty state
                    hideSkeletons();
                    // Animate total reveal for empty state
                    setTimeout(() => {
                        totalEl.classList.remove('total-hidden');
                        totalEl.classList.add('total-reveal');
                    }, 50);
                } else {
                    for (const dateKey of sortedDates) {
                        const date = new Date(dateKey);
                        const transactions = groupedByDate[dateKey];
                        
                        // Calculate daily subtotal
                        const dailyTotal = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
                        
                        // Create date group container
                        const dateGroup = document.createElement('div');
                        dateGroup.className = 'date-group';
                        
                        // Date header
                        const dateHeader = document.createElement('div');
                        dateHeader.className = 'date-header';
                        dateHeader.innerHTML = `
                            <span class="date-label">${formatDateHeader(date)}</span>
                            <span class="daily-subtotal">${formatAmount(dailyTotal)} ${currentCurrencyCode}</span>
                        `;
                        dateGroup.appendChild(dateHeader);
                        
                        // Date divider
                        const divider = document.createElement('div');
                        divider.className = 'date-divider';
                        dateGroup.appendChild(divider);
                        
                        // Transactions for this date
                        for (const s of transactions) {
                            const item = document.createElement('div');
                            item.className = 'transaction transaction-hidden';
                            const transDate = new Date(s.created_at || s.date_of_log);
                            
                            // Get category info (handle both direct category object and nested categories object)
                            const category = s.categories || s.category || null;
                            const emoji = category?.emoji || '❓';
                            const color = category?.color || '#9E9E9E';
                            
                            item.innerHTML = `
                                <div class="icon" style="background-color: ${color}">
                                    <span class="icon-emoji">${emoji}</span>
                                </div>
                                <div class="info">
                                    <div class="name">${s.name}</div>
                                    <div class="time">${formatTime(transDate)}</div>
                                </div>
                                <div class="amount">${formatAmount(Number(s.amount))} ${currentCurrencyCode}</div>
                            `;
                            item.style.cursor = 'pointer';
                            item.setAttribute('data-spending-id', s.id);
                            item.addEventListener('click', () => openEditView(s));
                            dateGroup.appendChild(item);
                            allTransactionElements.push(item);
                        }
                        
                        listEl.appendChild(dateGroup);
                    }
                    
                    // Hide skeleton and animate total first
                    hideSkeletons();
                    
                    // Animate total reveal (without haptic)
                    setTimeout(() => {
                        totalEl.classList.remove('total-hidden');
                        totalEl.classList.add('total-reveal');
                    }, 50);
                    
                    // Animate transactions one by one with stagger effect (40% faster total: 32ms)
                    allTransactionElements.forEach((transaction, index) => {
                        setTimeout(() => {
                            transaction.classList.remove('transaction-hidden');
                            transaction.classList.add('transaction-reveal');
                        }, index * 32); // 32ms delay between each transaction animation (20% faster again)
                    });
                    
                    // Haptic feedback: "Reveal Settle Sequence" - 5 impulses with decreasing intensity (50% gentler total)
                    // Pattern aligned to card animation frames (approx. 100–120ms apart)
                    // Only play haptics if enabled and we're on the Spendings tab
                    if (enableHaptics && tgWebApp && tgWebApp.HapticFeedback) {
                        if (getActiveTabIndex() === tabManager.TABS.SPENDINGS) {
                            const hapticPattern = [
                                { timing: 0, type: 'medium' },      // 1️⃣ Medium impact (intensity ~0.55, 20% gentler) - t = 0ms
                                { timing: 120, type: 'soft' },       // 2️⃣ Soft-medium (intensity ~0.35, 20% gentler) - t = +120ms
                                { timing: 240, type: 'light' },     // 3️⃣ Light (intensity ~0.2, 20% gentler) - t = +240ms
                                { timing: 360, type: 'light' },     // 4️⃣ Gentle (intensity ~0.2, already gentlest) - t = +360ms
                                { timing: 480, type: 'light' }      // 5️⃣ Gentle tick (intensity ~0.2, already gentlest) - t = +480ms
                            ];
                            
                            hapticPattern.forEach(({ timing, type }) => {
                                setTimeout(() => {
                                    try {
                                        tgWebApp.HapticFeedback.impactOccurred(type);
                                    } catch (e) {
                                        // Fallback if HapticFeedback not available
                                        if (tgWebApp.impactOccurred) {
                                            tgWebApp.impactOccurred(type);
                                        }
                                    }
                                }, timing);
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('loadData error', err);
                const errorMessage = err instanceof Error ? err.message : 'Network or script error';
                setError(errorMessage);
                hideSkeletons();
            }
        }

        // Store loadData function so it can be called when switching back to Spendings tab
        spendingsLoadData = loadData;
        
        // Don't load data here - wait for currency to be defined, then initialize

        // Edit Transaction functionality
        let currentEditingSpending = null;
        let currentAmountString = ''; // Store amount as string for custom keyboard
        let currentSelectedCategoryId = null;
        let editCategories = [];
        
        const editOverlay = document.getElementById('edit-transaction-overlay');
        const editAmountDisplay = document.getElementById('edit-amount-display');
        const editCurrencyLabel = document.getElementById('edit-currency-label');
        const editNameInput = document.getElementById('edit-name');
        const editCategoryButton = document.getElementById('edit-category-button');
        const editCategoryEmoji = document.getElementById('edit-category-emoji');
        const editCategoryName = document.getElementById('edit-category-name');
        const editCategoryDropdown = document.getElementById('edit-category-dropdown');
        const saveButton = document.getElementById('save-button');
        const deleteButton = document.getElementById('delete-button');
        const closeEditButton = document.getElementById('close-edit-button');
        const backspaceButton = document.getElementById('backspace-button');
        const keyboardKeys = document.querySelectorAll('.keyboard-key[data-key]');

        // Format amount for display (with comma as decimal separator)
        function formatAmountForDisplay(digitString) {
            // digitString contains only digits, treat last 2 as cents
            if (!digitString || digitString === '' || digitString === '0') return '0,00';
            
            // Pad with zeros if needed
            const padded = digitString.padStart(3, '0');
            const wholePart = padded.slice(0, -2).replace(/^0+/, '') || '0';
            const centsPart = padded.slice(-2);
            
            return `${wholePart},${centsPart}`;
        }

        // Convert digit string to decimal number
        function parseAmountFromDigitString(digitString) {
            if (!digitString || digitString === '' || digitString === '0') return 0;
            const amount = parseInt(digitString, 10) / 100;
            return amount;
        }

        // Helper function to darken color by percentage
        function darkenColor(hex, percent) {
            // Remove # if present
            hex = hex.replace('#', '');
            
            // Convert to RGB
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            
            // Darken
            const newR = Math.floor(r * (1 - percent / 100));
            const newG = Math.floor(g * (1 - percent / 100));
            const newB = Math.floor(b * (1 - percent / 100));
            
            // Convert back to hex
            return '#' + [newR, newG, newB].map(x => x.toString(16).padStart(2, '0')).join('');
        }

        // Helper function to convert hex to rgba
        function hexToRgba(hex, alpha) {
            hex = hex.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        // Update category display
        function updateCategoryDisplay(category) {
            if (category) {
                editCategoryEmoji.textContent = category.emoji;
                editCategoryName.textContent = category.name;
                editCategoryName.style.color = darkenColor(category.color, 20);
                editCategoryButton.style.backgroundColor = hexToRgba(category.color, 0.24);
                currentSelectedCategoryId = category.id;
            } else {
                editCategoryEmoji.textContent = '❔';
                editCategoryName.textContent = 'Uncategorized';
                editCategoryName.style.color = '#757575';
                editCategoryButton.style.backgroundColor = 'rgba(158, 158, 158, 0.24)';
                currentSelectedCategoryId = null;
            }
        }

        // Load categories for edit popup
        async function loadEditCategories() {
            try {
                const res = await fetch('/api/lists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, type: 'categories' })
                });

                const data = await res.json();
                if (data.ok) {
                    editCategories = data.categories || [];
                }
            } catch (err) {
                console.error('Failed to load categories for edit:', err);
            }
        }

        // Render category dropdown
        function renderCategoryDropdown() {
            editCategoryDropdown.innerHTML = '';
            editCategories.forEach(category => {
                const item = document.createElement('div');
                item.className = 'edit-category-dropdown-item';
                
                const emoji = document.createElement('span');
                emoji.className = 'edit-category-dropdown-emoji';
                emoji.textContent = category.emoji;
                
                const name = document.createElement('span');
                name.className = 'edit-category-dropdown-name';
                name.textContent = category.name;
                name.style.color = darkenColor(category.color, 20);
                
                item.appendChild(emoji);
                item.appendChild(name);
                
                item.addEventListener('click', () => {
                    updateCategoryDisplay(category);
                    editCategoryDropdown.style.display = 'none';
                    
                    // Haptic feedback
                    if (tgWebApp && tgWebApp.HapticFeedback) {
                        try {
                            tgWebApp.HapticFeedback.impactOccurred('light');
                        } catch (e) {
                            if (tgWebApp.impactOccurred) {
                                tgWebApp.impactOccurred('light');
                            }
                        }
                    }
                });
                
                editCategoryDropdown.appendChild(item);
            });
        }

        // Toggle category dropdown
        if (editCategoryButton) {
            editCategoryButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = editCategoryDropdown.style.display !== 'none';
                
                if (isVisible) {
                    editCategoryDropdown.style.display = 'none';
                } else {
                    renderCategoryDropdown();
                    editCategoryDropdown.style.display = 'block';
                }
                
                // Haptic feedback
                if (tgWebApp && tgWebApp.HapticFeedback) {
                    try {
                        tgWebApp.HapticFeedback.impactOccurred('light');
                    } catch (e) {
                        if (tgWebApp.impactOccurred) {
                            tgWebApp.impactOccurred('light');
                        }
                    }
                }
            });
        }

        // Close category dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (editCategoryDropdown && 
                editCategoryButton && 
                !editCategoryDropdown.contains(e.target) && 
                !editCategoryButton.contains(e.target)) {
                editCategoryDropdown.style.display = 'none';
            }
        });

        // Load categories on initialization
        loadEditCategories();

        function openEditView(spending) {
            currentEditingSpending = spending;
            
            // Initialize amount display - convert to cents (digits only)
            const amount = Math.abs(Number(spending.amount));
            const cents = Math.round(amount * 100);
            currentAmountString = cents.toString();
            editAmountDisplay.textContent = formatAmountForDisplay(currentAmountString);
            
            // Set currency label
            editCurrencyLabel.textContent = currentCurrencyCode;
            
            // Initialize name input
            const nameValue = spending.name || '';
            editNameInput.value = nameValue;
            
            // Function to resize input based on content
            const resizeInput = () => {
                const value = editNameInput.value || editNameInput.placeholder;
                const tempSpan = document.createElement('span');
                tempSpan.style.font = window.getComputedStyle(editNameInput).font;
                tempSpan.style.fontSize = '16px';
                tempSpan.style.fontWeight = '700';
                tempSpan.style.visibility = 'hidden';
                tempSpan.style.position = 'absolute';
                tempSpan.textContent = value || 'Transaction name';
                document.body.appendChild(tempSpan);
                const width = tempSpan.offsetWidth + 4; // Add small buffer
                document.body.removeChild(tempSpan);
                editNameInput.style.width = Math.max(40, width) + 'px';
            };
            
            // Initial resize
            resizeInput();
            
            // Resize on input
            editNameInput.addEventListener('input', resizeInput);
            
            // Prevent keyboard from causing viewport jumps
            editNameInput.addEventListener('focus', () => {
                // Lock the popup height to current viewport
                const currentHeight = window.innerHeight;
                editOverlay.style.height = `${currentHeight}px`;
                editOverlay.scrollTop = 0;
                
                // Prevent body scroll
                document.body.style.position = 'fixed';
                document.body.style.width = '100%';
                document.body.style.top = '0';
            });
            
            editNameInput.addEventListener('blur', () => {
                // Restore normal height
                editOverlay.style.height = '';
                document.body.style.position = '';
                document.body.style.width = '';
                document.body.style.top = '';
            });
            
            // Initialize category display
            const category = spending.categories || spending.category || null;
            updateCategoryDisplay(category);
            
            // Close category dropdown if open
            editCategoryDropdown.style.display = 'none';
            
            // Prevent background scrolling
            document.body.classList.add('no-scroll');
            
            // Show popup overlay and trigger animation
            editOverlay.style.display = 'flex';
            editOverlay.classList.remove('closing');
            
            // Trigger animation after a small delay to ensure display is rendered
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    editOverlay.classList.add('opening');
                });
            });
            
            // Haptic feedback
            if (tgWebApp && tgWebApp.HapticFeedback) {
                try {
                    tgWebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                    if (tgWebApp.impactOccurred) {
                        tgWebApp.impactOccurred('light');
                    }
                }
            }
        }

        function closeEditView() {
            // Trigger closing animation
            editOverlay.classList.remove('opening');
            editOverlay.classList.add('closing');
            
            // Wait for animation to complete before hiding
            setTimeout(() => {
                currentEditingSpending = null;
                currentAmountString = '';
                editOverlay.style.display = 'none';
                editOverlay.classList.remove('closing');
                
                // Re-enable background scrolling
                document.body.classList.remove('no-scroll');
            }, 350); // Match the closing animation duration
        }

        // Handle numeric keyboard input
        function handleKeyboardInput(key) {
            if (!currentEditingSpending) return;
            
            // Haptic feedback for key press
            if (tgWebApp && tgWebApp.HapticFeedback) {
                try {
                    tgWebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                    if (tgWebApp.impactOccurred) {
                        tgWebApp.impactOccurred('light');
                    }
                }
            }

            // Ignore decimal point - we build from right to left
            if (key === '.') {
                return;
            }
            
            // Add digit - limit to 10 digits to prevent overflow
            if (currentAmountString.length >= 10) {
                return;
            }
            
            // Remove leading zero and append new digit
            if (currentAmountString === '0') {
                currentAmountString = key;
            } else {
                currentAmountString += key;
            }
            
            editAmountDisplay.textContent = formatAmountForDisplay(currentAmountString);
        }

        // Handle backspace
        function handleBackspace() {
            if (!currentEditingSpending) return;
            
            // Haptic feedback
            if (tgWebApp && tgWebApp.HapticFeedback) {
                try {
                    tgWebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                    if (tgWebApp.impactOccurred) {
                        tgWebApp.impactOccurred('light');
                    }
                }
            }

            // Remove last digit
            if (currentAmountString.length > 1) {
                currentAmountString = currentAmountString.slice(0, -1);
            } else {
                currentAmountString = '0';
            }
            editAmountDisplay.textContent = formatAmountForDisplay(currentAmountString);
        }

        // Set up keyboard listeners
        if (keyboardKeys && keyboardKeys.length > 0) {
            keyboardKeys.forEach(key => {
                key.addEventListener('click', () => {
                    const keyValue = key.getAttribute('data-key');
                    if (keyValue) {
                        handleKeyboardInput(keyValue);
                    }
                });
            });
        }

        // Backspace button
        if (backspaceButton) {
            backspaceButton.addEventListener('click', handleBackspace);
        }

        // Name input is always visible, no additional setup needed

        // Close popup when clicking X button
        if (closeEditButton) {
            closeEditButton.addEventListener('click', closeEditView);
        }

        // Don't close on overlay click (full-screen design)

        async function saveTransaction() {
            if (!currentEditingSpending) return;

            const newAmount = parseAmountFromDigitString(currentAmountString);
            const newName = editNameInput.value.trim();

            if (isNaN(newAmount) || newAmount <= 0) {
                alert('Please enter a valid amount');
                return;
            }

            try {
                // First update the amount and name
                const updateRes = await fetch('/api/spendings/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        spendingId: currentEditingSpending.id,
                        amount: newAmount,
                        name: newName
                    })
                });

                const updateData = await updateRes.json();
                if (!updateData.ok) {
                    alert('Failed to update transaction: ' + (updateData.error || 'Unknown error'));
                    return;
                }

                // Then update category if changed
                const originalCategoryId = (currentEditingSpending.categories || currentEditingSpending.category)?.id || null;
                if (currentSelectedCategoryId !== originalCategoryId && currentSelectedCategoryId !== null) {
                    const categoryRes = await fetch('/api/spendings/update-category', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            initData: tg.initData,
                            spendingId: currentEditingSpending.id,
                            categoryId: currentSelectedCategoryId
                        })
                    });

                    const categoryData = await categoryRes.json();
                    if (!categoryData.ok) {
                        console.error('Failed to update category:', categoryData.error);
                        // Don't fail the whole save if category update fails
                    }
                }

                // Haptic feedback
                if (tgWebApp && tgWebApp.HapticFeedback) {
                    try {
                        tgWebApp.HapticFeedback.notificationOccurred('success');
                    } catch (e) {
                        if (tgWebApp.notificationOccurred) {
                            tgWebApp.notificationOccurred('success');
                        }
                    }
                }

                closeEditView();
                loadData(); // Reload to show updated data
            } catch (err) {
                console.error('saveTransaction error', err);
                alert('Error saving transaction');
            }
        }

        async function deleteTransaction() {
            if (!currentEditingSpending) return;

            if (!confirm('Are you sure you want to delete this transaction?')) {
                return;
            }

            try {
                const res = await fetch('/api/spendings/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        spendingId: currentEditingSpending.id
                    })
                });

                const data = await res.json();
                if (!data.ok) {
                    alert('Failed to delete transaction: ' + (data.error || 'Unknown error'));
                    return;
                }

                // Haptic feedback
                if (tgWebApp && tgWebApp.HapticFeedback) {
                    try {
                        tgWebApp.HapticFeedback.notificationOccurred('success');
                    } catch (e) {
                        if (tgWebApp.notificationOccurred) {
                            tgWebApp.notificationOccurred('success');
                        }
                    }
                }

                closeEditView();
                loadData(); // Reload to show updated data
            } catch (err) {
                console.error('deleteTransaction error', err);
                alert('Error deleting transaction');
            }
        }

        if (saveButton) {
            saveButton.addEventListener('click', saveTransaction);
        }
        if (deleteButton) {
            deleteButton.addEventListener('click', deleteTransaction);
        }

        // Period dropdown functionality
        const monthPill = document.getElementById('month-pill');
        const periodDropdown = document.getElementById('period-dropdown');
        const periodOptions = document.querySelectorAll('.period-option');

        function updatePillText(period) {
            const textMap = {
                'today': 'today',
                'week': 'this week',
                'month': 'this month',
                'year': 'this year'
            };
            monthPill.innerHTML = `<span class="pill-text">${textMap[period] || 'this month'}</span>`;
        }

        function updateActiveOption(period) {
            periodOptions.forEach(option => {
                option.classList.remove('active');
                const checkmark = option.querySelector('.period-checkmark');
                if (checkmark) {
                    checkmark.style.display = 'none';
                }
                if (option.getAttribute('data-period') === period) {
                    option.classList.add('active');
                    if (checkmark) {
                        checkmark.style.display = 'block';
                    }
                }
            });
        }

        // Toggle dropdown when pill is clicked
        if (monthPill && periodDropdown) {
            monthPill.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = periodDropdown.style.display !== 'none';
                if (isVisible) {
                    periodDropdown.classList.remove('dropdown-open');
                    periodDropdown.classList.add('dropdown-close');
                    setTimeout(() => {
                        periodDropdown.style.display = 'none';
                        periodDropdown.classList.remove('dropdown-close');
                    }, 200);
                } else {
                    periodDropdown.style.display = 'block';
                    // Trigger reflow to ensure animation works
                    periodDropdown.offsetHeight;
                    periodDropdown.classList.add('dropdown-open');
                }
            });

            // Handle period selection
            periodOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedPeriod = option.getAttribute('data-period');
                    currentPeriod = selectedPeriod;
                    
                    updatePillText(selectedPeriod);
                    updateActiveOption(selectedPeriod);
                    periodDropdown.classList.remove('dropdown-open');
                    periodDropdown.classList.add('dropdown-close');
                    setTimeout(() => {
                        periodDropdown.style.display = 'none';
                        periodDropdown.classList.remove('dropdown-close');
                    }, 200);
                    
                    // Reload data with new period
                    loadData();
                    
                    // Haptic feedback
                    if (tgWebApp && tgWebApp.HapticFeedback) {
                        try {
                            tgWebApp.HapticFeedback.impactOccurred('light');
                        } catch (e) {
                            if (tgWebApp.impactOccurred) {
                                tgWebApp.impactOccurred('light');
                            }
                        }
                    }
                });
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!monthPill.contains(e.target) && !periodDropdown.contains(e.target)) {
                    if (periodDropdown.style.display !== 'none') {
                        periodDropdown.classList.remove('dropdown-open');
                        periodDropdown.classList.add('dropdown-close');
                        setTimeout(() => {
                            periodDropdown.style.display = 'none';
                            periodDropdown.classList.remove('dropdown-close');
                        }, 200);
                    }
                }
            });
        }

        // Categorize functionality
        let uncategorizedSpendings = [];
        let categories = [];
        let currentSpendingIndex = 0;
        let isNewCardAfterCategory = false;

        const categorizeTransaction = document.getElementById('categorize-transaction');
        const categorizeButtons = document.getElementById('categorize-buttons');
        const categorizeComplete = document.getElementById('categorize-complete');
        const categorizeCounter = document.getElementById('categorize-counter');
        const categorizeCardWrapper = document.getElementById('categorize-card-wrapper');
        const categorizeCategoriesSection = document.getElementById('categorize-categories');

        async function loadUncategorizedSpendings() {
            try {
                // Show skeleton
                showCategorizeSkeleton();
                
                const res = await fetch('/api/spendings/uncategorized', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to load uncategorized spendings:', data.error);
                    hideCategorizeSkeleton();
                    return;
                }

                uncategorizedSpendings = data.spendings || [];
                currentSpendingIndex = 0;
                
                // Hide skeleton before displaying content
                hideCategorizeSkeleton();
                displayNextTransaction();
            } catch (err) {
                console.error('loadUncategorizedSpendings error', err);
                hideCategorizeSkeleton();
            }
        }

        async function loadCategories() {
            try {
                // Show category skeleton
                showCategoriesSkeleton();
                
                const res = await fetch('/api/lists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, type: 'categories' })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to load categories:', data.error);
                    hideCategoriesSkeleton();
                    return;
                }

                categories = data.categories || [];
                
                // Hide skeleton before rendering
                hideCategoriesSkeleton();
                renderCategoryButtons();
            } catch (err) {
                console.error('loadCategories error', err);
                hideCategoriesSkeleton();
            }
        }

        // Helper function to convert hex to rgba with opacity
        function hexToRgba(hex, opacity) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }

        // Helper function to darken color by percentage
        function darkenColor(hex, percent) {
            const r = Math.max(0, parseInt(hex.slice(1, 3), 16) * (1 - percent / 100));
            const g = Math.max(0, parseInt(hex.slice(3, 5), 16) * (1 - percent / 100));
            const b = Math.max(0, parseInt(hex.slice(5, 7), 16) * (1 - percent / 100));
            return `rgb(${Math.floor(r)}, ${Math.floor(g)}, ${Math.floor(b)})`;
        }

        function renderCategoryButtons() {
            categorizeButtons.innerHTML = '';
            categories.forEach((category, index) => {
                const button = document.createElement('button');
                button.className = 'category-button categorize-button-hidden';
                // Background: category color with 24% opacity
                button.style.backgroundColor = hexToRgba(category.color, 0.24);
                // Text color: category color 20% darker
                const textColor = darkenColor(category.color, 20);
                button.innerHTML = `
                    <span class="category-emoji">${category.emoji}</span>
                    <span class="category-name" style="color: ${textColor};">${category.name}</span>
                `;
                button.addEventListener('click', () => assignCategory(category.id));
                categorizeButtons.appendChild(button);
            });
            
            // Ensure buttons container is visible
            if (categorizeButtons) categorizeButtons.style.display = 'flex';
            
            // Trigger reveal animation with stagger effect after DOM update
            requestAnimationFrame(() => {
                const allButtons = categorizeButtons.querySelectorAll('.category-button');
                allButtons.forEach((button, index) => {
                    setTimeout(() => {
                        button.classList.remove('categorize-button-hidden');
                        button.classList.add('categorize-button-reveal');
                    }, index * 40); // 40ms delay between each button for more noticeable stagger
                });
            });
        }

        function updateCounter() {
            const itemsLeft = uncategorizedSpendings.length;
            if (itemsLeft === 0) {
                categorizeCounter.textContent = 'Yay!';
            } else if (itemsLeft === 1) {
                categorizeCounter.textContent = '1 item left';
            } else {
                categorizeCounter.textContent = `${itemsLeft} items left`;
            }
        }

        function showCategorizeSkeleton() {
            const counterSkeleton = document.getElementById('categorize-counter-skeleton');
            const cardSkeleton = document.getElementById('categorize-card-skeleton');
            const categorizeCounter = document.getElementById('categorize-counter');
            const categorizeTransaction = document.getElementById('categorize-transaction');
            
            if (counterSkeleton) counterSkeleton.style.display = 'block';
            if (cardSkeleton) cardSkeleton.style.display = 'flex';
            if (categorizeCounter) categorizeCounter.textContent = '';
            if (categorizeTransaction) categorizeTransaction.style.display = 'none';
        }

        function hideCategorizeSkeleton() {
            const counterSkeleton = document.getElementById('categorize-counter-skeleton');
            const cardSkeleton = document.getElementById('categorize-card-skeleton');
            
            if (counterSkeleton) counterSkeleton.style.display = 'none';
            if (cardSkeleton) cardSkeleton.style.display = 'none';
        }

        function showCategoriesSkeleton() {
            const categoriesSkeleton = document.getElementById('categorize-buttons-skeleton');
            const categorizeButtons = document.getElementById('categorize-buttons');
            
            if (categoriesSkeleton) categoriesSkeleton.style.display = 'flex';
            if (categorizeButtons) categorizeButtons.style.display = 'none';
        }

        function hideCategoriesSkeleton() {
            const categoriesSkeleton = document.getElementById('categorize-buttons-skeleton');
            const categorizeButtons = document.getElementById('categorize-buttons');
            
            if (categoriesSkeleton) categoriesSkeleton.style.display = 'none';
            if (categorizeButtons) categorizeButtons.style.display = 'flex';
        }

        function displayNextTransaction() {
            const categorizeContainer = document.getElementById('categorize-container');
            
            if (currentSpendingIndex >= uncategorizedSpendings.length) {
                // All transactions categorized
                categorizeCardWrapper.style.display = 'none';
                categorizeCategoriesSection.style.display = 'none';
                categorizeComplete.style.display = 'flex';
                if (categorizeContainer) categorizeContainer.classList.add('showing-complete');
                // Hide counter to avoid redundant "Yay!" message (complete state already says "You're all set!")
                if (categorizeCounter) categorizeCounter.style.display = 'none';
                return;
            }
            
            // Reset container height when showing transactions
            if (categorizeContainer) categorizeContainer.classList.remove('showing-complete');
            
            // Show counter again when displaying transactions
            if (categorizeCounter) categorizeCounter.style.display = '';

            const spending = uncategorizedSpendings[currentSpendingIndex];
            const transDate = new Date(spending.created_at || spending.date_of_log);
            
            // Use flag to determine if card should animate from bottom
            const shouldAnimateFromBottom = isNewCardAfterCategory;
            isNewCardAfterCategory = false; // Reset flag after use
            const animationClass = shouldAnimateFromBottom ? 'categorize-card-hidden-from-bottom' : 'categorize-card-hidden';
            
            categorizeTransaction.innerHTML = `
                <div class="categorize-transaction-item ${animationClass}" id="current-transaction-card">
                    <div class="card-top">
                        <div class="info">
                            <div class="name">${spending.name || 'Unnamed'}</div>
                            <div class="time">${formatTime(transDate)}</div>
                        </div>
                    </div>
                    <div class="card-bottom">
                        <div class="amount-label">Amount:</div>
                        <div class="amount">-${formatAmount(Math.abs(Number(spending.amount)))} ${currentCurrencyCode}</div>
                    </div>
                </div>
            `;

            categorizeCardWrapper.style.display = 'block';
            categorizeCategoriesSection.style.display = 'flex';
            categorizeComplete.style.display = 'none';
            categorizeTransaction.style.display = 'block';
            updateCounter();
            
            // Trigger reveal animation - from bottom if after category, from slight offset if initial load
            setTimeout(() => {
                const currentCard = document.getElementById('current-transaction-card');
                if (currentCard) {
                    if (shouldAnimateFromBottom) {
                        currentCard.classList.remove('categorize-card-hidden-from-bottom');
                        currentCard.classList.add('categorize-card-reveal-from-bottom');
                    } else {
                        currentCard.classList.remove('categorize-card-hidden');
                        currentCard.classList.add('categorize-card-reveal');
                    }
                }
            }, 50);
        }

        function fadeOutCard(callback) {
            const currentCard = document.getElementById('current-transaction-card');
            if (!currentCard) {
                callback();
                return;
            }
            
            // Remove any existing animation classes
            currentCard.classList.remove('categorize-card-reveal', 'categorize-card-reveal-from-bottom', 'categorize-card-hidden');
            // Add upward animation
            currentCard.classList.add('swipe-out-up');
            
            setTimeout(() => {
                callback();
            }, 300);
        }

        async function assignCategory(categoryId) {
            const spending = uncategorizedSpendings[currentSpendingIndex];
            
            try {
                const res = await fetch('/api/spendings/update-category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        spendingId: spending.id,
                        categoryId: categoryId
                    })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to update category:', data.error);
                    return;
                }

                // Haptic feedback for success - Payment Success pattern
                if (tgWebApp && tgWebApp.HapticFeedback) {
                    try {
                        // Payment Success haptic: notificationOccurred('success') provides the standard payment success pattern
                        tgWebApp.HapticFeedback.notificationOccurred('success');
                    } catch (e) {
                        // Fallback if HapticFeedback not available
                        if (tgWebApp.notificationOccurred) {
                            tgWebApp.notificationOccurred('success');
                        }
                    }
                }

                // Set flag to indicate next card should animate from bottom
                isNewCardAfterCategory = true;
                
                // Animate card out and move to next transaction
                fadeOutCard(() => {
                    // Remove the categorized item from the array
                    uncategorizedSpendings.splice(currentSpendingIndex, 1);
                    // Don't increment currentSpendingIndex since we removed the item
                    // The next item is now at the same index
                    displayNextTransaction();
                });
            } catch (err) {
                console.error('assignCategory error', err);
            }
        }

        // Store categorize load functions so they can be called when switching tabs
        categorizeLoadFunctions = () => {
            loadUncategorizedSpendings();
            loadCategories();
        };

        // Load categorize data on initial page load if categorize tab is active (unlikely but safe)
        const categorizeTabContent = document.querySelector('.tab-content[data-tab="1"]');
        if (categorizeTabContent && categorizeTabContent.classList.contains('active')) {
            categorizeLoadFunctions();
        }

        // Insights functionality
        const insightsPeriodPill = document.getElementById('insights-period-pill');
        const insightsPeriodDropdown = document.getElementById('insights-period-dropdown');
        const insightsPeriodOptions = document.querySelectorAll('.period-option[data-insights-period]');
        const insightsChart = document.getElementById('insights-chart');
        const insightsCategoriesList = document.getElementById('insights-categories-list');
        const insightsDateRange = document.querySelector('.insights-date-range');
        const insightsTotalSpent = document.querySelector('.insights-total-spent .insights-amount-value');
        const insightsPerDay = document.querySelector('.insights-per-day-value .insights-amount-value-small');
        const insightsTotalCurrency = document.getElementById('insights-total-currency');
        const insightsPerDayCurrency = document.getElementById('insights-perday-currency');

        // Format date range based on period
        function formatDateRange(period) {
            const now = new Date();
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            
            let startDate;
            let endDate = now;
            
            switch (period) {
                case 'week':
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                    startDate = new Date(now.getFullYear(), now.getMonth(), diff);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            
            const startDay = startDate.getDate();
            const startMonth = months[startDate.getMonth()];
            const endDay = endDate.getDate();
            const endMonth = months[endDate.getMonth()];
            
            return `${startDay} ${startMonth} - TODAY`;
        }

        // Load Insights data
        async function loadInsights() {
            try {
                if (!tg || !tg.initData) {
                    console.warn('No initData for Insights');
                    return;
                }

                // Check AI features status
                let aiFeaturesEnabled = false;
                try {
                    const userRes = await fetch('/api/auth/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ initData: tg.initData })
                    });
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        if (userData.ok && userData.user) {
                            aiFeaturesEnabled = userData.user.ai_features_enabled === true;
                        }
                    }
                } catch (err) {
                    console.error('Failed to check AI features status:', err);
                }

                // Update AI button state
                const analyzeAiButton = document.getElementById('analyze-ai-button');
                if (analyzeAiButton) {
                    analyzeAiButton.disabled = !aiFeaturesEnabled;
                    if (!aiFeaturesEnabled) {
                        analyzeAiButton.title = 'AI features are not enabled. Please enable them in settings.';
                    } else {
                        analyzeAiButton.title = '';
                    }
                }

                const res = await fetch('/api/spendings/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        initData: tg.initData,
                        period: insightsPeriod
                    })
                });

                if (!res.ok) {
                    console.error('Failed to load insights data');
                    return;
                }

                const data = await res.json();
                if (!data.ok) {
                    console.error('Insights API error:', data.error);
                    return;
                }

                const spendings = data.spendings || [];
                const total = Number(data.total);

                // Update currency labels
                if (insightsTotalCurrency) {
                    insightsTotalCurrency.textContent = currentCurrencyCode;
                }
                if (insightsPerDayCurrency) {
                    insightsPerDayCurrency.textContent = currentCurrencyCode;
                }

                // Update date range
                if (insightsDateRange) {
                    insightsDateRange.textContent = formatDateRange(insightsPeriod);
                }

                // Update total spent
                if (insightsTotalSpent) {
                    insightsTotalSpent.textContent = formatAmount(total);
                }

                // Calculate per day spending
                const now = new Date();
                let daysInPeriod = 1;
                
                switch (insightsPeriod) {
                    case 'week':
                        // Calculate days from Monday to today
                        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert Sunday to 6
                        daysInPeriod = mondayOffset + 1; // Add 1 to include today
                        break;
                    case 'month':
                        daysInPeriod = now.getDate(); // Day of month (1-31)
                        break;
                    case 'year':
                        const yearStart = new Date(now.getFullYear(), 0, 1);
                        const msDiff = now.getTime() - yearStart.getTime();
                        daysInPeriod = Math.floor(msDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include today
                        break;
                }
                
                const perDay = daysInPeriod > 0 ? total / daysInPeriod : 0;
                if (insightsPerDay) {
                    insightsPerDay.textContent = formatAmount(perDay);
                }

                // Group spendings by category
                const categoryMap = {};
                spendings.forEach(s => {
                    const category = s.categories || null;
                    if (!category) return;
                    
                    const categoryId = category.id;
                    if (!categoryMap[categoryId]) {
                        categoryMap[categoryId] = {
                            id: categoryId,
                            name: category.name,
                            emoji: category.emoji,
                            color: category.color,
                            amount: 0
                        };
                    }
                    categoryMap[categoryId].amount += Number(s.amount || 0);
                });

                // Convert to array and sort by amount
                const categories = Object.values(categoryMap).sort((a, b) => b.amount - a.amount);

                // Render chart
                if (insightsChart) {
                    insightsChart.innerHTML = '';
                    const chartContainer = document.createElement('div');
                    chartContainer.className = 'insights-chart-bars';
                    
                    categories.forEach(cat => {
                        const percentage = total > 0 ? (cat.amount / total) * 100 : 0;
                        const bar = document.createElement('div');
                        bar.className = 'insights-chart-bar';
                        bar.style.width = `${percentage}%`;
                        bar.style.backgroundColor = cat.color;
                        chartContainer.appendChild(bar);
                    });
                    
                    insightsChart.appendChild(chartContainer);
                }

                // Render categories list
                if (insightsCategoriesList) {
                    insightsCategoriesList.innerHTML = '';
                    
                    categories.forEach(cat => {
                        const percentage = total > 0 ? (cat.amount / total) * 100 : 0;
                        const item = document.createElement('div');
                        item.className = 'insights-category-item';
                        // Capitalize first letter of category name
                        const capitalizedName = cat.name.charAt(0).toUpperCase() + cat.name.slice(1);
                        item.innerHTML = `
                            <div class="insights-category-icon" style="background-color: ${cat.color}">
                                <span class="insights-category-emoji">${cat.emoji}</span>
                            </div>
                            <div class="insights-category-name">${capitalizedName}</div>
                            <div class="insights-category-percentage">${percentage.toFixed(1)}%</div>
                        `;
                        insightsCategoriesList.appendChild(item);
                    });
                }
            } catch (err) {
                console.error('loadInsights error', err);
            }
        }

        // AI Analysis button handler
        const analyzeAiButton = document.getElementById('analyze-ai-button');
        if (analyzeAiButton) {
            analyzeAiButton.addEventListener('click', async () => {
                try {
                    if (!tg || !tg.initData) {
                        console.warn('No initData for AI analysis');
                        return;
                    }

                    // Disable button and show processing state
                    analyzeAiButton.disabled = true;
                    const originalText = analyzeAiButton.textContent;
                    analyzeAiButton.textContent = 'Processing...';

                    // Fire request and handle response
                    fetch('/api/insights/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            initData: tg.initData,
                            period: insightsPeriod
                        })
                    }).then(async (res) => {
                        const data = await res.json();
                        if (res.ok && data.ok) {
                            // Success - show "Done! Check DM"
                            analyzeAiButton.textContent = 'Done! Check DM';
                            
                            // Reset to original text after 2 seconds
                            setTimeout(() => {
                                analyzeAiButton.textContent = originalText;
                                analyzeAiButton.disabled = false;
                            }, 2000);
                        } else {
                            // Error response
                            console.error('AI analysis error:', data.error);
                            analyzeAiButton.textContent = originalText;
                            analyzeAiButton.disabled = false;
                            
                            if (tgWebApp && tgWebApp.showAlert) {
                                tgWebApp.showAlert(data.error || 'Failed to analyze transactions');
                            }
                        }
                    }).catch(err => {
                        console.error('AI analysis error', err);
                        // Reset button on error so user can try again
                        analyzeAiButton.textContent = originalText;
                        analyzeAiButton.disabled = false;
                        
                        if (tgWebApp && tgWebApp.showAlert) {
                            tgWebApp.showAlert('Failed to analyze transactions. Please try again.');
                        }
                    });

                } catch (err) {
                    console.error('AI analysis error', err);
                    analyzeAiButton.disabled = false;
                    analyzeAiButton.textContent = 'Analyse with AI';
                    
                    if (tgWebApp && tgWebApp.showAlert) {
                        tgWebApp.showAlert('Failed to analyze transactions. Please try again.');
                    }
                }
            });
        }

        // Store insights load function so it can be called when switching tabs
        insightsLoadData = loadInsights;

        // Insights period dropdown
        function updateInsightsPillText(period) {
            if (insightsPeriodPill) {
                insightsPeriodPill.querySelector('.pill-text').textContent = period;
            }
        }

        function updateInsightsActiveOption(period) {
            insightsPeriodOptions.forEach(option => {
                const checkmark = option.querySelector('.period-checkmark');
                if (checkmark) {
                    checkmark.style.display = 'none';
                }
                if (option.getAttribute('data-insights-period') === period) {
                    if (checkmark) {
                        checkmark.style.display = 'block';
                    }
                }
            });
        }

        if (insightsPeriodPill && insightsPeriodDropdown) {
            insightsPeriodPill.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = insightsPeriodDropdown.style.display !== 'none';
                if (isVisible) {
                    insightsPeriodDropdown.classList.remove('dropdown-open');
                    insightsPeriodDropdown.classList.add('dropdown-close');
                    setTimeout(() => {
                        insightsPeriodDropdown.style.display = 'none';
                        insightsPeriodDropdown.classList.remove('dropdown-close');
                    }, 200);
                } else {
                    insightsPeriodDropdown.style.display = 'block';
                    insightsPeriodDropdown.offsetHeight;
                    insightsPeriodDropdown.classList.add('dropdown-open');
                }
            });

            insightsPeriodOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedPeriod = option.getAttribute('data-insights-period');
                    insightsPeriod = selectedPeriod;
                    
                    updateInsightsPillText(selectedPeriod);
                    updateInsightsActiveOption(selectedPeriod);
                    insightsPeriodDropdown.classList.remove('dropdown-open');
                    insightsPeriodDropdown.classList.add('dropdown-close');
                    setTimeout(() => {
                        insightsPeriodDropdown.style.display = 'none';
                        insightsPeriodDropdown.classList.remove('dropdown-close');
                    }, 200);
                    
                    loadInsights();
                    
                    if (tgWebApp && tgWebApp.HapticFeedback) {
                        try {
                            tgWebApp.HapticFeedback.impactOccurred('light');
                        } catch (e) {
                            if (tgWebApp.impactOccurred) {
                                tgWebApp.impactOccurred('light');
                            }
                        }
                    }
                });
            });

            document.addEventListener('click', (e) => {
                if (!insightsPeriodPill.contains(e.target) && !insightsPeriodDropdown.contains(e.target)) {
                    if (insightsPeriodDropdown.style.display !== 'none') {
                        insightsPeriodDropdown.classList.remove('dropdown-open');
                        insightsPeriodDropdown.classList.add('dropdown-close');
                        setTimeout(() => {
                            insightsPeriodDropdown.style.display = 'none';
                            insightsPeriodDropdown.classList.remove('dropdown-close');
                        }, 200);
                    }
                }
            });
        }

        // Currency Selection functionality
        const currencyRow = document.querySelector('.currency-row');
        const currencySelectionPage = document.getElementById('currency-selection-page');
        const currencyBackButton = document.getElementById('currency-back-button');
        const currencyList = document.getElementById('currency-list');
        const settingsContent = document.querySelector('.settings-container');
        const currencyValueSpan = document.querySelector('.settings-row-value');
        let currencies = [];
        let currentCurrencyId = null;

        loadCurrentCurrency = async function() {
            try {
                const res = await fetch('/api/lists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, type: 'currencies' })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to load current currency:', data.error);
                    return false;
                }

                currentCurrencyId = data.currentCurrencyId;
                if (currentCurrencyId) {
                    const currentCurrency = data.currencies?.find(c => c.id === currentCurrencyId);
                    if (currentCurrency) {
                        const previousCurrency = currentCurrencyCode;
                        currentCurrencyCode = currentCurrency.code;
                        if (currencyValueSpan) {
                            currencyValueSpan.textContent = currentCurrency.code;
                        }
                        // Mark currency as changed and reload data if on relevant tabs
                        if (previousCurrency !== currentCurrency.code) {
                            tabManager.markCurrencyChanged();
                            const activeTabIndex = getActiveTabIndex();
                            // Reload spendings data if on spendings tab
                            if (spendingsLoadData && activeTabIndex === tabManager.TABS.SPENDINGS) {
                                spendingsLoadData(false, false);
                            }
                            // Also reload insights if on insights tab
                            if (insightsLoadData && activeTabIndex === tabManager.TABS.INSIGHTS) {
                                insightsLoadData();
                            }
                        }
                        return true;
                    }
                }
                return false;
            } catch (err) {
                console.error('loadCurrentCurrency error', err);
                return false;
            }
        };

        // Initialize app: load currency and verify user in parallel, then data
        async function initializeApp() {
            showSkeletons();
            
            // Load currency and verify user in parallel for faster initial load
            try {
                const [currencyResult, verifyResult] = await Promise.allSettled([
                    loadCurrentCurrency(),
                    fetch('/api/auth/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ initData: tg.initData })
                    }).then(res => {
                        if (!res.ok) throw new Error('Verify failed');
                        return res.json();
                    })
                ]);

                if (currencyResult.status === 'fulfilled') {
                    const currencyLoaded = currencyResult.value;
                    if (currencyLoaded) {
                        console.log('Currency loaded:', currentCurrencyCode);
                    } else {
                        console.warn('Currency loading returned false, using default USD');
                    }
                } else {
                    console.error('Failed to load currency on init:', currencyResult.reason);
                }

                if (verifyResult.status === 'fulfilled') {
                    const userData = verifyResult.value;
                    if (userData.ok && userData.user) {
                        console.log('✅ User verified/created:', userData.user.id);
                        // Store verified user data for loadData to use
                        window._preVerifiedUser = userData.user;
                    }
                } else {
                    console.error('Failed to verify user on init:', verifyResult.reason);
                }
            } catch (err) {
                console.error('Failed to initialize app:', err);
                // Continue with defaults
            }
            
            // Then load data with correct currency (loadData will skip verify if already done)
            loadData(false);
        }
        
        initializeApp();

        async function loadCurrencies() {
            try {
                const res = await fetch('/api/lists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, type: 'currencies' })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to load currencies:', data.error);
                    return;
                }

                currencies = data.currencies || [];
                currentCurrencyId = data.currentCurrencyId;
                renderCurrencyList();
            } catch (err) {
                console.error('loadCurrencies error', err);
            }
        }

        function renderCurrencyList() {
            currencyList.innerHTML = '';
            currencies.forEach(currency => {
                const isSelected = currency.id === currentCurrencyId;
                const item = document.createElement('div');
                item.className = 'currency-item';
                item.setAttribute('data-currency-id', currency.id);
                
                item.innerHTML = `
                    <div class="currency-info">
                        <span class="currency-code">${currency.code}</span>
                        <span class="currency-name">${currency.name}</span>
                    </div>
                    <div class="checkmark-container">
                        <div class="checkmark">
                            ${isSelected ? `
                                <svg fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
                                    <g>
                                        <path d="M6.36719 17.2363C6.78711 17.2363 7.11914 17.0508 7.35352 16.6895L16.582 2.1582C16.7578 1.875 16.8262 1.66016 16.8262 1.43555C16.8262 0.898438 16.4746 0.546875 15.9375 0.546875C15.5469 0.546875 15.332 0.673828 15.0977 1.04492L6.32812 15.0195L1.77734 9.0625C1.5332 8.7207 1.28906 8.58398 0.9375 8.58398C0.380859 8.58398 0 8.96484 0 9.50195C0 9.72656 0.0976562 9.98047 0.283203 10.2148L5.35156 16.6699C5.64453 17.0508 5.94727 17.2363 6.36719 17.2363Z" fill="black"/>
                                    </g>
                                </svg>
                            ` : `
                                <svg fill="none" preserveAspectRatio="none" viewBox="0 0 18 18">
                                    <g>
                                    </g>
                                </svg>
                            `}
                        </div>
                    </div>
                `;
                
                item.addEventListener('click', () => selectCurrency(currency.id));
                currencyList.appendChild(item);
            });
        }

        function openCurrencyPage() {
            settingsContent.style.display = 'none';
            currencySelectionPage.style.display = 'block';
            loadCurrencies();
            
            // Haptic feedback
            if (tgWebApp && tgWebApp.HapticFeedback) {
                try {
                    tgWebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                    if (tgWebApp.impactOccurred) {
                        tgWebApp.impactOccurred('light');
                    }
                }
            }
        }

        function closeCurrencyPage() {
            currencySelectionPage.style.display = 'none';
            settingsContent.style.display = 'block';
            
            // Haptic feedback
            if (tgWebApp && tgWebApp.HapticFeedback) {
                try {
                    tgWebApp.HapticFeedback.impactOccurred('light');
                } catch (e) {
                    if (tgWebApp.impactOccurred) {
                        tgWebApp.impactOccurred('light');
                    }
                }
            }
        }

        async function selectCurrency(currencyId) {
            try {
                const res = await fetch('/api/user/update-currency', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        currencyId: currencyId
                    })
                });

                const data = await res.json();
                if (!data.ok) {
                    console.error('Failed to update currency:', data.error);
                    alert('Failed to update currency: ' + (data.error || 'Unknown error'));
                    return;
                }

                // Update current currency
                currentCurrencyId = currencyId;
                const selectedCurrency = currencies.find(c => c.id === currencyId);
                
                if (selectedCurrency) {
                    // Update global currency code
                    currentCurrencyCode = selectedCurrency.code;
                    
                    // Update the currency value in settings
                    if (currencyValueSpan) {
                        currencyValueSpan.textContent = selectedCurrency.code;
                    }
                    
                    // Reload spendings data to update currency display
                    // Disable haptics for background currency update
                    if (spendingsLoadData) {
                        spendingsLoadData(false, false);
                    }
                }

                // Update currency list
                renderCurrencyList();

                // Haptic feedback
                if (tgWebApp && tgWebApp.HapticFeedback) {
                    try {
                        tgWebApp.HapticFeedback.notificationOccurred('success');
                    } catch (e) {
                        if (tgWebApp.notificationOccurred) {
                            tgWebApp.notificationOccurred('success');
                        }
                    }
                }

                // Close the currency page after a short delay
                setTimeout(() => {
                    closeCurrencyPage();
                }, 300);
            } catch (err) {
                console.error('selectCurrency error', err);
                alert('Error updating currency');
            }
        }

        if (currencyRow) {
            currencyRow.addEventListener('click', openCurrencyPage);
        }

        if (currencyBackButton) {
            currencyBackButton.addEventListener('click', closeCurrencyPage);
        }

        // Currency is already loaded in initializeApp() above
    }

