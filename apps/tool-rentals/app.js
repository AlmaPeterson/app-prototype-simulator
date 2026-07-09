// ── ToolYard Rentals App ─────────────────────────────────────────────────────
// Equipment-rental demo app modeled on www.longleafrentalsllc.com's UX
// (category tiles, 4hr/1day/1week/1month pricing tiers, an order-request
// form, and a footer-style Info tab with hours/policies/FAQ). Placeholder
// brand — not Longleaf's real name/logo/contact info.
//
// Reuses Kinetic Flow's kit/tool catalog (apps/kinetic-flow/db/*.json) as the
// rental inventory: same 40 kits across 13 categories. Rental pricing is
// synthesized per category (see CATEGORY_DAY_RATE) since the source data has
// no rental-rate concept of its own.
//
// Self-contained IIFE, single render() over one #main innerHTML string (no
// mock DB, no localStorage) — state lives in the module closure and survives
// app switches within a session, same as apps/flavor-hub and
// apps/label-designer's in-memory stores.
(function () {
const KITS_URL = 'apps/kinetic-flow/db/inventory_kits.json';
const MATERIALS_URL = 'apps/kinetic-flow/db/materials.json';

const CATEGORY_ICONS = {
    'Electrical': '⚡',
    'Plumbing': '🚰',
    'Fixtures & HVAC': '❄️',
    'Drywall': '🧱',
    'Finish Carpentry': '🪵',
    'Painting': '🎨',
    'Safety & Cleanup': '🦺',
    'Doors & Hardware': '🚪',
    'Framing': '🏗️',
    'Flooring & Tile': '🧩',
    'Fasteners & Hardware': '🔩',
    'Tools': '🔨',
    'Drill Bits & Sanding': '🪛',
};

// Daily rate per category (dollars) — everything else derives from this.
const CATEGORY_DAY_RATE = {
    'Electrical': 45,
    'Plumbing': 40,
    'Fixtures & HVAC': 95,
    'Drywall': 35,
    'Finish Carpentry': 55,
    'Painting': 30,
    'Safety & Cleanup': 20,
    'Doors & Hardware': 35,
    'Framing': 60,
    'Flooring & Tile': 40,
    'Fasteners & Hardware': 15,
    'Tools': 70,
    'Drill Bits & Sanding': 30,
};

const TIERS = [
    { key: 'fourHour', label: '4 Hours' },
    { key: 'day', label: '1 Day' },
    { key: 'week', label: '1 Week' },
    { key: 'month', label: '1 Month' },
];

const FEATURED_IDS = [
    'kit-basic-electrical-kit',
    'kit-hvac-install-kit',
    'kit-safety-cleanup-kit',
    'kit-rotary-hammer',
];

// ── Catalog (loaded once, cached in module scope) ───────────────────────────
let KITS = null;
let MATERIALS = null;
let CATEGORIES = null; // [{ name, kits: [kit,...] }] in first-seen order
let loadPromise = null;

function loadCatalog() {
    if (loadPromise) return loadPromise;
    loadPromise = Promise.all([
        fetch(KITS_URL).then(r => r.json()),
        fetch(MATERIALS_URL).then(r => r.json()),
    ]).then(([kits, materials]) => {
        KITS = kits;
        MATERIALS = materials;
        const byCat = {};
        const order = [];
        kits.forEach(k => {
            const cat = k.category || 'Uncategorized';
            if (!byCat[cat]) { byCat[cat] = []; order.push(cat); }
            byCat[cat].push(k);
        });
        CATEGORIES = order.map(name => ({ name, kits: byCat[name] }));
    });
    return loadPromise;
}

function getKit(id) { return KITS && KITS.find(k => k.id === id); }
function toolsForKit(id) {
    return (MATERIALS || []).filter(m => m.kit_id === id && m.item_type === 'tool' && !m.deleted_at);
}
function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '🧰'; }
function pricingFor(kit) {
    const day = CATEGORY_DAY_RATE[kit.category] || 35;
    return {
        fourHour: Math.max(15, Math.round(day * 0.45 / 5) * 5),
        day: day,
        week: day * 4,
        month: day * 10,
    };
}
function money(n) { return '$' + Math.round(n); }

// ── State ────────────────────────────────────────────────────────────────
let cartSeq = 0;
const state = {
    tab: 'browse',            // 'browse' | 'cart' | 'info'
    view: 'categories',       // browse sub-view: 'categories' | 'category' | 'kit'
    activeCategory: null,
    activeKitId: null,
    query: '',
    selectedTier: 'day',
    qty: 1,
    addedFlash: false,
    cart: [],                 // { cartId, kitId, kitName, category, tier, tierLabel, unitPrice, qty }
    requestFormOpen: false,
    requestSent: null,        // { name, phone, itemCount, total } | null
};

function cartCount() { return state.cart.reduce((sum, i) => sum + i.qty, 0); }
function cartTotal() { return state.cart.reduce((sum, i) => sum + i.unitPrice * i.qty, 0); }

// ── Navigation ───────────────────────────────────────────────────────────
function switchTab(tab) {
    state.tab = tab;
    render();
}

function openCategory(name) {
    state.activeCategory = name;
    state.view = 'category';
    render();
}

function openKit(id) {
    state.activeKitId = id;
    state.selectedTier = 'day';
    state.qty = 1;
    state.view = 'kit';
    render();
}

function search(query) {
    state.query = query;
    render();
}

function selectTier(key) {
    state.selectedTier = key;
    render();
}

function setQty(v) {
    const n = parseInt(v, 10);
    state.qty = (n && n > 0) ? n : 1;
    render();
}

function addToCart(kitId) {
    const kit = getKit(kitId);
    if (!kit) return;
    const pricing = pricingFor(kit);
    const tier = TIERS.find(t => t.key === state.selectedTier);
    state.cart.push({
        cartId: 'cart-' + (++cartSeq),
        kitId: kit.id,
        kitName: kit.name,
        category: kit.category,
        tier: tier.key,
        tierLabel: tier.label,
        unitPrice: pricing[tier.key],
        qty: state.qty,
    });
    state.qty = 1;
    state.addedFlash = true;
    render();
    setTimeout(() => { state.addedFlash = false; render(); }, 1400);
}

function removeFromCart(cartId) {
    state.cart = state.cart.filter(i => i.cartId !== cartId);
    render();
}

function openRequestForm() {
    state.requestFormOpen = true;
    render();
}

function closeRequestForm() {
    state.requestFormOpen = false;
    render();
}

function handleModalOverlayClick(e) {
    if (e.target.classList.contains('modal-overlay')) closeRequestForm();
}

function submitRequest() {
    const name = (document.getElementById('tr-req-name').value || '').trim();
    const phone = (document.getElementById('tr-req-phone').value || '').trim();
    if (!name || !phone) { alert('Please enter your name and phone number.'); return; }
    state.requestSent = { name, phone, itemCount: cartCount(), total: cartTotal() };
    state.cart = [];
    state.requestFormOpen = false;
    render();
}

function dismissConfirmation() {
    state.requestSent = null;
    state.tab = 'browse';
    state.view = 'categories';
    render();
}

// Back-button contract (see shell.js phoneBack()): return true if handled.
function goBack() {
    if (state.requestFormOpen) { closeRequestForm(); return true; }
    if (state.tab === 'browse') {
        if (state.view === 'kit') { state.view = 'category'; state.activeKitId = null; render(); return true; }
        if (state.view === 'category') { state.view = 'categories'; state.activeCategory = null; render(); return true; }
    }
    return false;
}

// ── Render: Browse tab ───────────────────────────────────────────────────
function kitRowHtml(kit) {
    const pricing = pricingFor(kit);
    return `
        <div class="list-item" onclick="trOpenKit('${kit.id}')">
            <div class="list-item-icon tr-icon-circle">${categoryIcon(kit.category)}</div>
            <div class="list-item-body">
                <div class="list-item-title">${kit.name}</div>
                <div class="list-item-sub">${kit.category}</div>
            </div>
            <div class="list-item-right">
                <div class="list-item-value tr-price-tag">${money(pricing.day)}/day</div>
                <div class="list-item-detail">4hr ${money(pricing.fourHour)}</div>
            </div>
        </div>
    `;
}

function searchResultsHtml() {
    const q = state.query.toLowerCase();
    const results = KITS.filter(k => k.name.toLowerCase().indexOf(q) !== -1);
    return `
        <div class="section-header"><span class="section-title">Search Results</span>
            <span class="kit-row-count">${results.length} found</span></div>
        ${results.length
            ? `<div class="card" style="cursor:default; padding:0 14px;">${results.map(kitRowHtml).join('')}</div>`
            : `<div class="kit-empty">No kits match "${state.query}".</div>`}
    `;
}

function categoriesViewHtml() {
    const featured = FEATURED_IDS.map(getKit).filter(Boolean);
    return `
        ${state.query ? searchResultsHtml() : `
            <div class="section-header"><span class="section-title">Categories</span></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px;">
                ${CATEGORIES.map(cat => `
                    <div class="card" onclick="trOpenCategory('${cat.name.replace(/'/g, "\\'")}')">
                        <div class="card-icon-circle tr-icon-circle" style="margin-bottom:8px;">${categoryIcon(cat.name)}</div>
                        <div class="card-title">${cat.name}</div>
                        <div class="card-subtitle">${cat.kits.length} kit${cat.kits.length === 1 ? '' : 's'}</div>
                    </div>
                `).join('')}
            </div>
            <div class="section-header"><span class="section-title">Featured Rentals</span></div>
            ${featured.map(kitRowHtml).join('')}
        `}
    `;
}

function categoryViewHtml() {
    const cat = CATEGORIES.find(c => c.name === state.activeCategory);
    if (!cat) return categoriesViewHtml();
    return `
        <div class="section-action tr-back-btn" onclick="goBack()">‹ Back</div>
        <div class="page-header">
            <div class="page-title">${categoryIcon(cat.name)} ${cat.name}</div>
            <div class="page-subtitle">${cat.kits.length} kit${cat.kits.length === 1 ? '' : 's'} available to rent</div>
        </div>
        ${cat.kits.map(kitRowHtml).join('')}
    `;
}

function kitViewHtml() {
    const kit = getKit(state.activeKitId);
    if (!kit) return categoriesViewHtml();
    const tools = toolsForKit(kit.id);
    const pricing = pricingFor(kit);
    return `
        <div class="section-action tr-back-btn" onclick="goBack()">‹ Back</div>
        <div class="page-header">
            <div class="page-logo">${categoryIcon(kit.category)}</div>
            <div class="page-title" style="text-align:center;">${kit.name}</div>
            <div class="page-subtitle" style="text-align:center;">${kit.category}${kit.description ? ' · ' + kit.description : ''}</div>
        </div>
        <div class="section-header"><span class="section-title">What's Included</span></div>
        <div class="card" style="cursor:default; padding:0 14px; margin-bottom:16px;">
            ${tools.length
                ? tools.map(t => `<div class="kit-detail-item">${t.name}</div>`).join('')
                : `<div class="kit-empty">No tool list for this kit yet.</div>`}
        </div>
        <div class="section-header"><span class="section-title">Rental Rate</span></div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
            ${TIERS.map(t => `
                <div class="chip${state.selectedTier === t.key ? ' selected' : ''}" onclick="trSelectTier('${t.key}')">
                    ${t.label} · ${money(pricing[t.key])}
                </div>
            `).join('')}
        </div>
        <div class="form-group">
            <label>Quantity</label>
            <input type="number" min="1" step="1" value="${state.qty}" oninput="trSetQty(this.value)">
        </div>
        ${state.addedFlash ? `<div class="alert" style="background:#f0fdf4; color:#15803d; border-color:#bbf7d0;">✅ Added to cart.</div>` : ''}
        <button class="btn btn-primary" onclick="trAddToCart('${kit.id}')">
            Add to Cart · ${money(pricing[state.selectedTier] * state.qty)}
        </button>
    `;
}

function browseHtml() {
    return `
        <div class="page">
            ${state.view === 'categories' ? `
                <div class="page-header">
                    <div class="page-title">🧰 ToolYard Rentals</div>
                    <div class="page-subtitle">Kits &amp; equipment for your next job.<br>📍 Your City, ST · 📞 (555) 010-0199</div>
                </div>
                <input class="search-bar" type="text" placeholder="Search kits &amp; tools..." value="${state.query}" oninput="trSearch(this.value)">
            ` : ''}
            ${state.view === 'category' ? categoryViewHtml()
              : state.view === 'kit' ? kitViewHtml()
              : categoriesViewHtml()}
        </div>
    `;
}

// ── Render: Cart tab ─────────────────────────────────────────────────────
function cartItemHtml(item) {
    return `
        <div class="list-item">
            <div class="list-item-icon tr-icon-circle">${categoryIcon(item.category)}</div>
            <div class="list-item-body">
                <div class="list-item-title">${item.kitName}</div>
                <div class="list-item-sub">${item.tierLabel} × ${item.qty}</div>
            </div>
            <div class="list-item-right">
                <div class="list-item-value">${money(item.unitPrice * item.qty)}</div>
                <button class="text-link" style="color:#dc2626;" onclick="trRemoveFromCart('${item.cartId}')">Remove</button>
            </div>
        </div>
    `;
}

function requestFormHtml() {
    return `
        <div class="modal-overlay" onclick="trHandleModalOverlayClick(event)">
            <div class="modal-sheet">
                <div class="modal-handle"></div>
                <div class="page-title-sm mb-2">Request This Rental</div>
                <div class="page-subtitle mb-4">${cartCount()} item(s) · ${money(cartTotal())} estimated total</div>
                <div class="form-group"><label>Name</label><input type="text" id="tr-req-name" placeholder="Full name"></div>
                <div class="form-group"><label>Phone</label><input type="tel" id="tr-req-phone" placeholder="(555) 555-5555"></div>
                <div class="form-group"><label>Email</label><input type="email" id="tr-req-email" placeholder="you@email.com"></div>
                <div class="form-group"><label>Job Site Address</label><input type="text" id="tr-req-address" placeholder="Delivery / pickup address"></div>
                <div class="form-group"><label>Notes</label><textarea id="tr-req-notes" placeholder="Start date, special requests..."></textarea></div>
                <button class="btn btn-primary mt-2" onclick="trSubmitRequest()">Submit Request</button>
                <button class="btn btn-secondary" onclick="trCloseRequestForm()">Cancel</button>
            </div>
        </div>
    `;
}

function cartHtml() {
    if (state.requestSent) {
        const r = state.requestSent;
        return `
            <div class="page">
                <div class="page-header">
                    <div class="page-title">Request Sent</div>
                </div>
                <div class="alert" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;">
                    ✅ Thanks, ${r.name} — your request for ${r.itemCount} item(s) (${money(r.total)} est.) has been submitted.
                    We'll call ${r.phone} to confirm pickup or delivery.
                    <br><br><em>Demo — no real rental request is sent anywhere.</em>
                </div>
                <button class="btn btn-secondary" onclick="trDismissConfirmation()">Start a New Rental</button>
            </div>
        `;
    }
    if (!state.cart.length) {
        return `
            <div class="page">
                <div class="page-header">
                    <div class="page-title">Your Cart</div>
                    <div class="page-subtitle">No rentals added yet.</div>
                </div>
                <div class="kit-noselect">
                    <div class="kit-noselect-title">Cart is empty</div>
                    <div class="kit-noselect-sub">Browse kits and tap "Add to Cart" to start a rental request.</div>
                    <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="trSwitchTab('browse')">Browse Kits</button>
                </div>
            </div>
        `;
    }
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Your Cart</div>
                <div class="page-subtitle">${cartCount()} item(s)</div>
            </div>
            ${state.cart.map(cartItemHtml).join('')}
            <div class="card" style="margin-top:14px; cursor:default;">
                <div class="card-row">
                    <div class="card-body"><div class="card-title">Estimated Total</div></div>
                    <div class="card-title tr-price-tag">${money(cartTotal())}</div>
                </div>
            </div>
            <button class="btn btn-primary" style="margin-top:14px;" onclick="trOpenRequestForm()">Request This Rental</button>
        </div>
        ${state.requestFormOpen ? requestFormHtml() : ''}
    `;
}

// ── Render: Info tab ─────────────────────────────────────────────────────
function infoHtml() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-logo">🧰</div>
                <div class="page-title" style="text-align:center;">ToolYard Rentals</div>
                <div class="page-subtitle" style="text-align:center;">Quality kits &amp; equipment, ready when you are.</div>
            </div>

            <div class="section-header"><span class="section-title">Contact &amp; Location</span></div>
            <div class="card" style="cursor:default;">
                <div class="card-title">📍 123 Contractor Way, Your City, ST 00000</div>
                <div class="card-subtitle mt-2">📞 <a href="tel:+15550100199" style="color:inherit; text-decoration:none;">(555) 010-0199</a></div>
            </div>

            <div class="section-header mt-4"><span class="section-title">Hours</span></div>
            <div class="card" style="cursor:default;">
                ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => `
                    <div class="schedule-slot" style="border-left-color:#86efac;">
                        <div class="slot-title">${d}</div>
                        <div class="slot-time">7:00 AM – 5:00 PM</div>
                    </div>
                `).join('')}
                <div class="schedule-slot" style="border-left-color:#e2e8f0;">
                    <div class="slot-title">Sunday</div>
                    <div class="slot-time">Closed</div>
                </div>
            </div>

            <div class="section-header mt-4"><span class="section-title">Rental Policies</span></div>
            <div class="card" style="cursor:default; padding:0 14px;">
                <div class="kit-detail-item">Damage waiver available at checkout</div>
                <div class="kit-detail-item">Late returns billed at the next rate tier</div>
                <div class="kit-detail-item">Delivery &amp; pickup available for a fee</div>
                <div class="kit-detail-item">Fuel / cleaning fee applies if returned dirty</div>
            </div>

            <div class="section-header mt-4"><span class="section-title">FAQ</span></div>
            <div class="card" style="cursor:default;">
                <div class="card-title">Do I need a deposit?</div>
                <div class="card-subtitle">A credit card hold is required at pickup for most equipment.</div>
            </div>
            <div class="card" style="cursor:default;">
                <div class="card-title">Can I extend my rental?</div>
                <div class="card-subtitle">Call us before your due time — extensions are billed at the standard rate.</div>
            </div>
            <div class="card" style="cursor:default;">
                <div class="card-title">What if equipment breaks down?</div>
                <div class="card-subtitle">Call our shop line — we'll swap it out or send a tech, no charge for mechanical failure.</div>
            </div>

            <div class="text-center mt-6" style="color:#94a3b8; font-size:0.75rem;">
                Follow us — Facebook · Instagram · Twitter
            </div>
        </div>
    `;
}

// ── Render dispatch ──────────────────────────────────────────────────────
function loadingHtml() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-logo">🧰</div>
                <div class="page-title" style="text-align:center;">ToolYard Rentals</div>
                <div class="page-subtitle" style="text-align:center;">Loading catalog…</div>
            </div>
        </div>
    `;
}

function ensureTheme() {
    if (document.getElementById('tr-theme')) return;
    const style = document.createElement('style');
    style.id = 'tr-theme';
    style.textContent = `
        #tr-root .btn-primary { background:#15803d; }
        #tr-root .btn-primary:hover { background:#166534; }
        #tr-root .nav-tab.active { color:#15803d; }
        #tr-root .chip.selected { background:#dcfce7; color:#15803d; border-color:#86efac; }
        #tr-root .card:hover { border-color:#86efac; box-shadow:0 4px 16px rgba(21,128,61,0.12); }
        #tr-root .card-selected { border-color:#15803d; background:#f0fdf4; }
        #tr-root .section-action, #tr-root .text-link { color:#15803d; }
        #tr-root .search-bar:focus { border-color:#15803d; }
        #tr-root .form-group input:focus, #tr-root .form-group select:focus, #tr-root .form-group textarea:focus {
            border-color:#15803d; box-shadow:0 0 0 3px rgba(21,128,61,0.1);
        }
        #tr-root .tr-icon-circle { background:#dcfce7; color:#15803d; }
        #tr-root .tr-price-tag { color:#15803d; }
        #tr-root .tr-back-btn { display:inline-block; margin-bottom:12px; cursor:pointer; }
    `;
    document.head.appendChild(style);
}

function render() {
    if (!CATEGORIES) {
        document.getElementById('main').innerHTML = `<div id="tr-root">${loadingHtml()}</div>`;
        ensureTheme();
        return;
    }
    const main = document.getElementById('main');
    const body = state.tab === 'cart' ? cartHtml()
        : state.tab === 'info' ? infoHtml()
        : browseHtml();
    main.innerHTML = `<div id="tr-root">${body}</div>`;
    ensureTheme();
    main.scrollTop = 0;
    updateBottomNav();
}

function updateBottomNav() {
    const tabs = [
        { key: 'browse', icon: '🧰', label: 'Browse' },
        { key: 'cart', icon: '🛒', label: 'Cart' + (cartCount() ? ` (${cartCount()})` : '') },
        { key: 'info', icon: 'ℹ️', label: 'Info' },
    ];
    document.getElementById('bottom-nav').innerHTML = tabs.map(t => `
        <button class="nav-tab ${state.tab === t.key ? 'active' : ''}" onclick="trSwitchTab('${t.key}')">
            <span class="nav-tab-icon">${t.icon}</span>${t.label}
        </button>
    `).join('');
}

// ── App Registration ────────────────────────────────────────────────────────
function activate() {
    Object.assign(window, {
        trSwitchTab: switchTab,
        trOpenCategory: openCategory,
        trOpenKit: openKit,
        trSearch: search,
        trSelectTier: selectTier,
        trSetQty: setQty,
        trAddToCart: addToCart,
        trRemoveFromCart: removeFromCart,
        trOpenRequestForm: openRequestForm,
        trCloseRequestForm: closeRequestForm,
        trHandleModalOverlayClick: handleModalOverlayClick,
        trSubmitRequest: submitRequest,
        trDismissConfirmation: dismissConfirmation,
        goBack: goBack,
    });
}

window.Apps = window.Apps || {};
window.Apps['tool-rentals'] = {
    activate: activate,
    start: function () {
        render();
        if (!CATEGORIES) loadCatalog().then(render);
    },
};
})();
