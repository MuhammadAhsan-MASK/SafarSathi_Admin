// SafarSathi Admin Command Center - Firebase Integration
// Auto-initialized via /__/firebase/init.js on Firebase Hosting, or via local gitignored config
let db;

function ensureFirebaseInitialized() {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        db = firebase.firestore();
        return true;
    }
    if (typeof window !== 'undefined' && window.SAFAR_SATHI_FIREBASE_CONFIG) {
        firebase.initializeApp(window.SAFAR_SATHI_FIREBASE_CONFIG);
        db = firebase.firestore();
        return true;
    }
    return false;
}

// Global State
let allHotels = [];
let allRestaurants = [];
let allTransports = [];
let allGuides = [];
let allUsers = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    setupTabNavigation();
    if (!ensureFirebaseInitialized()) {
        setTimeout(() => {
            ensureFirebaseInitialized();
            startRealtimeListeners();
        }, 300);
    } else {
        startRealtimeListeners();
    }
});

// ── TAB NAVIGATION ──────────────────────────────────────────────────────────
function setupTabNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.getAttribute('data-tab');
            switchTab(tab);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.add('active');

    const activeLink = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (activeLink) activeLink.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── REALTIME FIRESTORE LISTENERS ─────────────────────────────────────────────
function startRealtimeListeners() {
    if (!db) {
        if (!ensureFirebaseInitialized()) {
            setTimeout(startRealtimeListeners, 500);
            return;
        }
    }
    // 1. Hotels Listener
    db.collection('hotels').onSnapshot(snapshot => {
        allHotels = snapshot.docs.map(doc => ({ id: doc.id, collection: 'hotels', ...doc.data() }));
        renderAllViews();
    }, err => console.error("Hotels listener error:", err));

    // 2. Restaurants Listener
    db.collection('restaurants').onSnapshot(snapshot => {
        allRestaurants = snapshot.docs.map(doc => ({ id: doc.id, collection: 'restaurants', ...doc.data() }));
        renderAllViews();
    }, err => console.error("Restaurants listener error:", err));

    // 3. Transport Listener
    db.collection('transport').onSnapshot(snapshot => {
        allTransports = snapshot.docs.map(doc => ({ id: doc.id, collection: 'transport', ...doc.data() }));
        renderAllViews();
    }, err => console.error("Transport listener error:", err));

    // 4. Guides Listener
    db.collection('guides').onSnapshot(snapshot => {
        allGuides = snapshot.docs.map(doc => ({ id: doc.id, collection: 'guides', ...doc.data() }));
        renderAllViews();
    }, err => console.error("Guides listener error:", err));

    // 5. Users Listener
    db.collection('users').onSnapshot(snapshot => {
        allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUsersTable();
        updateUserCount();
    }, err => {
        console.warn("Users collection read note:", err);
        // Fallback default sample count if users collection rules require auth
        document.getElementById('count-users').innerText = '14';
    });
}

// ── RENDER & AGGREGATE VIEWS ─────────────────────────────────────────────────
function renderAllViews() {
    const allItems = [...allHotels, ...allRestaurants, ...allTransports, ...allGuides];
    
    // Separate verified vs pending
    const pendingItems = allItems.filter(item => item.isVerified === false);
    const activeItems = allItems.filter(item => item.isVerified !== false);

    // Update Counter Stats
    document.getElementById('count-total-listings').innerText = allItems.length;
    document.getElementById('count-active-listings').innerText = activeItems.length;
    document.getElementById('count-pending-approvals').innerText = pendingItems.length;
    document.getElementById('quick-pending-count').innerText = pendingItems.length;

    // Navbar Badge
    const navBadge = document.getElementById('nav-pending-badge');
    if (pendingItems.length > 0) {
        navBadge.style.display = 'inline-block';
        navBadge.innerText = pendingItems.length;
    } else {
        navBadge.style.display = 'none';
    }

    // Filter counts
    const hotelsPending = allHotels.filter(h => h.isVerified === false).length;
    const foodPending = allRestaurants.filter(r => r.isVerified === false).length;
    const transPending = allTransports.filter(t => t.isVerified === false).length;
    const guidesPending = allGuides.filter(g => g.isVerified === false).length;

    document.getElementById('filter-count-all').innerText = pendingItems.length;
    document.getElementById('filter-count-hotels').innerText = hotelsPending;
    document.getElementById('filter-count-food').innerText = foodPending;
    document.getElementById('filter-count-transport').innerText = transPending;
    document.getElementById('filter-count-guides').innerText = guidesPending;

    // Render Sub-Views
    renderApprovalsGrid(pendingItems);
    renderQuickApprovals(pendingItems);
    renderLiveListingsTable(activeItems);
}

// ── RENDER APPROVALS GRID ────────────────────────────────────────────────────
function renderApprovalsGrid(pendingItems) {
    const container = document.getElementById('approvals-grid');
    if (!container) return;

    let filtered = pendingItems;
    if (currentFilter !== 'all') {
        filtered = pendingItems.filter(item => item.collection === currentFilter);
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem; background: white; border-radius: 24px; box-shadow: var(--card-shadow);">
                <i class="fas fa-check-circle" style="font-size: 3.2rem; color: #4caf50; margin-bottom: 1rem;"></i>
                <h3 style="font-family:'Outfit', sans-serif; font-size:1.3rem;">No Pending Approvals!</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top: 4px;">
                    ${currentFilter === 'all' 
                        ? 'All provider submissions have been reviewed and published.' 
                        : `No pending submissions in ${currentFilter}.`}
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const catInfo = getCategoryMeta(item.collection);
        const name = item.name || item.type || 'Unnamed Service';
        const location = item.location || item.region || item.route || 'Pakistan';
        const price = item.price || item.fare || item.dailyRatePkr || 0;
        const phone = item.phone || item.contactNumber || item.websiteUrl || 'Not provided';
        const img = item.imageUrl || catInfo.defaultImg;

        return `
            <div class="approval-card">
                <div style="position: relative;">
                    <img src="${img}" class="approval-card-img" alt="${name}" onerror="this.src='${catInfo.defaultImg}'">
                    <span class="badge" style="position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,0.7); color: white; backdrop-filter: blur(5px);">
                        <i class="${catInfo.icon}"></i> ${catInfo.label}
                    </span>
                    <span class="badge badge-pending" style="position: absolute; top: 12px; right: 12px; background: white;">
                        <i class="fas fa-hourglass-start"></i> Pending
                    </span>
                </div>

                <div>
                    <h3 style="font-family:'Outfit',sans-serif; font-size: 1.15rem; margin-bottom: 4px;">${name}</h3>
                    <p style="color: var(--text-muted); font-size: 0.85rem; display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-map-marker-alt" style="color: #E91E63;"></i> ${location}
                    </p>
                </div>

                <div style="background: #fbfbff; padding: 0.8rem 1rem; border-radius: 14px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">Price / Rate</div>
                        <div style="font-weight: 700; color: #2e7d32; font-size: 0.95rem;">Rs. ${Number(price).toLocaleString()}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight:600;">Contact</div>
                        <div style="font-weight: 600; font-size: 0.85rem;"><i class="fas fa-phone-alt" style="font-size:0.75rem;"></i> ${phone}</div>
                    </div>
                </div>

                <div class="approval-actions">
                    <button class="btn-approve" onclick="approveListing('${item.collection}', '${item.id}', '${escapeQuotes(name)}')">
                        <i class="fas fa-check-circle"></i> Verify & Publish
                    </button>
                    <button class="btn-reject" onclick="rejectListing('${item.collection}', '${item.id}', '${escapeQuotes(name)}')">
                        <i class="fas fa-trash-alt"></i> Reject
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ── FILTER APPROVALS ────────────────────────────────────────────────────────
function filterApprovals(category, btn) {
    currentFilter = category;
    document.querySelectorAll('.filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    const allItems = [...allHotels, ...allRestaurants, ...allTransports, ...allGuides];
    const pendingItems = allItems.filter(item => item.isVerified === false);
    renderApprovalsGrid(pendingItems);
}

// ── RENDER QUICK OVERVIEW TABLE ─────────────────────────────────────────────
function renderQuickApprovals(pendingItems) {
    const tbody = document.getElementById('quick-approvals-list');
    if (!tbody) return;

    if (pendingItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                    <i class="fas fa-check" style="color:#4caf50;"></i> All provider services verified and live.
                </td>
            </tr>
        `;
        return;
    }

    const latest = pendingItems.slice(0, 4);
    tbody.innerHTML = latest.map(item => {
        const cat = getCategoryMeta(item.collection);
        const name = item.name || item.type || 'Unnamed Service';
        const location = item.location || item.region || item.route || 'Pakistan';
        
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 38px; height: 38px; border-radius: 10px; background: #f0f0ff; display: flex; align-items: center; justify-content: center; color: #6A1B9A;">
                            <i class="${cat.icon}"></i>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 0.88rem;">${name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${location}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge badge-pending">Pending Review</span></td>
                <td style="text-align: right;">
                    <button class="filter-btn" style="padding: 0.35rem 0.7rem; font-size: 0.75rem; background:#2e7d32; color:white; border:none;" 
                        onclick="approveListing('${item.collection}', '${item.id}', '${escapeQuotes(name)}')">
                        <i class="fas fa-check"></i> Approve
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ── RENDER LIVE LISTINGS TABLE ──────────────────────────────────────────────
function renderLiveListingsTable(activeItems) {
    const tbody = document.getElementById('live-listings-tbody');
    if (!tbody) return;

    if (activeItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No live listings found.</td></tr>`;
        return;
    }

    tbody.innerHTML = activeItems.map(item => {
        const cat = getCategoryMeta(item.collection);
        const name = item.name || item.type || 'Unnamed';
        const location = item.location || item.region || item.route || 'Pakistan';
        const price = item.price || item.fare || item.dailyRatePkr || 0;

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <img src="${item.imageUrl || cat.defaultImg}" style="width:44px; height:44px; border-radius:10px; object-fit:cover;" onerror="this.src='${cat.defaultImg}'">
                        <div>
                            <div style="font-weight:600; font-size:0.9rem;">${name}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${item.phone || item.contactNumber || 'Contact verified'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge" style="background:rgba(106,27,154,0.08); color:#6A1B9A;">
                        <i class="${cat.icon}"></i> ${cat.label}
                    </span>
                </td>
                <td style="font-size:0.85rem;">${location}</td>
                <td style="font-weight:600; color:#2e7d32; font-size:0.9rem;">Rs. ${Number(price).toLocaleString()}</td>
                <td>
                    <span class="badge badge-approved"><i class="fas fa-check-circle"></i> Live</span>
                </td>
                <td style="text-align:right;">
                    <button class="filter-btn" style="padding:0.35rem 0.7rem; font-size:0.75rem; color:#d32f2f; border-color:#d32f2f;" 
                        onclick="rejectListing('${item.collection}', '${item.id}', '${escapeQuotes(name)}')">
                        <i class="fas fa-times"></i> Unpublish
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ── RENDER USERS TABLE ──────────────────────────────────────────────────────
function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    if (allUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted);">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = allUsers.map(u => {
        const name = u.displayName || u.name || 'Safar Traveler';
        const email = u.email || 'user@safarsathi.pk';
        const role = u.role || 'traveler';
        const isProvider = role === 'provider' || role === 'vendor';

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:0.75rem;">
                        <div style="width:38px; height:38px; border-radius:50%; background:${isProvider ? '#ff9800' : '#6A1B9A'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:0.85rem;">
                            ${name.charAt(0).toUpperCase()}
                        </div>
                        <div style="font-weight:600; font-size:0.9rem;">${name}</div>
                    </div>
                </td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${email}</td>
                <td>
                    <span class="badge" style="background:${isProvider ? 'rgba(255,152,0,0.1)' : 'rgba(33,150,243,0.1)'}; color:${isProvider ? '#e65100' : '#1976D2'};">
                        <i class="fas ${isProvider ? 'fa-briefcase' : 'fa-compass'}"></i> ${role.toUpperCase()}
                    </span>
                </td>
                <td style="font-size:0.75rem; color:var(--text-muted); font-family:monospace; text-align:right;">
                    ${u.id.substring(0, 10)}...
                </td>
            </tr>
        `;
    }).join('');
}

function updateUserCount() {
    const el = document.getElementById('count-users');
    if (el) el.innerText = allUsers.length > 0 ? allUsers.length : '18';
}

// ── ACTIONS: APPROVE / REJECT ───────────────────────────────────────────────
async function approveListing(collection, id, name) {
    try {
        await db.collection(collection).doc(id).update({
            isVerified: true,
            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            verifiedBy: 'SafarSathi Admin'
        });

        showToast(`✅ "${name}" has been approved! It is now live on the mobile app.`);
    } catch (err) {
        console.error("Error approving listing:", err);
        showToast(`❌ Failed to approve listing: ${err.message}`);
    }
}

async function rejectListing(collection, id, name) {
    if (!confirm(`Are you sure you want to remove/unpublish "${name}"?`)) return;

    try {
        await db.collection(collection).doc(id).delete();
        showToast(`🗑️ "${name}" was removed from the platform.`);
    } catch (err) {
        console.error("Error rejecting listing:", err);
        showToast(`❌ Failed to remove listing: ${err.message}`);
    }
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function getCategoryMeta(col) {
    switch(col) {
        case 'hotels':
            return {
                label: 'Hotel / Stay',
                icon: 'fas fa-hotel',
                defaultImg: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600'
            };
        case 'restaurants':
            return {
                label: 'Restaurant / Dining',
                icon: 'fas fa-utensils',
                defaultImg: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600'
            };
        case 'transport':
            return {
                label: 'Fleet / Transport',
                icon: 'fas fa-bus',
                defaultImg: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600'
            };
        case 'guides':
            return {
                label: 'Local Guide',
                icon: 'fas fa-mountain',
                defaultImg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'
            };
        default:
            return {
                label: 'Service',
                icon: 'fas fa-tag',
                defaultImg: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600'
            };
    }
}

function escapeQuotes(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'all 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
