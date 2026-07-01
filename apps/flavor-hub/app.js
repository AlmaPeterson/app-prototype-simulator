// ── Flavor Hub App ───────────────────────────────────────────────────────────
// Small self-contained food-ordering demo app. Exists to give the home screen
// a second/third icon to arrange in the grid — see apps/kinetic-flow/app.js
// for the fuller reference implementation of the same window.Apps pattern.
(function () {
const menu = [
    { id: 'm1', name: 'Smoky Ramen',      price: 12.5, icon: '🍜', tag: 'Popular' },
    { id: 'm2', name: 'Margherita Pizza',  price: 14.0, icon: '🍕', tag: 'Chef Pick' },
    { id: 'm3', name: 'Garden Salad',      price: 8.0,  icon: '🥗', tag: null },
    { id: 'm4', name: 'Iced Matcha',       price: 5.5,  icon: '🍵', tag: null },
];

const state = {
    tab: 'menu',      // 'menu' | 'cart' | 'profile'
    cart: {},          // id -> qty
};

function cartCount() {
    return Object.values(state.cart).reduce((sum, qty) => sum + qty, 0);
}

function cartTotal() {
    return Object.entries(state.cart).reduce((sum, [id, qty]) => {
        const item = menu.find(m => m.id === id);
        return sum + (item ? item.price * qty : 0);
    }, 0);
}

function addToCart(id) {
    state.cart[id] = (state.cart[id] || 0) + 1;
    render();
}

function removeFromCart(id) {
    if (!state.cart[id]) return;
    state.cart[id] -= 1;
    if (state.cart[id] <= 0) delete state.cart[id];
    render();
}

function switchTab(tab) {
    state.tab = tab;
    render();
}

function renderMenu() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Flavor Hub</div>
                <div class="page-subtitle">Order something good.</div>
            </div>
            ${menu.map(item => `
                <div class="card card-row">
                    <div class="card-icon-circle icon-orange">${item.icon}</div>
                    <div class="card-body">
                        <div class="card-title">${item.name} ${item.tag ? `<span class="badge badge-orange">${item.tag}</span>` : ''}</div>
                        <div class="card-subtitle">$${item.price.toFixed(2)}</div>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="fhAddToCart('${item.id}')">Add</button>
                </div>
            `).join('')}
        </div>
    `;
}

function renderCart() {
    const entries = Object.entries(state.cart);
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Your Cart</div>
                <div class="page-subtitle">${entries.length ? cartCount() + ' item(s)' : 'Cart is empty.'}</div>
            </div>
            ${entries.map(([id, qty]) => {
                const item = menu.find(m => m.id === id);
                return `
                    <div class="list-item">
                        <div class="list-item-icon icon-orange">${item.icon}</div>
                        <div class="list-item-body">
                            <div class="list-item-title">${item.name}</div>
                            <div class="list-item-sub">Qty ${qty}</div>
                        </div>
                        <div class="list-item-right">
                            <div class="list-item-value">$${(item.price * qty).toFixed(2)}</div>
                            <button class="btn btn-secondary btn-sm" onclick="fhRemoveFromCart('${id}')">Remove</button>
                        </div>
                    </div>
                `;
            }).join('')}
            ${entries.length ? `
                <div class="card" style="margin-top:14px;">
                    <div class="card-row">
                        <div class="card-body"><div class="card-title">Total</div></div>
                        <div class="card-title">$${cartTotal().toFixed(2)}</div>
                    </div>
                </div>
                <button class="btn btn-primary" style="margin-top:14px;" onclick="alert('This is a demo — no real orders are placed.')">Checkout</button>
            ` : ''}
        </div>
    `;
}

function renderProfile() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-logo">🍔</div>
                <div class="page-title" style="text-align:center;">Flavor Hub</div>
                <div class="page-subtitle" style="text-align:center;">Demo app for the app grid.</div>
            </div>
            <div class="alert alert-info">This is a placeholder app used to verify the home-screen icon grid.</div>
        </div>
    `;
}

function render() {
    const main = document.getElementById('main');
    main.innerHTML =
        state.tab === 'cart'    ? renderCart()    :
        state.tab === 'profile' ? renderProfile() :
        renderMenu();
    main.scrollTop = 0;
    updateBottomNav();
}

function updateBottomNav() {
    const tabs = [
        { key: 'menu',    icon: '🍽️', label: 'Menu' },
        { key: 'cart',    icon: '🛒', label: 'Cart' + (cartCount() ? ` (${cartCount()})` : '') },
        { key: 'profile', icon: '👤', label: 'About' },
    ];
    document.getElementById('bottom-nav').innerHTML = tabs.map(t => `
        <button class="nav-tab ${state.tab === t.key ? 'active' : ''}" onclick="fhSwitchTab('${t.key}')">
            <span class="nav-tab-icon">${t.icon}</span>${t.label}
        </button>
    `).join('');
}

// ── App Registration ────────────────────────────────────────────────────────
function activate() {
    Object.assign(window, {
        fhAddToCart: addToCart,
        fhRemoveFromCart: removeFromCart,
        fhSwitchTab: switchTab,
    });
}

window.Apps = window.Apps || {};
window.Apps['flavor-hub'] = {
    activate: activate,
    start: function () { render(); },
};
})();
