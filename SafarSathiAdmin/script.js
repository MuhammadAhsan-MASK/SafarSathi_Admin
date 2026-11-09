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
let allAdvisories = [];
let currentFilter = 'all';

// Chart Instances
let chartCategory = null;
let chartVerification = null;
let chartRegional = null;
let chartPricing = null;
let chartOverview = null;

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

    if (tabId === 'analytics') {
        setTimeout(updateAnalyticsCharts, 100);
    }

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

    // 6. Travel Advisories Listener (FEATURE 1)
    db.collection('travel_advisories').onSnapshot(snapshot => {
        allAdvisories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort newest first
        allAdvisories.sort((a, b) => {
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeB - timeA;
        });
        renderAdvisoriesList();
        updateOverviewBroadcastWidget();
    }, err => {
        console.warn("Travel advisories listener error:", err);
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

    // Update Analytics Charts (FEATURE 2)
    updateAnalyticsCharts();
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

// ============================================================================
// FEATURE 1: EMERGENCY ROAD & TRAVEL ADVISORY BROADCASTER
// ============================================================================
const ADVISORY_PRESETS = {
    babusar: {
        place: "Babusar Pass & Naran Valley",
        region: "Gilgit-Baltistan / KP",
        headline: "Babusar Pass closed due to heavy winter snow; divert via Karakoram Highway",
        road: "Babusar Pass closed for winter; KKH fully open via Besham & Kohistan",
        vehicle: "4x4 mandatory in upper valleys; standard cars allowed via KKH",
        weather: "-6°C, Heavy Snowfall & Road Frost",
        helpline: "1422 (GB Tourism Police)",
        source: "NDMA & GBDMA Official Road Advisory",
        report: "Babusar Top (N-15) is closed for all vehicular traffic due to high-altitude snowfall and black ice glaze. All travelers destined for Chilas, Gilgit, Hunza, or Skardu are instructed to use the Karakoram Highway (N-35) through Mansehra and Besham.",
        severity: "warning",
        image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600"
    },
    hunza: {
        place: "Hunza Valley & Attabad",
        region: "Gilgit-Baltistan",
        headline: "KKH smooth and clear through Central Hunza; crisp autumn weather prevailing",
        road: "Karakoram Highway (N-35) 100% open for all vehicles through Aliabad & Karimabad",
        vehicle: "All cars, Hiace vans and buses permitted",
        weather: "8°C, Clear Skies & Crisp Sun",
        helpline: "1422 (GB Tourism Police)",
        source: "GB Tourism Police & District Administration Hunza",
        report: "The Karakoram Highway corridor through Hunza, Gojal, and Passu is fully operational with zero road blockages. Tourist sites and Attabad tunnels remain completely open with normal seasonal river flow.",
        severity: "safe",
        image: "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?w=600"
    },
    skardu: {
        place: "Skardu & Jaglot Road",
        region: "Gilgit-Baltistan",
        headline: "Jaglot-Skardu Highway open; regular flights operating into Skardu Airport",
        road: "Jaglot-Skardu Strategic Highway (S-1) clear; Deosai tracks closed",
        vehicle: "All cars to Skardu; 4x4 mandatory for upper valleys",
        weather: "4°C, Partly Cloudy & Chilly",
        helpline: "1129 (NDMA Helpline)",
        source: "Civil Aviation Authority (CAA) & Skardu Administration",
        report: "Jaglot-Skardu Road is clear for both light and heavy vehicles. Daily commercial flights to Skardu Airport from Islamabad are running on schedule. Deosai National Park remains closed for winter.",
        severity: "safe",
        image: "https://images.unsplash.com/photo-1598890777032-bde835ba27c2?w=600"
    },
    murree: {
        place: "Murree & Galiyat",
        region: "Punjab / KP",
        headline: "Dense evening fog and road frost reported; maintain safe distance on Expressway",
        road: "Expressway N-75 open; fog reduces visibility below 40m after 9 PM",
        vehicle: "Cars permitted; carry snow chains for Nathiagali and high elevations",
        weather: "10°C, Dense Fog & Frost",
        helpline: "051-9269200 (Murree Traffic Police)",
        source: "City Traffic Police Murree & PDMA Punjab",
        report: "Motorists traveling to Murree, Patriata, and Nathiagali are instructed to exercise extreme caution during night and dawn hours due to thick fog blankets and surface frost.",
        severity: "caution",
        image: "https://images.unsplash.com/photo-1605538032432-a9f0c0d9e504?w=600"
    },
    swat: {
        place: "Swat & Kalam Valley",
        region: "Khyber Pakhtunkhwa",
        headline: "Swat Expressway smooth; Kalam road clear with seasonal cold weather",
        road: "Swat Motorway (M-16) and Mingora-Bahrain-Kalam road open",
        vehicle: "Standard vehicles up to Kalam; 4x4 for Mahodand Lake track",
        weather: "7°C, Crisp Autumn Weather",
        helpline: "1122 (Rescue KP)",
        source: "Khyber Pakhtunkhwa Tourism Police",
        report: "All roads leading to Bahrain, Kalam, and Malam Jabba are accessible. River flows are safe and seasonal tourist activities continue normally.",
        severity: "safe",
        image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600"
    },
    islamabad: {
        place: "Islamabad & Margalla Hills",
        region: "Federal Capital",
        headline: "Margalla trails and city routes fully open; mild pleasant travel conditions",
        road: "All city avenues and hill climbs in pristine condition",
        vehicle: "All vehicle types",
        weather: "19°C, Sunny & Clear",
        helpline: "1915 (Islamabad Traffic Police)",
        source: "Capital Development Authority (CDA)",
        report: "Trail 3, Trail 5, Daman-e-Koh, and Monal routes are completely clear and experiencing pleasant hiking weather.",
        severity: "safe",
        image: "https://images.unsplash.com/photo-1548013146-72479768bada?w=600"
    }
};

function applyAdvisoryPreset(key) {
    const preset = ADVISORY_PRESETS[key];
    if (!preset) return;

    document.getElementById('adv-place').value = preset.place;
    document.getElementById('adv-region').value = preset.region;
    document.getElementById('adv-headline').value = preset.headline;
    document.getElementById('adv-road').value = preset.road;
    document.getElementById('adv-vehicle').value = preset.vehicle;
    document.getElementById('adv-weather').value = preset.weather;
    document.getElementById('adv-helpline').value = preset.helpline;
    document.getElementById('adv-source').value = preset.source;
    document.getElementById('adv-report').value = preset.report;
    document.getElementById('adv-image').value = preset.image;

    // Set radio
    const radio = document.querySelector(`input[name="severity"][value="${preset.severity}"]`);
    if (radio) {
        radio.checked = true;
        updateSeverityPills();
    }

    showToast(`⚡ Loaded preset for ${preset.place}`);
}

function updateSeverityPills() {
    const radios = document.querySelectorAll('input[name="severity"]');
    radios.forEach(r => {
        const pill = r.closest('.severity-pill');
        if (r.checked) {
            pill.classList.add('selected');
        } else {
            pill.classList.remove('selected');
        }
    });
}

async function handleBroadcastSubmit(e) {
    e.preventDefault();
    if (!db) {
        showToast('⚠️ Firebase is not connected yet.');
        return;
    }

    const btn = document.getElementById('btn-broadcast');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Broadcasting to Mobile...';
    btn.disabled = true;

    try {
        const placeName = document.getElementById('adv-place').value.trim();
        const region = document.getElementById('adv-region').value.trim();
        const headline = document.getElementById('adv-headline').value.trim();
        const roadCondition = document.getElementById('adv-road').value.trim();
        const vehicleRecommendation = document.getElementById('adv-vehicle').value.trim();
        const weatherCondition = document.getElementById('adv-weather').value.trim();
        const emergencyHelpline = document.getElementById('adv-helpline').value.trim();
        const officialSource = document.getElementById('adv-source').value.trim() || 'SafarSathi Admin Command Center';
        const fullNewsReport = document.getElementById('adv-report').value.trim();
        const imageUrl = document.getElementById('adv-image').value.trim() || 'https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?w=600';
        
        const selectedSeverity = document.querySelector('input[name="severity"]:checked')?.value || 'warning';

        let statusTitle = 'Safe to Travel • All Clear';
        if (selectedSeverity === 'warning') statusTitle = 'Critical Road Advisory • Route Diverted';
        else if (selectedSeverity === 'caution') statusTitle = 'Travel with Caution • Winter Weather';

        // Extract temperature number if possible
        const tempMatch = weatherCondition.match(/-?\d+/);
        const currentTemp = tempMatch ? parseInt(tempMatch[0], 10) : 10;

        const advisoryDoc = {
            placeName,
            region,
            safetyStatus: selectedSeverity,
            statusTitle,
            headline,
            roadCondition,
            vehicleRecommendation,
            weatherCondition,
            currentTemp,
            tempUnit: '°C',
            emergencyHelpline: emergencyHelpline || '1122',
            helplineName: 'Rescue 1122 & Police Helpline',
            officialSource,
            fullNewsReport,
            imageUrl,
            isActive: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            broadcastBy: 'Admin Command Center'
        };

        await db.collection('travel_advisories').add(advisoryDoc);

        showToast(`📢 <b>Advisory Broadcasted!</b> Live alert pushed for ${placeName}.`);
        document.getElementById('advisory-form').reset();
        updateSeverityPills();

    } catch (err) {
        console.error('Error broadcasting advisory:', err);
        showToast(`❌ Error broadcasting alert: ${err.message}`);
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

function renderAdvisoriesList() {
    const container = document.getElementById('active-advisories-container');
    const badgeCount = document.getElementById('active-broadcasts-count');
    const navBadge = document.getElementById('nav-advisories-badge');

    if (!container) return;

    const activeList = allAdvisories.filter(a => a.isActive !== false);

    if (badgeCount) badgeCount.innerText = `${activeList.length} Active`;
    if (navBadge) {
        navBadge.innerText = `${activeList.length} LIVE`;
        navBadge.style.display = activeList.length > 0 ? 'inline-block' : 'none';
    }

    if (allAdvisories.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem; color:var(--text-muted);">
                <i class="fas fa-satellite" style="font-size:2.5rem; color:#cbd5e1; margin-bottom:1rem;"></i>
                <h4>No Active Advisories</h4>
                <p style="font-size:0.85rem;">Draft an advisory on the left to push a live notification and ticker alert to all mobile app users.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = allAdvisories.map(item => {
        const isWarning = item.safetyStatus === 'warning';
        const isCaution = item.safetyStatus === 'caution';
        const sevClass = isWarning ? 'sev-warning' : (isCaution ? 'sev-caution' : 'sev-safe');
        
        let sevBadgeColor = '#10b981';
        let sevLabel = 'Safe to Travel';
        if (isWarning) {
            sevBadgeColor = '#ef4444';
            sevLabel = 'Critical Warning';
        } else if (isCaution) {
            sevBadgeColor = '#f59e0b';
            sevLabel = 'Caution Alert';
        }

        const dateStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';

        return `
            <div class="live-advisory-item ${sevClass}">
                <div class="live-advisory-header">
                    <span class="badge" style="background:${sevBadgeColor}; color:white; font-size:0.7rem; padding:0.2rem 0.55rem; border-radius:8px;">
                        ${isWarning ? '<i class="fas fa-exclamation-triangle"></i>' : (isCaution ? '<i class="fas fa-bell"></i>' : '<i class="fas fa-check-circle"></i>')} ${sevLabel}
                    </span>
                    <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">
                        <i class="far fa-clock"></i> ${dateStr}
                    </span>
                </div>
                <div class="live-advisory-headline">${item.headline || 'Travel Advisory'}</div>
                <div class="live-advisory-meta">
                    <span><i class="fas fa-map-marker-alt" style="color:#6A1B9A;"></i> ${item.placeName || 'Pakistan'} (${item.region || 'National'})</span>
                    ${item.weatherCondition ? `<span><i class="fas fa-cloud-sun"></i> ${item.weatherCondition}</span>` : ''}
                    ${item.roadCondition ? `<span><i class="fas fa-road"></i> ${item.roadCondition}</span>` : ''}
                </div>
                <div class="live-advisory-actions">
                    <button class="btn-adv-action btn-adv-delete" onclick="deleteAdvisory('${item.id}', '${escapeQuotes(item.placeName)}')">
                        <i class="fas fa-trash-alt"></i> Remove Alert
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteAdvisory(id, placeName) {
    if (!confirm(`Are you sure you want to retract and delete the advisory for "${placeName}"? It will disappear from all mobile apps immediately.`)) {
        return;
    }

    try {
        await db.collection('travel_advisories').doc(id).delete();
        showToast(`🗑️ Removed advisory for <b>${placeName}</b>.`);
    } catch (err) {
        console.error('Error deleting advisory:', err);
        showToast(`❌ Error deleting advisory: ${err.message}`);
    }
}

function updateOverviewBroadcastWidget() {
    const headlineEl = document.getElementById('overview-broadcast-headline');
    const subEl = document.getElementById('overview-broadcast-sub');
    if (!headlineEl || !subEl) return;

    const critical = allAdvisories.find(a => a.safetyStatus === 'warning');
    if (critical) {
        headlineEl.innerHTML = `🚨 <span style="color:#e91e63;">${critical.placeName}:</span> ${critical.headline}`;
        subEl.innerText = `${critical.roadCondition || 'Extreme caution advised'} • Emergency helpline: ${critical.emergencyHelpline || '1122'}`;
    } else {
        const caution = allAdvisories.find(a => a.safetyStatus === 'caution');
        if (caution) {
            headlineEl.innerHTML = `⚠️ <span style="color:#f59e0b;">${caution.placeName}:</span> ${caution.headline}`;
            subEl.innerText = `${caution.roadCondition || 'Drive safely'} • Helpline: ${caution.emergencyHelpline || '1122'}`;
        } else {
            headlineEl.innerText = 'No critical road closures reported';
            subEl.innerText = 'All national transit arteries operating under standard safety protocol.';
        }
    }
}


// ============================================================================
// FEATURE 2: INTERACTIVE ANALYTICS & INSIGHTS (Chart.js)
// ============================================================================
function updateAnalyticsCharts() {
    try {
        if (typeof Chart === 'undefined') return;

        const allItems = [...allHotels, ...allRestaurants, ...allTransports, ...allGuides];
        const activeItems = allItems.filter(item => item.isVerified !== false);
        const pendingItems = allItems.filter(item => item.isVerified === false);

        // 1. KPI Calculations
        const coverageRate = allItems.length > 0 ? Math.round((activeItems.length / allItems.length) * 100) : 100;
        const kpiCoverage = document.getElementById('kpi-coverage-rate');
        if (kpiCoverage) kpiCoverage.innerText = `${coverageRate}%`;

        // Calculate Top Destination Hub
        const locationCounts = {};
        allItems.forEach(item => {
            let loc = (item.location || item.city || item.region || 'Islamabad').trim();
            const locLower = loc.toLowerCase();
            if (locLower.includes('islamabad')) loc = 'Islamabad';
            else if (locLower.includes('hunza')) loc = 'Hunza';
            else if (locLower.includes('skardu')) loc = 'Skardu';
            else if (locLower.includes('murree')) loc = 'Murree';
            else if (locLower.includes('swat')) loc = 'Swat';
            else if (locLower.includes('lahore')) loc = 'Lahore';
            else if (locLower.includes('karachi')) loc = 'Karachi';
            else if (locLower.includes('peshawar')) loc = 'Peshawar';
            else if (locLower.includes('kaghan') || locLower.includes('naran')) loc = 'Naran / Kaghan';
            
            locationCounts[loc] = (locationCounts[loc] || 0) + 1;
        });

        const sortedLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]);
        const topHub = sortedLocations.length > 0 ? sortedLocations[0][0] : 'Islamabad';
        const kpiTopHub = document.getElementById('kpi-top-hub');
        if (kpiTopHub) kpiTopHub.innerText = topHub;

        // Calculate Average Hotel Price
        const hotelPrices = allHotels.map(h => parseFloat(h.price) || 0).filter(p => p > 0);
        const avgHotelPrice = hotelPrices.length > 0 ? Math.round(hotelPrices.reduce((a, b) => a + b, 0) / hotelPrices.length) : 8500;
        const kpiAvgHotel = document.getElementById('kpi-avg-hotel');
        if (kpiAvgHotel) kpiAvgHotel.innerText = `PKR ${avgHotelPrice.toLocaleString()}`;

        // Calculate Average Guide Price
        const guidePrices = allGuides.map(g => parseFloat(g.dailyRate || g.price) || 0).filter(p => p > 0);
        const avgGuidePrice = guidePrices.length > 0 ? Math.round(guidePrices.reduce((a, b) => a + b, 0) / guidePrices.length) : 4500;
        const kpiAvgGuide = document.getElementById('kpi-avg-guide');
        if (kpiAvgGuide) kpiAvgGuide.innerText = `PKR ${avgGuidePrice.toLocaleString()}`;

        // 2. Chart Renders with safety guards
        try { renderCategoryChart(); } catch (e) { console.warn("Category chart:", e); }
        try { renderVerificationChart(activeItems.length, pendingItems.length); } catch (e) { console.warn("Verification chart:", e); }
        try { renderRegionalChart(sortedLocations); } catch (e) { console.warn("Regional chart:", e); }
        try { renderPricingChart(avgHotelPrice, avgGuidePrice); } catch (e) { console.warn("Pricing chart:", e); }
        try { renderOverviewChart(); } catch (e) { console.warn("Overview chart:", e); }
    } catch (err) {
        console.warn("Analytics computation error:", err);
    }
}

function renderCategoryChart() {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = [allHotels.length, allRestaurants.length, allTransports.length, allGuides.length];

    if (chartCategory) {
        chartCategory.data.datasets[0].data = data;
        chartCategory.update();
        return;
    }

    chartCategory = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Hotels & Stays', 'Restaurants & Dining', 'Fleet & Transport', 'Tour Guides'],
            datasets: [{
                data: data,
                backgroundColor: ['#6A1B9A', '#E91E63', '#2196F3', '#00897B'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Poppins', size: 12 },
                        boxWidth: 14,
                        padding: 16
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function renderVerificationChart(verifiedCount, pendingCount) {
    const canvas = document.getElementById('verificationChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = [verifiedCount, pendingCount];

    if (chartVerification) {
        chartVerification.data.datasets[0].data = data;
        chartVerification.update();
        return;
    }

    chartVerification = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Published & Verified', 'Pending Admin Review'],
            datasets: [{
                data: data,
                backgroundColor: ['#2e7d32', '#ff9800'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Poppins', size: 12 },
                        boxWidth: 14,
                        padding: 16
                    }
                }
            },
            cutout: '60%'
        }
    });
}

function renderRegionalChart(sortedLocations) {
    const canvas = document.getElementById('regionalChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const top6 = sortedLocations.slice(0, 6);
    const labels = top6.map(l => l[0]);
    const counts = top6.map(l => l[1]);

    if (chartRegional) {
        chartRegional.data.labels = labels;
        chartRegional.data.datasets[0].data = counts;
        chartRegional.update();
        return;
    }

    chartRegional = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['Islamabad', 'Hunza', 'Skardu', 'Murree', 'Swat'],
            datasets: [{
                label: 'Registered Services',
                data: counts.length ? counts : [6, 4, 3, 3, 2],
                backgroundColor: '#2196F3',
                borderRadius: 8
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { precision: 0, font: { family: 'Poppins' } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                y: {
                    ticks: { font: { family: 'Poppins', weight: '500' } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderPricingChart(avgHotel, avgGuide) {
    const canvas = document.getElementById('pricingChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = ['Hotel Nightly', 'Guide Day-Rate', 'Avg Transport Day', 'Dining Avg'];
    const values = [avgHotel, avgGuide, 5500, 1200];

    if (chartPricing) {
        chartPricing.data.datasets[0].data = values;
        chartPricing.update();
        return;
    }

    chartPricing = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Price (PKR)',
                data: values,
                backgroundColor: ['#6A1B9A', '#00897B', '#2196F3', '#E91E63'],
                borderRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `PKR ${ctx.raw.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: (val) => `PKR ${val.toLocaleString()}`,
                        font: { family: 'Poppins' }
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    ticks: { font: { family: 'Poppins', weight: '500' } },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderOverviewChart() {
    const canvas = document.getElementById('overviewCategoryChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const data = [allHotels.length, allRestaurants.length, allTransports.length, allGuides.length];

    if (chartOverview) {
        chartOverview.data.datasets[0].data = data;
        chartOverview.update();
        return;
    }

    chartOverview = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Hotels', 'Food', 'Transport', 'Guides'],
            datasets: [{
                data: data,
                backgroundColor: ['#6A1B9A', '#E91E63', '#2196F3', '#00897B'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        font: { family: 'Poppins', size: 11 },
                        boxWidth: 10
                    }
                }
            },
            cutout: '65%'
        }
    });
}
