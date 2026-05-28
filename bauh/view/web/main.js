// Polyfill localStorage if unavailable in webview sandbox (common in file:// contexts under WebKitGTK)
if (typeof localStorage === 'undefined' || !localStorage) {
    window.localStorage = {
        _data: {},
        setItem: function(id, val) { return this._data[id] = String(val); },
        getItem: function(id) { return this._data.hasOwnProperty(id) ? this._data[id] : null; },
        removeItem: function(id) { return delete this._data[id]; },
        clear: function() { return this._data = {}; }
    };
}

// Theme Management
const themeToggleBtn = document.getElementById('theme-toggle');
const rootElement = document.documentElement;

// Initialize theme from localStorage or default to dark
const savedTheme = localStorage.getItem('bauh-theme') || 'dark';
rootElement.setAttribute('data-theme', savedTheme);

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = rootElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    rootElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('bauh-theme', newTheme);
});

// Toast Notifications
const toastContainer = document.getElementById('toast-container');

function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        iconSvg = `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
        ${iconSvg}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    toastContainer.appendChild(toast);

    // Remove after 3.5 seconds
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3500);
}

// App Logic Constants & Globals
const packagesGrid = document.getElementById('packages-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const typeFilter = document.getElementById('type-filter');
const navItems = document.querySelectorAll('.nav-item');

const selectModeBtn = document.getElementById('select-mode-btn');
const batchBar = document.getElementById('batch-bar');
const batchCount = document.getElementById('batch-count');
const batchUninstallBtn = document.getElementById('batch-uninstall-btn');
const batchCancelBtn = document.getElementById('batch-cancel-btn');
const updateAllBtn = document.getElementById('update-all-btn');

const detailModal = document.getElementById('detail-modal');
const modalClose = document.getElementById('modal-close');
const modalBackdrop = detailModal.querySelector('.modal-backdrop');

let currentPackages = [];
let currentView = 'dashboard'; // 'dashboard', 'installed', 'updates', 'activity'

let selectMode = false;
let selectedPackages = new Set();
let operationInProgress = false;

// Function to call Python backend methods
async function pyApiCall(methodName, ...args) {
    if (window.pywebview && window.pywebview.api) {
        try {
            const response = await window.pywebview.api[methodName](...args);
            if (response && response.status === 'error') {
                showToast('Error', response.message, 'error');
                return null;
            }
            return (response && typeof response === 'object' && 'data' in response) ? response.data : response;
        } catch (error) {
            console.error(`Error calling ${methodName}:`, error);
            showToast('Error', `Failed to communicate with backend: ${error}`, 'error');
            return null;
        }
    } else {
        console.warn('pywebview not injected yet. Returning mock data.');
        return mockApi[methodName](...args);
    }
}

// Terminal Watcher Controls called from WebviewWatcher
window.terminalOpen = (title) => {
    const panel = document.getElementById('terminal-panel');
    const overlay = document.getElementById('terminal-overlay');
    const output = document.getElementById('terminal-output');
    const titleEl = document.getElementById('terminal-title');
    const statusEl = document.getElementById('terminal-status');
    const substatusEl = document.getElementById('terminal-substatus');
    const progressFill = document.getElementById('terminal-progress-fill');
    const doneMsg = document.getElementById('terminal-done-msg');

    operationInProgress = true;
    titleEl.textContent = title;
    statusEl.textContent = 'Initializing...';
    substatusEl.textContent = '';
    progressFill.style.width = '0%';
    output.innerHTML = '';
    doneMsg.className = 'hidden';
    doneMsg.textContent = '';

    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    
    // Hide close button during run
    document.getElementById('terminal-close').style.display = 'none';
};

window.terminalAppend = (line) => {
    const output = document.getElementById('terminal-output');
    const lineEl = document.createElement('span');
    lineEl.className = 'line';
    lineEl.textContent = line;
    output.appendChild(lineEl);
    output.scrollTop = output.scrollHeight;
};

window.terminalSetStatus = (status) => {
    document.getElementById('terminal-status').textContent = status;
};

window.terminalSetSubstatus = (substatus) => {
    document.getElementById('terminal-substatus').textContent = substatus;
};

window.terminalSetProgress = (val) => {
    document.getElementById('terminal-progress-fill').style.width = `${val}%`;
};

window.terminalSetDone = (success) => {
    operationInProgress = false;
    const doneMsg = document.getElementById('terminal-done-msg');
    doneMsg.className = success ? 'terminal-done-success' : 'terminal-done-error';
    doneMsg.textContent = success ? '✓ Operation completed successfully.' : '✗ Operation failed.';
    
    document.getElementById('terminal-status').textContent = success ? 'Success' : 'Failed';
    
    // Show close button
    document.getElementById('terminal-close').style.display = 'block';
    
    // Reset any buttons loading spinner
    document.querySelectorAll('.btn.loading').forEach(b => b.classList.remove('loading'));
};

document.getElementById('terminal-close').addEventListener('click', () => {
    document.getElementById('terminal-panel').classList.add('hidden');
    document.getElementById('terminal-overlay').classList.add('hidden');
    fetchPackages(); // refresh packages list
});

// Render Package Cards
function renderPackages(packages) {
    packagesGrid.innerHTML = '';
    
    if (packages.length === 0) {
        emptyState.classList.remove('hidden');
        packagesGrid.style.display = 'none';
        return;
    }

    emptyState.classList.add('hidden');
    packagesGrid.style.display = 'grid';

    packages.forEach(pkg => {
        const card = document.createElement('div');
        card.className = `package-card ${selectMode ? 'select-mode' : ''} ${selectedPackages.has(pkg.id) ? 'selected' : ''}`;
        card.dataset.id = pkg.id;
        
        const actionButton = pkg.installed ? 
            (pkg.update_available ? 
                `<button class="btn btn-primary action-btn" data-action="update" data-id="${pkg.id}">Update</button>` :
                `<button class="btn btn-danger action-btn" data-action="uninstall" data-id="${pkg.id}">Uninstall</button>`) :
            `<button class="btn btn-primary action-btn" data-action="install" data-id="${pkg.id}">Install</button>`;
        
        const isChecked = selectedPackages.has(pkg.id) ? 'checked' : '';
        
        card.innerHTML = `
            <div class="package-header">
                <input type="checkbox" class="pkg-checkbox" ${isChecked} onclick="event.stopPropagation();">
                <img src="${pkg.icon_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' fill=\'%2364748b\' viewBox=\'0 0 24 24\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'></rect></svg>'}" class="package-icon" alt="${pkg.name} icon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' fill=\'%2364748b\' viewBox=\'0 0 24 24\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'></rect></svg>'}">
                <div class="package-info">
                    <h3 class="package-title" title="${pkg.name}">${pkg.name}</h3>
                    <div class="package-publisher">
                        ${pkg.publisher || 'Unknown Publisher'} • v${pkg.version || 'Unknown'}
                    </div>
                </div>
            </div>
            <div class="package-description">
                ${pkg.description || 'No description available for this package.'}
            </div>
            <div class="package-footer">
                <div class="package-tags">
                    <span class="tag ${pkg.type.toLowerCase()}">${pkg.type}</span>
                </div>
                ${actionButton}
            </div>
        `;
        
        // Card Click Handler
        card.addEventListener('click', (e) => {
            // Ignore if clicked on the action button directly
            if (e.target.closest('.action-btn')) return;
            
            if (selectMode) {
                const chk = card.querySelector('.pkg-checkbox');
                const isSel = selectedPackages.has(pkg.id);
                if (isSel) {
                    selectedPackages.delete(pkg.id);
                    card.classList.remove('selected');
                    if (chk) chk.checked = false;
                } else {
                    selectedPackages.add(pkg.id);
                    card.classList.add('selected');
                    if (chk) chk.checked = true;
                }
                updateBatchBar();
            } else {
                openDetailModal(pkg);
            }
        });
        
        // Action Button click handler
        const btn = card.querySelector('.action-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const pid = btn.dataset.id;
                
                if (operationInProgress) {
                    showToast('Busy', 'Another operation is already running', 'warning');
                    return;
                }
                
                btn.classList.add('loading');
                
                if (action === 'install') {
                    installApp(pid, btn);
                } else if (action === 'uninstall') {
                    uninstallApp(pid, btn);
                } else if (action === 'update') {
                    updateApp(pid, btn);
                }
            });
        }
        
        packagesGrid.appendChild(card);
    });
}

// Package Detail Modal View
function openDetailModal(pkg) {
    document.getElementById('detail-icon').src = pkg.icon_url || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' fill=\'%2364748b\' viewBox=\'0 0 24 24\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'></rect></svg>';
    document.getElementById('detail-icon').onerror = function() {
        this.src = 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' fill=\'%2364748b\' viewBox=\'0 0 24 24\'><rect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\' ry=\'2\'></rect></svg>';
    };
    document.getElementById('detail-name').textContent = pkg.name;
    document.getElementById('detail-meta').textContent = `${pkg.type} • v${pkg.version || 'Unknown'}`;
    document.getElementById('detail-description').textContent = pkg.description || 'No description available for this package.';
    
    const table = document.getElementById('detail-table');
    table.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">Loading extended properties...</td></tr>`;
    
    detailModal.classList.remove('hidden');
    
    // Fetch key-value info from python
    pyApiCall('get_info', pkg.id).then(info => {
        table.innerHTML = '';
        if (info && Object.keys(info).length > 0) {
            Object.entries(info).forEach(([key, val]) => {
                const tr = document.createElement('tr');
                const tdKey = document.createElement('td');
                tdKey.textContent = key;
                const tdVal = document.createElement('td');
                if (typeof val === 'object' && val !== null) {
                    tdVal.textContent = JSON.stringify(val);
                } else {
                    tdVal.textContent = String(val);
                }
                tr.appendChild(tdKey);
                tr.appendChild(tdVal);
                table.appendChild(tr);
            });
        } else {
            table.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">No additional properties available.</td></tr>`;
        }
    });

    // Action button in footer
    const footer = document.getElementById('modal-footer');
    footer.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-outline';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => detailModal.classList.add('hidden');
    
    let actionBtn = null;
    if (pkg.installed) {
        if (pkg.update_available) {
            actionBtn = document.createElement('button');
            actionBtn.className = 'btn btn-primary';
            actionBtn.textContent = 'Update';
            actionBtn.onclick = () => {
                detailModal.classList.add('hidden');
                updateApp(pkg.id);
            };
        } else {
            actionBtn = document.createElement('button');
            actionBtn.className = 'btn btn-danger';
            actionBtn.textContent = 'Uninstall';
            actionBtn.onclick = () => {
                detailModal.classList.add('hidden');
                uninstallApp(pkg.id);
            };
        }
    } else {
        actionBtn = document.createElement('button');
        actionBtn.className = 'btn btn-primary';
        actionBtn.textContent = 'Install';
        actionBtn.onclick = () => {
            detailModal.classList.add('hidden');
            installApp(pkg.id);
        };
    }
    
    footer.appendChild(closeBtn);
    if (actionBtn) {
        footer.appendChild(actionBtn);
    }
}

modalClose.addEventListener('click', () => detailModal.classList.add('hidden'));
modalBackdrop.addEventListener('click', () => detailModal.classList.add('hidden'));

// Multi-Select and Batch Panel
selectModeBtn.addEventListener('click', () => {
    toggleSelectMode(!selectMode);
});

function toggleSelectMode(active) {
    selectMode = active;
    selectedPackages.clear();
    updateBatchBar();
    
    if (selectMode) {
        selectModeBtn.textContent = 'Exit Select';
        selectModeBtn.classList.add('btn-primary');
        document.querySelectorAll('.package-card').forEach(card => {
            card.classList.add('select-mode');
        });
    } else {
        selectModeBtn.textContent = 'Select';
        selectModeBtn.classList.remove('btn-primary');
        document.querySelectorAll('.package-card').forEach(card => {
            card.classList.remove('select-mode', 'selected');
            const chk = card.querySelector('.pkg-checkbox');
            if (chk) chk.checked = false;
        });
    }
}

function updateBatchBar() {
    if (selectMode && selectedPackages.size > 0) {
        batchCount.textContent = `${selectedPackages.size} selected`;
        batchBar.classList.remove('hidden');
    } else {
        batchBar.classList.add('hidden');
    }
}

batchUninstallBtn.addEventListener('click', async () => {
    if (selectedPackages.size === 0) return;
    const ids = Array.from(selectedPackages);
    toggleSelectMode(false);
    showToast('Batch Uninstalling', `Uninstalling ${ids.length} packages in batch...`, 'info');
    
    const result = await pyApiCall('batch_uninstall', ids);
    if (result && result.success) {
        showToast('Success', 'Selected packages uninstalled', 'success');
    } else {
        showToast('Error', result ? result.error : 'Batch operation failed', 'error');
    }
});

batchCancelBtn.addEventListener('click', () => {
    toggleSelectMode(false);
});

updateAllBtn.addEventListener('click', async () => {
    showToast('Updating All', 'Starting system packages upgrade...', 'info');
    const result = await pyApiCall('update_all');
    if (result && result.success) {
        showToast('Success', 'System upgrade finished', 'success');
    } else {
        showToast('Error', result ? result.error : 'Bulk upgrade failed', 'error');
    }
});

// Render Chronological Activity Log
async function renderActivityFeed() {
    packagesGrid.innerHTML = '';
    packagesGrid.style.display = 'block'; // activity items stack vertically
    
    const activities = await pyApiCall('get_activity') || [];
    if (activities.length === 0) {
        packagesGrid.innerHTML = '<div style="padding: 32px; color: var(--text-secondary); text-align: center;">No activity recorded yet.</div>';
        return;
    }
    
    const feed = document.createElement('div');
    feed.className = 'activity-feed';
    
    activities.forEach(act => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        const isSuccess = act.success;
        const iconClass = isSuccess ? 'success' : 'error';
        const iconChar = isSuccess ? '✓' : '✗';
        
        const date = new Date(act.timestamp);
        const timeStr = date.toLocaleString();
        
        const actionLabel = act.action.toUpperCase();
        
        item.innerHTML = `
            <div class="activity-icon ${iconClass}">${iconChar}</div>
            <div class="activity-body">
                <span class="activity-action ${act.action}">${actionLabel}</span>
                <span class="activity-pkg">${act.pkg_name}</span>
                <span style="color: var(--text-secondary);">(${act.pkg_type})</span>
                ${!isSuccess && act.error ? `<span style="color: var(--status-danger); margin-left: 8px;">— ${act.error}</span>` : ''}
            </div>
            <div class="activity-time">${timeStr}</div>
        `;
        feed.appendChild(item);
    });
    
    packagesGrid.appendChild(feed);
}

// Data Fetching
async function fetchPackages() {
    packagesGrid.style.display = 'none';
    emptyState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    updateAllBtn.classList.add('hidden'); // hidden by default

    // If batch mode was active, cancel it before view changes or search queries
    if (selectMode) {
        toggleSelectMode(false);
    }

    const query = searchInput.value.trim();
    const type = typeFilter.value;

    let results = [];
    if (query) {
        results = await pyApiCall('search', query, type);
    } else {
        if (currentView === 'installed') {
            results = await pyApiCall('get_installed', type);
        } else if (currentView === 'updates') {
            results = await pyApiCall('get_updates', type);
            if (results && results.length > 0) {
                updateAllBtn.classList.remove('hidden');
            }
        } else if (currentView === 'activity') {
            loadingState.classList.add('hidden');
            renderActivityFeed();
            return;
        } else {
            results = await pyApiCall('get_suggestions', type);
        }
    }

    loadingState.classList.add('hidden');
    currentPackages = results || [];
    renderPackages(currentPackages);
    
    // Update Badge if viewing updates
    if (currentView === 'updates' && !query) {
        document.getElementById('updates-badge').textContent = currentPackages.length;
    }
}

// Action Handlers
window.installApp = async (id, btn = null) => {
    if (btn) btn.classList.add('loading');
    showToast('Installing', 'Installation started in background', 'info');
    const result = await pyApiCall('install', id);
    if (result && result.success) {
        showToast('Success', 'Application installed successfully', 'success');
    } else {
        showToast('Error', result ? result.error : 'Installation failed', 'error');
        if (btn) btn.classList.remove('loading');
    }
};

window.uninstallApp = async (id, btn = null) => {
    if (btn) btn.classList.add('loading');
    showToast('Uninstalling', 'Uninstallation started', 'info');
    const result = await pyApiCall('uninstall', id);
    if (result && result.success) {
        showToast('Success', 'Application uninstalled', 'success');
    } else {
        showToast('Error', result ? result.error : 'Uninstallation failed', 'error');
        if (btn) btn.classList.remove('loading');
    }
};

window.updateApp = async (id, btn = null) => {
    if (btn) btn.classList.add('loading');
    showToast('Updating', 'Update started', 'info');
    const result = await pyApiCall('update', id);
    if (result && result.success) {
        showToast('Success', 'Application updated', 'success');
    } else {
        showToast('Error', result ? result.error : 'Update failed', 'error');
        if (btn) btn.classList.remove('loading');
    }
};

// Event Listeners
let searchTimeout;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        fetchPackages();
    }, 400); // debounce
});

typeFilter.addEventListener('change', () => {
    fetchPackages();
});

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        navItems.forEach(n => n.classList.remove('active'));
        btn.classList.add('active');
        
        currentView = btn.getAttribute('data-view');
        searchInput.value = ''; // clear search on view change
        
        if (currentView === 'settings') {
            packagesGrid.innerHTML = '';
            emptyState.classList.add('hidden');
            loadingState.classList.add('hidden');
            packagesGrid.style.display = 'block';
            packagesGrid.innerHTML = '<div style="padding: 32px; color: var(--text-secondary);">Settings module not yet implemented in Web UI.</div>';
        } else {
            fetchPackages();
        }
    });
});

// Initialization hook when pywebview is ready
window.addEventListener('pywebviewready', function() {
    console.log("pywebview is ready!");
    fetchPackages();
});

// Mock API for development outside of pywebview
const mockApi = {
    search: async (query, type) => [
        { id: '1', name: `Mock Result for ${query}`, publisher: 'Mock Dev', version: '1.0', type: 'Flatpak', description: 'This is a mock search result.', installed: false }
    ],
    get_suggestions: async () => [
        { id: 'app1', name: 'Firefox', publisher: 'Mozilla', version: '115.0', type: 'Flatpak', description: 'A fast, private browser.', installed: false },
        { id: 'app2', name: 'Spotify', publisher: 'Spotify', version: '1.2.0', type: 'Snap', description: 'Music streaming service.', installed: true, update_available: false },
        { id: 'app3', name: 'Discord', publisher: 'Discord', version: '0.0.28', type: 'AUR', description: 'Chat for Gamers.', installed: true, update_available: true }
    ],
    get_installed: async () => [
        { id: 'app2', name: 'Spotify', publisher: 'Spotify', version: '1.2.0', type: 'Snap', description: 'Music streaming service.', installed: true },
        { id: 'app3', name: 'Discord', publisher: 'Discord', version: '0.0.28', type: 'AUR', description: 'Chat for Gamers.', installed: true, update_available: true }
    ],
    get_updates: async () => [
        { id: 'app3', name: 'Discord', publisher: 'Discord', version: '0.0.28', type: 'AUR', description: 'Chat for Gamers.', installed: true, update_available: true }
    ],
    get_activity: async () => [
        { timestamp: new Date().toISOString(), action: 'install', pkg_name: 'Firefox', pkg_type: 'Flatpak', success: true }
    ],
    get_info: async (id) => {
        return {
            'Package ID': id,
            'License': 'MPL-2.0',
            'Size': '125 MB',
            'Source': 'flathub.org',
            'Install Date': new Date().toLocaleDateString()
        };
    },
    install: async (id) => { return new Promise(resolve => setTimeout(() => resolve({success: true}), 1000)); },
    uninstall: async (id) => { return new Promise(resolve => setTimeout(() => resolve({success: true}), 1000)); },
    update: async (id) => { return new Promise(resolve => setTimeout(() => resolve({success: true}), 1000)); },
    batch_uninstall: async (ids) => { return new Promise(resolve => setTimeout(() => resolve({success: true}), 1500)); },
    update_all: async () => { return new Promise(resolve => setTimeout(() => resolve({success: true}), 2000)); }
};

// Fallback initialization if pywebview event doesn't fire within 1s
setTimeout(() => {
    if (!window.pywebview) {
        fetchPackages();
    }
}, 1000);
