// ── Kinetic Flow App ─────────────────────────────────────────────────────────
// All Kinetic-Flow-specific state, navigation, and page logic. Loaded and
// launched by the OS shell (../../shell.js) via window.Apps['kinetic-flow'].
//
// Wrapped in an IIFE so this app's internal state/helpers never collide with
// another app's globals — every other installed app's script.js shares this
// same page, so top-level `const`/`let` here would otherwise clash with
// same-named ones elsewhere. The page fragments' onclick="..." handlers still
// need these functions as plain globals, so activate() copies just the public
// entry points onto window — and the shell re-calls activate() every time
// this app becomes the visible one, so whichever app is on screen "owns"
// those globals, regardless of load order.
(function () {
const PAGES_DIR = 'apps/kinetic-flow/pages/';
const DB_DIR = 'apps/kinetic-flow/db/';
const STORAGE_KEY = 'kineticFlow.state';
// Bump whenever db/*.json seed data or table shapes change: restoreState()
// discards localStorage DB snapshots from older versions and re-fetches the
// fresh seeds, so users don't need a manual "Reset Demo Data".
const DB_VERSION = 3;

// ── App State ──────────────────────────────────────────────────────────────
const state = {
    accountType: 'existing',  // 'existing' | 'new'
    role: 'worker',           // 'worker' | 'customer' | 'supplier'
    signedIn: false,
    currentPage: '',
    currentJobId: null,
    clockInTask: null,        // { taskModuleId, name, level, isHighHazard, ppeVerified, cosignedBy, cosignedAt } — level: student|exposure|competent|mastery
    scorecardWorkerId: null,  // users.id of the worker whose scorecard is being filled out (set by openScorecard())
    scorecardReturnTo: null,  // page slug to return to after submitScorecard() (set when the timesheet gate redirects here)
    // Real-identity fields populated by afterSignIn() once auth is backed by
    // the mock DB (see DB module below).
    currentUserId: null,
    currentUser: null,        // { id, name, email, globalLevel }
    currentCompanyId: null,
    currentBranchId: null,
    // Bid flow (Phase 2) — real DB-backed ids, replacing the old in-memory
    // window.bidData blob. currentBidId is the bids row for state.currentJobId
    // (set by openBid()); currentDivisionId is the bid_divisions row being
    // edited on bid-division.html (set by openDivision()).
    currentBidId: null,
    currentDivisionId: null,
    simulateOffsite: false,   // field-clock GPS simulator: true = pretend the phone is ~2 km from the job site
    timesheetNote: null,      // draft "Notes for Supervisor" text from review-time.html, kept across visits until submit
};

// ── Mock DB ──────────────────────────────────────────────────────────────
// Loads every db/*.json "table" into memory once per app lifetime, then
// serves all reads/writes against that in-memory copy for the rest of the
// session. The on-disk JSON files are seed data only — nothing here ever
// writes back to them (there's no server); saveState()/restoreState()
// snapshot the mutated tables into localStorage instead, the same way state
// already is, so a reload resumes without re-fetching or losing any
// inserts/updates made during the session.
const TABLES = [
    'companies', 'branches', 'users', 'roles', 'user_roles', 'customers',
    'addresses', 'jobs', 'bids', 'bid_divisions', 'bid_line_items', 'divisions',
    'materials', 'inventory_kits', 'kit_items', 'kit_tools', 'kit_checkouts',
    'job_assignments', 'task_modules', 'tasks', 'task_materials', 'task_photos',
    'time_entries', 'time_entry_edits', 'schedule_events',
    'message_templates', 'scorecard_entries', 'worker_task_competency',
    'competency_levels', 'levels', 'user_level_history', 'training_modules',
    'training_assignments', 'job_history_library', 'finance_snapshots',
    'expense_entries', 'finance_dashboard_permissions', 'property_records',
    'phase_logs', 'system_state',
];

let _tables = {};
let _dbLoaded = false;
let _nextIdSeq = 1;

function genId() {
    // Not a real uuid — just unique and visibly distinct from seeded uuids.
    return 'local-' + Date.now().toString(36) + '-' + (_nextIdSeq++).toString(36);
}

// User-created names (jobs, companies, kits, customers…) get concatenated
// into innerHTML strings all over the pages — escape them so an apostrophe
// or angle bracket in a name can't break markup or an onclick attribute.
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// For values inside onclick="fn('…')" attributes: the browser HTML-decodes
// the attribute before running it as JS, so esc() alone would still leave a
// bare quote inside the JS string — JS-escape first, then HTML-escape.
function jsArg(s) {
    return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

const DB = {
    isLoaded: function () { return _dbLoaded; },
    load: function () {
        if (_dbLoaded) return Promise.resolve();
        return Promise.all(TABLES.map(function (t) {
            return fetch(DB_DIR + t + '.json').then(function (r) { return r.json(); }).then(function (rows) { _tables[t] = rows; });
        })).then(function () { _dbLoaded = true; });
    },
    get: function (table) { return _tables[table] || []; },
    getById: function (table, id) { return this.get(table).find(function (r) { return r.id === id; }) || null; },
    find: function (table, pred) { return this.get(table).filter(pred); },
    findOne: function (table, pred) { return this.get(table).find(pred) || null; },
    insert: function (table, partial) {
        const now = new Date().toISOString();
        const row = Object.assign({ id: genId(), created_at: now, updated_at: now, deleted_at: null, sync_status: 'local' }, partial);
        this.get(table).push(row);
        saveStateSoon();
        return row;
    },
    update: function (table, id, patch) {
        const row = this.getById(table, id);
        if (!row) return null;
        Object.assign(row, patch, { updated_at: new Date().toISOString(), sync_status: 'local' });
        saveStateSoon();
        return row;
    },
    softDelete: function (table, id) { return this.update(table, id, { deleted_at: new Date().toISOString() }); },
    // Escape hatch for "Reset Demo Data" (more.html) — drops all in-memory
    // mutations and the localStorage snapshot, then re-fetches pristine seed data.
    reset: function () {
        _tables = {};
        _dbLoaded = false;
        localStorage.removeItem(STORAGE_KEY);
        return this.load();
    },
};

function resetDemoData() {
    if (!confirm('Reset demo data? Every change you\'ve made — jobs, bids, time entries, everything — will be discarded and the original seed data reloaded.')) return;
    // DB.reset() alone isn't enough: session fields (currentUserId, signedIn,
    // etc.) would still point at pre-reset data, and the beforeunload
    // listener's saveState() fires during location.reload() and would
    // re-persist that stale session on top of the freshly-cleared
    // localStorage. So explicitly clear session state and save the clean
    // snapshot *before* reloading, making the beforeunload save a no-op repeat
    // of the same clean state rather than a race that undoes the reset.
    DB.reset().then(function () {
        Object.assign(state, {
            signedIn: false, currentPage: '', currentJobId: null,
            clockInTask: null, scorecardWorkerId: null, scorecardReturnTo: null,
            currentUserId: null, currentUser: null, currentCompanyId: null, currentBranchId: null,
            currentBidId: null, currentDivisionId: null, simulateOffsite: false, timesheetNote: null,
        });
        clockedIn = false;
        clockStartedAt = null;
        elapsedSeconds = 0;
        currentTimeEntryId = null;
        currentPhaseLogId = null;
        saveState();
        location.reload();
    });
}

// ── Bottom Nav Definitions ──────────────────────────────────────────────────
// Simple stroke icons (inherit the tab's color via currentColor, so the
// active-tab blue applies automatically).
function navSvg(inner) {
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
}
const NAV_ICONS = {
    home:     navSvg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    calendar: navSvg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>'),
    clock:    navSvg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    box:      navSvg('<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'),
    more:     navSvg('<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>'),
    file:     navSvg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
    dollar:   navSvg('<path d="M12 2v20"/><path d="M17 6.5c-1-1.5-2.7-2-5-2-2.8 0-4.5 1.3-4.5 3.2 0 4.6 9.8 2.3 9.8 7 0 2-1.8 3.3-5 3.3-2.5 0-4.3-.8-5.3-2.3"/>'),
    chart:    navSvg('<path d="M6 20v-8M12 20V4M18 20v-6"/>'),
    archive:  navSvg('<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>'),
};

const workerNav = [
    { icon: NAV_ICONS.home,     label: 'Home',     page: 'jobs' },
    { icon: NAV_ICONS.calendar, label: 'Schedule', page: 'schedule' },
    { icon: NAV_ICONS.clock,    label: 'Field',    page: 'field-clock' },
    { icon: NAV_ICONS.box,      label: 'Kits',     page: 'kits' },
    { icon: NAV_ICONS.more,     label: 'More',     page: 'more' },
];

const customerNav = [
    { icon: NAV_ICONS.home,     label: 'Home',     page: 'customer-home' },
    { icon: NAV_ICONS.file,     label: 'Bid',      page: 'customer-bid' },
    { icon: NAV_ICONS.dollar,   label: 'Invoice',  page: 'customer-invoice' },
    { icon: NAV_ICONS.calendar, label: 'Schedule', page: 'schedule' },
];

const supplierNav = [
    { icon: NAV_ICONS.archive,  label: 'Inventory', page: 'inventory' },
    { icon: NAV_ICONS.box,      label: 'Kits',      page: 'kits' },
    { icon: NAV_ICONS.chart,    label: 'Stats',     page: 'stats' },
    { icon: NAV_ICONS.dollar,   label: 'Finance',   page: 'finance' },
];

// Pages that show the bottom nav
const mainAppPages = [
    'schedule', 'field-clock', 'kits', 'label-generator', 'more', 'message-templates',
    'inventory', 'stats', 'finance', 'customer-home', 'customer-bid', 'customer-invoice', 'scoreboard',
    'job-home', 'job-detail', 'job-detail-nobid', 'create-job',
];

// ── Core Navigation ─────────────────────────────────────────────────────────
// Back-stack of page names, so the OS chrome's generic Back button (see
// ../../shell.js phoneBack()) can retrace whatever path the user actually
// took through this app, not just jump to a fixed page. isNavigatingBack
// suppresses the push that loadPage() would otherwise do when goBack()
// itself calls loadPage(), which would otherwise re-add the page you're
// leaving right back onto the stack.
let pageHistory = [];
let isNavigatingBack = false;

const PAGE_ANIM_CLASSES = ['page-exit-forward', 'page-exit-back', 'page-enter-forward', 'page-enter-back'];

function loadPage(name) {
    const wasBack = isNavigatingBack;
    if (!isNavigatingBack && state.currentPage && state.currentPage !== name) {
        pageHistory.push(state.currentPage);
    }
    isNavigatingBack = false;

    // Animate only real page-to-page moves, not the first render — and slide
    // the opposite way on Back so entering vs. leaving reads differently.
    const animate = !!(state.currentPage && state.currentPage !== name);

    state.currentPage = name;
    saveState();

    const main = document.getElementById('main');
    main.classList.remove(...PAGE_ANIM_CLASSES);
    let exitDone = Promise.resolve();
    if (animate) {
        void main.offsetWidth; // restart the animation even on rapid navs
        main.classList.add(wasBack ? 'page-exit-back' : 'page-exit-forward');
        exitDone = new Promise(function (resolve) { setTimeout(resolve, 150); });
    }

    const fetched = fetch(PAGES_DIR + name + '.html')
        .then(r => {
            if (!r.ok) throw new Error('Page not found: ' + name);
            return r.text();
        });

    Promise.all([fetched, exitDone])
        .then(([html]) => {
            main.classList.remove(...PAGE_ANIM_CLASSES);
            main.innerHTML = html;
            main.scrollTop = 0;
            if (animate) {
                void main.offsetWidth;
                main.classList.add(wasBack ? 'page-enter-back' : 'page-enter-forward');
                setTimeout(function () { main.classList.remove(...PAGE_ANIM_CLASSES); }, 300);
            }
            // innerHTML does not execute <script> tags — re-run them manually
            Array.from(main.querySelectorAll('script')).forEach(function(oldScript) {
                const newScript = document.createElement('script');
                newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript);
                document.body.removeChild(newScript);
            });
            updateBottomNav();
            if (name === 'field-clock') syncClockUI();
        })
        .catch(err => {
            main.classList.remove(...PAGE_ANIM_CLASSES);
            main.innerHTML =
                `<div class="page"><div class="alert">Page "${name}" not found.</div>` +
                `<button class="btn btn-secondary" onclick="goBack()">&#8592; Back</button></div>`;
        });
}

function updateBottomNav() {
    const nav = document.getElementById('bottom-nav');
    const showNav = mainAppPages.includes(state.currentPage);
    if (!showNav) { nav.innerHTML = ''; return; }

    const tabs = state.role === 'worker' ? workerNav
               : state.role === 'customer' ? customerNav
               : supplierNav;

    const jobPages = ['job-home', 'job-detail', 'job-detail-nobid', 'bid', 'bid-division', 'bid-proposal', 'create-job'];
    nav.innerHTML = tabs.map(t => {
        const isActive = state.currentPage === t.page
            || (t.page === 'jobs' && jobPages.includes(state.currentPage))
            || (t.page === 'kits' && state.currentPage === 'label-generator');
        return `<button class="nav-tab ${isActive ? 'active' : ''}"
            onclick="navTo('${t.page}')">
            <span class="nav-tab-icon">${t.icon}</span>${t.label}
        </button>`;
    }).join('');
}

function navTo(page) {
    if (page === 'jobs') {
        // Sticky job context (deliberate — see job-home's chip): first tap of
        // Home lands on the current job; tapping Home again while already
        // there pops up to the jobs list, standard tap-active-tab-for-root
        // behavior. Browsing the list never clears currentJobId — only
        // opening a different job changes it.
        if (state.currentJobId && state.currentPage !== 'job-home') { loadPage('job-home'); return; }
        loadPage('jobs');
        return;
    }
    if (page === 'more') { loadPage('more'); return; }
    loadPage(page);
}

// Returns true if it navigated somewhere, false if the stack was empty (so
// the shell's phoneBack() knows to close the app back to the OS home screen
// instead of leaving Back a no-op).
function goBack() {
    if (pageHistory.length === 0) return false;
    const prev = pageHistory.pop();
    isNavigatingBack = true;
    loadPage(prev);
    return true;
}

// ── Header Controls ─────────────────────────────────────────────────────────
function setAccountType(type) {
    state.accountType = type;
    document.getElementById('btn-existing').classList.toggle('active', type === 'existing');
    document.getElementById('btn-new').classList.toggle('active', type === 'new');
    launchApp('kinetic-flow');
    loadPage('sign-in');
}

function setRole(role) {
    state.role = role;
    document.getElementById('btn-worker').classList.toggle('active', role === 'worker');
    document.getElementById('btn-customer').classList.toggle('active', role === 'customer');
    document.getElementById('btn-supplier').classList.toggle('active', role === 'supplier');
    saveState();
    bootPhone();
}

// ── Header Test Tools ───────────────────────────────────────────────────────
// "Sign in as…" dropdown: lists every seeded account (same source as the
// sign-in page's email picker) and switches the session to the chosen one
// instantly — no sign-out → sign-in round trip when checking a screen from a
// different permission level.
function populateHeaderAccountSwitch() {
    const sel = document.getElementById('header-account-switch');
    if (!sel) return;
    ensureDbReady().then(function () {
        const users = DB.find('users', function (u) { return !u.deleted_at; });
        sel.innerHTML = '<option value="">Sign in as&hellip;</option>' + users.map(function (u) {
            const position = accountPositionLabel(u);
            return '<option value="' + esc(u.email) + '">'
                + esc(u.full_name) + (position ? ' — ' + position : '')
                + '</option>';
        }).join('');
    });
}

function headerSwitchAccount(email) {
    const sel = document.getElementById('header-account-switch');
    if (sel) sel.selectedIndex = 0; // snap back to the "Sign in as…" label
    if (!email) return;
    launchApp('kinetic-flow');
    ensureDbReady().then(function () {
        const user = DB.findOne('users', function (u) { return !u.deleted_at && u.email === email; });
        if (!user) return;
        // Customers have no accounts (tokenized link, not a login), so
        // switching to a real account implies the worker flow — sync the
        // header role buttons the same way restoreState() does.
        if (state.role === 'customer') {
            state.role = 'worker';
            const workerBtn = document.getElementById('btn-worker');
            const customerBtn = document.getElementById('btn-customer');
            if (workerBtn) workerBtn.classList.add('active');
            if (customerBtn) customerBtn.classList.remove('active');
        }
        // Fresh session for the new identity: the old account's back-stack
        // and sticky job context would leak its screens otherwise.
        pageHistory = [];
        state.currentJobId = null;
        afterSignIn(user);
    });
}

// ── Auth Flow ───────────────────────────────────────────────────────────────
// Passwordless by design: the password field on sign-in.html is decorative
// only and is never read, checked, or stored anywhere in this file. Signing
// in looks up a real `users` row by email (case-insensitive) so the app
// carries the signed-in user's real identity/company/branch from here on;
// an email that doesn't match any seeded user falls back to a fixed demo
// identity rather than dead-ending the flow.
const DEFAULT_DEMO_EMAIL = 'master@kineticflow.com';

function signIn() {
    if (state.accountType === 'new') {
        showSignUp();
        return;
    }
    const emailInput = document.getElementById('signin-email');
    const typed = ((emailInput && emailInput.value) || '').trim().toLowerCase();
    const user = (typed && DB.findOne('users', function (u) { return !u.deleted_at && u.email.toLowerCase() === typed; }))
        || DB.findOne('users', function (u) { return u.email === DEFAULT_DEMO_EMAIL; });
    // Accounts created through sign-up start as approval_status 'pending' and
    // stay locked out until the platform admin (admin@gmail.com) approves them
    // on admin-approvals. Seeded users have no approval_status — treated as
    // approved.
    if (user && user.approval_status === 'pending') {
        loadPage('account-pending');
        return;
    }
    afterSignIn(user);
}

// The email field doubles as an account picker: focusing it lists every
// existing (non-deleted) user account, and typing narrows the list by name,
// email, or position. Picking one just fills the input — signIn() still does
// the actual lookup.
function accountPositionLabel(user) {
    if (user.is_platform_admin) return 'Platform Admin';
    const parts = [];
    const ur = DB.findOne('user_roles', function (r) { return r.user_id === user.id && r.status === 'active'; });
    const role = ur && DB.getById('roles', ur.role_id);
    if (role) parts.push(role.name);
    if (user.global_level) parts.push(user.global_level.replace(/_/g, ' '));
    return parts.map(function (p) {
        return p.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }).join(' · ');
}

function showAccountSearch() { filterAccountSearch(); }

function hideAccountSearch() {
    // Delay so an item's onmousedown selection lands before the list closes.
    setTimeout(function () {
        const list = document.getElementById('account-search-list');
        if (list) list.classList.remove('open');
    }, 150);
}

function filterAccountSearch() {
    const input = document.getElementById('signin-email');
    const list = document.getElementById('account-search-list');
    if (!input || !list) return;
    const q = input.value.trim().toLowerCase();
    const matches = DB.find('users', function (u) {
        if (u.deleted_at) return false;
        if (!q) return true;
        return u.email.toLowerCase().indexOf(q) !== -1
            || (u.full_name || '').toLowerCase().indexOf(q) !== -1
            || accountPositionLabel(u).toLowerCase().indexOf(q) !== -1;
    });
    list.innerHTML = matches.length ? matches.map(function (u) {
        return `<div class="account-search-item" onmousedown="pickAccount('${jsArg(u.email)}')">
            <div class="account-search-name">${esc(u.full_name)}<span class="account-search-position">${esc(accountPositionLabel(u))}</span></div>
            <div class="account-search-email">${esc(u.email)}</div>
        </div>`;
    }).join('') : '<div class="account-search-empty">No matching accounts</div>';
    list.classList.add('open');
}

function pickAccount(email) {
    const input = document.getElementById('signin-email');
    if (input) input.value = email;
    const list = document.getElementById('account-search-list');
    if (list) list.classList.remove('open');
}

function afterSignIn(user) {
    state.signedIn = true;
    if (user) {
        state.currentUserId = user.id;
        state.currentCompanyId = user.company_id;
        state.currentBranchId = user.branch_id;
        state.currentUser = { id: user.id, name: user.full_name, email: user.email, globalLevel: user.global_level };
    }
    saveState();
    // The platform admin has no company/job context — their whole app is the
    // approval queue for requested accounts.
    if (user && user.is_platform_admin) {
        loadPage('admin-approvals');
        return;
    }
    if (state.role === 'worker') {
        loadPage('companies');
    } else if (state.role === 'customer') {
        loadPage('customer-home');
    } else {
        loadPage('inventory');
    }
}

function signOut() {
    state.signedIn = false;
    pageHistory = [];
    loadPage('sign-in');
}

function showSignUp() {
    fetch(PAGES_DIR + 'sign-up.html')
        .then(r => r.text())
        .then(html => {
            const existing = document.getElementById('signup-modal');
            if (existing) existing.remove();
            const modal = document.createElement('div');
            modal.id = 'signup-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `<div class="modal-sheet"><div class="modal-handle"></div>${html}</div>`;
            modal.addEventListener('click', e => { if (e.target === modal) closeSignUp(); });
            document.getElementById('phone').appendChild(modal);
        });
}

function closeSignUp() {
    const modal = document.getElementById('signup-modal');
    if (modal) modal.remove();
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

const KINETIC_SOLUTIONS_ID = 'company-kineticflow';

function submitAccount() {
    const company = DB.findOne('companies', function (c) {
        return c.name.toLowerCase() === val('signup-company').toLowerCase();
    }) || DB.getById('companies', KINETIC_SOLUTIONS_ID);
    const fullName = [val('signup-first'), val('signup-last')].filter(Boolean).join(' ') || 'New User';
    DB.insert('users', {
        company_id: company.id,
        branch_id: null,
        email: val('signup-email') || ('pending-' + Date.now() + '@example.com'),
        // Absolute requirement: never a real hash, never checked against anything.
        password_hash: '',
        phone: val('signup-phone') || null,
        full_name: fullName,
        avatar_url: null,
        push_token: null,
        global_level: 'apprentice',
        is_active: true,
        // New accounts are requests, not memberships — the platform admin
        // (admin@gmail.com) approves them on admin-approvals before they can
        // sign in. `newUser` is intentionally unused beyond the insert.
        approval_status: 'pending',
    });
    closeSignUp();
    loadPage('account-pending');
}

function goToSignIn() { loadPage('sign-in'); }

// ── Sabbath Lock ─────────────────────────────────────────────────────────────
// Real behavior would be a server-enforced Sunday lockout (see project
// reference doc) — this is a manually-triggered UI preview only, since the
// prototype has no cron/date logic.
function showSabbathLock() {
    if (document.getElementById('sabbath-lock-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'sabbath-lock-overlay';
    overlay.className = 'sabbath-overlay';
    overlay.innerHTML =
        '<div class="sabbath-title">Day of Rest</div>' +
        '<div class="sabbath-sub">Kinetic Flow locks every Sunday, midnight to midnight.<br>Rest well &mdash; see you Monday.</div>' +
        '<button class="btn btn-secondary" style="margin-top:24px; width:auto; padding:10px 24px;" onclick="hideSabbathLock()">Exit Preview</button>';
    document.getElementById('phone').appendChild(overlay);
}

function hideSabbathLock() {
    const overlay = document.getElementById('sabbath-lock-overlay');
    if (overlay) overlay.remove();
}

// ── Company Flow ────────────────────────────────────────────────────────────
function joinCompany() { loadPage('join-company'); }
function createCompany() { loadPage('new-company'); }
function continueFromSetup() { loadPage('jobs'); }

// Real insert path for join-company.html — creates a `pending` user_roles row
// pointing at the selected company's chosen role. The company's owner/admin
// accepts or declines it from the Join Requests section on company-setup.html
// (accept flips status to 'active', which is what membership checks key on).
function submitJoinRequest() {
    const companyId = window.jcSelectedCompanyId && window.jcSelectedCompanyId();
    if (!companyId) { alert('Select a company first.'); return; }
    const roleId = val('jc-role');
    if (!roleId) { alert('Select a position.'); return; }
    const existing = DB.findOne('user_roles', function (ur) {
        if (ur.user_id !== state.currentUserId || ur.deleted_at) return false;
        const role = DB.getById('roles', ur.role_id);
        return role && role.company_id === companyId;
    });
    if (existing) {
        alert(existing.status === 'pending'
            ? 'You already have a pending request with this company.'
            : 'You are already a member of this company.');
        loadPage('companies');
        return;
    }
    DB.insert('user_roles', {
        user_id: state.currentUserId,
        role_id: roleId,
        assigned_at: null,
        requested_at: new Date().toISOString(),
        status: 'pending',
        message: val('jc-message') || null,
    });
    loadPage('companies');
}

// Default position set for a freshly created company — mirrors the seeded
// companies' roles rows (see db/roles.json), which use the same three-name
// vocabulary and permissions shape. company-setup.html renders positions and
// the per-position permission editor straight from these rows.
const DEFAULT_ROLES = [
    { name: 'admin', permissions: { finance: 'nationwide', manage_users: true, manage_bids: true } },
    { name: 'manager', permissions: { finance: 'branch', manage_users: true, manage_bids: true } },
    { name: 'employee', permissions: { finance: 'job', manage_users: false, manage_bids: false } },
];

// Real insert path for new-company.html — creates the companies row plus the
// records every other screen expects a company to have (a primary branch at
// the entered address, the default roles set, and an active admin membership
// for the creator), then lands on company-setup scoped to the new company.
function submitNewCompany() {
    const name = val('nc-name') || 'New Company';
    const company = DB.insert('companies', {
        name: name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        industry: val('nc-industry') || null,
        size: val('nc-size') || null,
        phone: val('nc-phone') || null,
        website: val('nc-website') || null,
    });
    const address = DB.insert('addresses', {
        company_id: company.id,
        street: val('nc-street') || '',
        city: val('nc-city') || '',
        state: val('nc-state') || '',
        zip: '',
        lat: null,
        lng: null,
    });
    const branch = DB.insert('branches', {
        company_id: company.id,
        name: 'Main Office',
        address_id: address.id,
        manager_id: state.currentUserId,
        is_primary: true,
    });
    let adminRoleId = null;
    DEFAULT_ROLES.forEach(function (r) {
        const role = DB.insert('roles', { company_id: company.id, name: r.name, permissions: Object.assign({}, r.permissions) });
        if (r.name === 'admin') adminRoleId = role.id;
    });
    if (state.currentUserId && adminRoleId) {
        DB.insert('user_roles', {
            user_id: state.currentUserId,
            role_id: adminRoleId,
            assigned_at: new Date().toISOString(),
            status: 'active',
        });
    }
    state.currentCompanyId = company.id;
    state.currentBranchId = branch.id;
    loadPage('company-setup');
}

function openBranch(branchId) {
    state.currentBranchId = branchId;
    loadPage('branch-detail');
}

// All users belonging to a company: homed there via users.company_id (the
// seeded companies) or holding one of its roles via user_roles (how members
// are added to locally created companies, whose users keep their original
// company_id). Shared by create-job's team chips, branch-detail's member
// search, and company-setup's member list so they never disagree on who is
// "in" a company.
function companyMemberUsers(companyId) {
    const seen = {};
    const rows = [];
    DB.find('users', function (u) { return u.company_id === companyId && !u.deleted_at; })
        .forEach(function (u) { seen[u.id] = true; rows.push(u); });
    DB.get('user_roles').forEach(function (ur) {
        // Pending rows are join *requests*, not memberships — they only
        // become members once accepted on company-setup's Join Requests.
        if (ur.deleted_at || ur.status === 'pending' || seen[ur.user_id]) return;
        const role = DB.getById('roles', ur.role_id);
        if (!role || role.company_id !== companyId) return;
        const u = DB.getById('users', ur.user_id);
        if (u && !u.deleted_at) { seen[u.id] = true; rows.push(u); }
    });
    return rows;
}

function selectCompany(companyId) {
    state.currentCompanyId = companyId;
    // Re-derive branch context for this company (jobs.html filters by it):
    // the signed-in user's own branch if it belongs here, else no branch
    // scope. A branch left over from another company would filter every job
    // out.
    const user = state.currentUserId ? DB.getById('users', state.currentUserId) : null;
    const userBranch = user && user.branch_id ? DB.getById('branches', user.branch_id) : null;
    state.currentBranchId = (userBranch && userBranch.company_id === companyId) ? userBranch.id : null;
    loadPage('jobs');
}

function manageCompany(companyId) {
    state.currentCompanyId = companyId;
    loadPage('company-setup');
}

// ── Company Configuration: Divisions / Levels / Competency Levels ───────────
// Bid divisions live in the real `divisions` DB table (per company, ordered
// by sort_order) so edits on company-divisions.html persist like everything
// else. DIVISIONS below is only the default template: a company with no rows
// yet (locally created ones) gets it copied in on first access via
// companyDivisions(). Consumers: company-divisions.html (editor),
// company-setup.html (active count), bid.html (new-bid checklist).
// LEVELS (guild career ladder) and COMPETENCY_LEVELS (per-task skill ladder)
// are deliberately FIXED, app-wide constants — the same for every company, so
// a rank means the same thing everywhere and the progression engine's slug
// lookups ('fellow_craft', 'mastery') can never be broken by config edits.
// There is no UI to change them (the old company-levels /
// company-competency-levels pages were removed on purpose).
const DIVISIONS = [
    'Planning / Design', 'Site Prep', 'Temporary Utilities', 'Demolition',
    'Excavation and Trenching', 'Underground Utilities', 'Concrete', 'Framing',
    'Exterior Doors and Windows', 'Rough HVAC', 'Rough Plumbing', 'Rough Electrical',
    'Low Voltage / Data Rough-In', 'Thermal and Moisture Protection', 'Pre-Drywall Sign-Off',
    'Drywall', 'Drywall Dry-Out & Dehumidification', 'HVAC Commissioning', 'Cultured Marble',
    'Finish Carpentry, Millwork — Phase 1', 'Floor Coverings — Phase 1', 'Finish Carpentry — Phase 2',
    'Painting', 'Epoxy Floor Coatings', 'Countertops', 'Finish Electrical', 'Finish HVAC',
    'Finish Low Voltage / Data', 'Finish Plumbing', 'Appliances, Hardware & Wall Specialties',
    'Shower Glass and Mirrors', 'Floor Coverings — Phase 2', 'Final Clean', 'Final Building Inspections',
    'Exterior Hardscape & Irrigation Sleeves', 'Exterior Flatwork', 'Irrigation and Landscaping',
    'Exterior Electrical', 'Exterior Structures', 'Furnishings',
].map(function (name) { return { name: name, isActive: true }; });

// The company's persisted division list, ordered. Lazily seeds the default
// template for companies that have no rows yet, so every company is editable
// from day one and the editor/bid checklist never see an empty config.
function companyDivisions(companyId) {
    function rows() {
        return DB.find('divisions', function (d) { return d.company_id === companyId && !d.deleted_at; })
            .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    }
    let result = rows();
    if (!result.length && companyId) {
        DIVISIONS.forEach(function (d, i) {
            DB.insert('divisions', {
                company_id: companyId, division_number: null,
                name: d.name, sort_order: i, is_active: true,
            });
        });
        result = rows();
    }
    return result;
}

const LEVELS = [
    { slug: 'apprentice', name: 'Entered Apprentice', promotionType: 'manual', criteria: null },
    { slug: 'fellow_craft', name: 'Fellow Craft', promotionType: 'auto', criteria: { trailingDays: 30, scorecardPct: 100 } },
    { slug: 'master', name: 'Master', promotionType: 'manual', criteria: null },
];

const COMPETENCY_LEVELS = [
    { slug: 'student', name: 'Student', requiresCosign: false, autoPromoteDays: null },
    { slug: 'exposure', name: 'Exposure', requiresCosign: false, autoPromoteDays: null },
    { slug: 'competent', name: 'Competent', requiresCosign: true, autoPromoteDays: null },
    { slug: 'mastery', name: 'Mastery', requiresCosign: false, autoPromoteDays: null },
];

function openCompanyDivisions() { loadPage('company-divisions'); }

// ── Jobs Flow ───────────────────────────────────────────────────────────────
function openJob(jobId) {
    state.currentJobId = jobId;
    const job = DB.getById('jobs', jobId);
    loadPage(job && job.bid_id === null ? 'job-detail-nobid' : 'job-detail');
}

function createJob() { loadPage('create-job'); }

// Real form-driven insert — reads create-job.html's fields (see that
// fragment's #cj-* inputs), inserts a jobs row plus one job_assignments row
// per selected/invited team-member chip, then hands off to bid creation or
// straight back to the job list depending on the "create bid now?" choice.
function submitJob() {
    const name = val('cj-name') || 'Untitled Job';
    const customerId = val('cj-customer');
    const customer = customerId ? DB.getById('customers', customerId) : null;
    const jobType = val('cj-type') || 'General';
    const priority = val('cj-priority') || 'normal';
    const notes = val('cj-notes');

    // Job address: typed fields win (inserting a fresh addresses row);
    // otherwise fall back to the selected customer's address. Scheduling
    // dates deliberately don't exist here — they belong to the bid.
    const street = val('cj-street');
    const city = val('cj-city');
    let addressId = customer ? customer.address_id : null;
    if (street || city) {
        const customerAddr = addressId ? DB.getById('addresses', addressId) : null;
        const sameAsCustomer = customerAddr && customerAddr.street === street && customerAddr.city === city;
        if (!sameAsCustomer) {
            addressId = DB.insert('addresses', {
                company_id: state.currentCompanyId,
                street: street, city: city, state: val('cj-state'), zip: '', lat: null, lng: null,
            }).id;
        }
    }

    const job = DB.insert('jobs', {
        company_id: state.currentCompanyId,
        branch_id: state.currentBranchId,
        customer_id: customerId || null,
        address_id: addressId,
        bid_id: null,
        lead_id: state.currentUserId,
        name: name,
        status: 'scheduled',
        job_type: jobType,
        priority: priority,
        scheduled_start: null,
        scheduled_end: null,
        notes: notes || null,
    });

    // Lead gets an explicit job_assignments row too, alongside any invited members.
    if (state.currentUserId) {
        DB.insert('job_assignments', {
            company_id: state.currentCompanyId,
            job_id: job.id,
            user_id: state.currentUserId,
            role_on_job: 'lead',
            assigned_at: new Date().toISOString(),
        });
    }
    document.querySelectorAll('#cj-team .chip.selected').forEach(function (chip) {
        const userId = chip.dataset.userId;
        if (!userId || userId === state.currentUserId) return;
        DB.insert('job_assignments', {
            company_id: state.currentCompanyId,
            job_id: job.id,
            user_id: userId,
            role_on_job: 'member',
            assigned_at: new Date().toISOString(),
        });
    });

    state.currentJobId = job.id;
    const opt = document.getElementById('create-bid-opt');
    if (opt && opt.value === 'now') {
        openBid();
    } else {
        loadPage('jobs');
    }
}

// ── Job Actions ─────────────────────────────────────────────────────────────
// Loads the job's real bid (creating one on first visit) instead of wiping
// and reseeding an in-memory window.bidData blob every time. Once created, a
// job keeps the same bids row (linked via jobs.bid_id) for its whole life —
// reopening "View Bid" always resumes the same draft/sent/signed record.
function openBid() {
    const job = DB.getById('jobs', state.currentJobId);
    let bid = job.bid_id ? DB.getById('bids', job.bid_id) : null;
    if (!bid) {
        bid = DB.insert('bids', {
            company_id: state.currentCompanyId, branch_id: state.currentBranchId,
            customer_id: job.customer_id, address_id: job.address_id,
            title: job.name + ' — Bid', status: 'draft',
            total_labor: 0, total_materials: 0, total_cost: 0,
            created_by: state.currentUserId, sent_at: null, signed_at: null,
            signature_url: null, notes: null,
        });
        DB.update('jobs', job.id, { bid_id: bid.id });
    }
    state.currentBidId = bid.id;
    loadPage('bid');
}
function submitBid() { loadPage('job-detail'); }

// Real send path for bid-proposal.html's "Send to Customer" — the bids table
// already models the draft → sent → signed lifecycle (status/sent_at), so
// sending is just moving the row forward. No actual delivery happens in the
// prototype; the customer pages read the same bids row directly.
function sendBidToCustomer() {
    if (!state.currentBidId) return;
    const bid = DB.getById('bids', state.currentBidId);
    if (!bid) return;
    const resend = bid.status === 'sent' || bid.status === 'signed';
    DB.update('bids', bid.id, {
        status: bid.status === 'signed' ? 'signed' : 'sent',
        sent_at: new Date().toISOString(),
    });
    loadPage('job-detail');
    showToast(resend ? 'Proposal Re-Sent' : 'Proposal Sent',
        ['The customer can now view this bid. (Demo — no real email/text goes out.)'], '#1e40af');
}

// Recomputes a bid's total_labor/total_materials/total_cost from its
// non-deleted bid_divisions rows and writes the rollup back to the bids row.
// Deliberately does NOT bake in the 10% contingency that bid.html/
// bid-proposal.html add on top for the client-facing "Grand Total" —
// total_cost here matches the plain labor+materials convention already used
// by the seeded bids (see db/bids.json: Riverside HVAC's 7000+5400=12400,
// no contingency folded in), since that's the figure job-detail.html and
// jobs.html surface as "Estimated Value". Shared by bid.html (division
// checkbox toggle) and bid-division.html (saveDivision's persist path) — the
// two places that can change a division's labor_cost/material_cost.
function recalcBidTotals(bidId) {
    const divisions = DB.find('bid_divisions', function (d) { return d.bid_id === bidId && !d.deleted_at; });
    let labor = 0, materials = 0;
    divisions.forEach(function (d) {
        labor += d.labor_cost || 0;
        materials += d.material_cost || 0;
    });
    return DB.update('bids', bidId, {
        total_labor: labor,
        total_materials: materials,
        total_cost: labor + materials,
    });
}

// ── Bid Flow ─────────────────────────────────────────────────────────────────
function openDivision(bidDivisionId) {
    state.currentDivisionId = bidDivisionId;
    loadPage('bid-division');
}

// bid-division.html shadows this with its own window.saveDivision (same
// pattern as its window.addTask/window.bidRecalcDiv/etc.) so Save has access
// to that page's in-progress working data. This app.js version is the
// fallback restored by activate() whenever this page isn't the active one.
function saveDivision() {
    loadPage('bid');
}

function previewProposal() {
    loadPage('bid-proposal');
}
function openSchedule() { loadPage('schedule'); }
function openTimeSheet() { loadPage('review-time'); }
function openKits() { loadPage('kits'); }
function openLabelGenerator() { loadPage('label-generator'); }
function openFieldClock() { loadPage('field-clock'); }
function openInventory() { loadPage('inventory'); }

// ── Scorecard ────────────────────────────────────────────────────────────────
// Two-step flow: every worker fills out their own scorecard first (a
// self-assessment, status 'self_submitted'); a manager/admin then opens it
// from the job's team list, adjusts the scores, and finalizes it (status
// 'reviewed'). Guild progression only runs on the manager's final submit.
function isManagerOrAdmin() {
    const user = state.currentUserId ? DB.getById('users', state.currentUserId) : null;
    if (user && user.is_platform_admin) return true;
    return DB.get('user_roles').some(function (ur) {
        if (ur.user_id !== state.currentUserId || ur.deleted_at || ur.status === 'pending') return false;
        const role = DB.getById('roles', ur.role_id);
        return !!role && role.company_id === state.currentCompanyId && (role.name === 'admin' || role.name === 'manager');
    });
}

// Latest self-assessment still awaiting manager review for a worker.
function pendingSelfScorecard(userId) {
    return DB.find('scorecard_entries', function (s) {
        return s.user_id === userId && s.status === 'self_submitted' && !s.deleted_at;
    }).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); })[0] || null;
}

function openScorecard(userId) {
    if (userId !== state.currentUserId && !isManagerOrAdmin()) {
        alert("Only a manager can review another worker's scorecard. Use My Scorecard (More tab) to fill out your own.");
        return;
    }
    state.scorecardWorkerId = userId;
    loadPage('scorecard');
}

function openMyScorecard() {
    openScorecard(state.currentUserId);
}

// Most recent time entry for a worker — the shift a scorecard applies to.
function latestTimeEntryFor(userId) {
    return DB.find('time_entries', function (t) { return t.user_id === userId; })
        .slice()
        .sort(function (a, b) { return new Date(b.clock_in_at) - new Date(a.clock_in_at); })[0] || null;
}

// Production Speed (0–5): actual vs. estimated hours for the shift's tasks.
// Estimated hours come from task_modules.estimated_hours; actual hours from
// the task rows' started_at/ended_at (falling back to the whole entry minus
// unpaid break when no task has a duration). At-or-under estimate scores 5,
// then points fall off proportionally as the overrun grows. Shifts with no
// task/estimate data score 5 rather than 4 — a worker isn't docked because
// the demo data is thin, and it keeps a perfect 100 reachable (the
// fellow_craft auto-promotion gate needs it).
function computeProductionSpeed(userId) {
    const entry = latestTimeEntryFor(userId);
    if (!entry) return 5;
    const shiftTasks = DB.find('tasks', function (t) { return t.time_entry_id === entry.id && t.task_module_id; });

    let estimatedHours = 0;
    shiftTasks.forEach(function (t) {
        const mod = DB.getById('task_modules', t.task_module_id);
        if (mod && mod.estimated_hours) estimatedHours += Number(mod.estimated_hours);
    });
    if (!estimatedHours) return 5;

    let actualHours = 0;
    shiftTasks.forEach(function (t) {
        if (t.started_at && t.ended_at) actualHours += (new Date(t.ended_at) - new Date(t.started_at)) / 3600000;
    });
    if (!actualHours && entry.clock_in_at && entry.clock_out_at) {
        actualHours = (new Date(entry.clock_out_at) - new Date(entry.clock_in_at)) / 3600000
            - (Number(entry.unpaid_break_minutes) || 0) / 60;
    }
    if (actualHours <= 0) return 5;

    return Math.max(0, Math.min(5, Math.round(5 * estimatedHours / actualHours)));
}

// The guild progression engine — runs after every scorecard submit.
// Reference doc workflow: Job Well Done PASS increments compliant_days_count
// on each task logged that shift (one per calendar day); any FAIL resets the
// counter to zero and the worker starts over. A competent worker reaching the
// threshold (30 compliant days within the last 365) auto-promotes to mastery.
// Separately, an apprentice whose trailing-window scorecard average hits the
// fellow_craft criteria auto-promotes globally, recorded in
// user_level_history. Returns human-readable promotion messages for the toast.
function applyScorecardToGuildProgression(scorecard) {
    const promotions = [];
    const pass = scorecard.score_job_well_done > 0;
    const nowIso = new Date().toISOString();

    // 1. Per-task compliant-day counter on every task logged this shift.
    const entry = scorecard.time_entry_id ? DB.getById('time_entries', scorecard.time_entry_id) : null;
    const shiftTasks = entry ? DB.find('tasks', function (t) { return t.time_entry_id === entry.id && t.task_module_id; }) : [];
    const masteryLevel = DB.findOne('competency_levels', function (c) { return c.slug === 'mastery'; });
    const masteryThreshold = (masteryLevel && masteryLevel.auto_promote_days) || 30;

    const seenModules = {};
    shiftTasks.forEach(function (t) {
        if (seenModules[t.task_module_id]) return;
        seenModules[t.task_module_id] = true;

        let wtc = DB.findOne('worker_task_competency', function (r) {
            return r.user_id === scorecard.user_id && r.task_module_id === t.task_module_id;
        });
        if (!wtc) {
            // First time this worker is scored on this task — start them at
            // student, the reference doc's default for every new task.
            wtc = DB.insert('worker_task_competency', {
                company_id: scorecard.company_id, user_id: scorecard.user_id,
                task_module_id: t.task_module_id, competency_level: 'student',
                compliant_days_count: 0, last_compliant_day: null,
                promoted_to_exposure_at: null, promoted_to_competent_at: null,
                promoted_to_mastery_at: null, promoted_by: null,
            });
        }

        if (!pass) {
            DB.update('worker_task_competency', wtc.id, { compliant_days_count: 0 });
            return;
        }
        if (wtc.last_compliant_day === scorecard.shift_date) return; // one compliant day per calendar day

        // "30 compliant days within the last 365" — a stale counter restarts.
        const staleCutoff = new Date(scorecard.shift_date);
        staleCutoff.setDate(staleCutoff.getDate() - 365);
        const stale = wtc.last_compliant_day && new Date(wtc.last_compliant_day) < staleCutoff;
        const newCount = stale ? 1 : (wtc.compliant_days_count || 0) + 1;

        const patch = { compliant_days_count: newCount, last_compliant_day: scorecard.shift_date };
        if (wtc.competency_level === 'competent' && newCount >= masteryThreshold) {
            patch.competency_level = 'mastery';
            patch.promoted_to_mastery_at = nowIso;
            patch.promoted_by = null; // system auto-promotion, not a master's call
            const mod = DB.getById('task_modules', t.task_module_id);
            promotions.push('Mastery earned: ' + (mod ? mod.task_name : 'task') + ' — runs it solo now');
        }
        DB.update('worker_task_competency', wtc.id, patch);
    });

    // 2. Global level: apprentice → fellow_craft on trailing scorecard average.
    const user = DB.getById('users', scorecard.user_id);
    if (user && user.global_level === 'apprentice') {
        const fcLevel = DB.findOne('levels', function (l) { return l.slug === 'fellow_craft' && !l.deleted_at; });
        const crit = (fcLevel && fcLevel.promotion_criteria) || { trailing_days: 30, scorecard_pct: 100 };
        const cutoff = new Date(scorecard.shift_date);
        cutoff.setDate(cutoff.getDate() - (crit.trailing_days || 30));
        const cutoffDay = cutoff.toISOString().slice(0, 10);
        const cards = DB.find('scorecard_entries', function (s) {
            return s.user_id === scorecard.user_id && s.shift_date >= cutoffDay && s.status !== 'self_submitted';
        });
        const avg = cards.reduce(function (sum, s) { return sum + s.total_score; }, 0) / (cards.length || 1);
        if (cards.length && avg >= (crit.scorecard_pct || 100)) {
            DB.update('users', user.id, { global_level: 'fellow_craft' });
            DB.insert('user_level_history', {
                company_id: scorecard.company_id, user_id: user.id,
                from_level: 'apprentice', to_level: 'fellow_craft',
                promoted_by: null, promoted_at: nowIso,
                reason: 'Auto: ' + (crit.trailing_days || 30) + '-day trailing scorecard average ' + Math.round(avg) + '%',
            });
            promotions.push('Promoted to Fellow Craft — ' + (crit.trailing_days || 30) + '-day scorecard average at ' + Math.round(avg) + '%');
        }
    }

    return promotions;
}

// Transient banner appended to body (not the page container) so it survives
// the loadPage() that often follows the event it announces.
function showToast(title, lines, bg) {
    if (!lines.length) return;
    // Stack above any toasts already on screen instead of overlapping them
    // (e.g. a geofence flag and a promotion landing on the same submit).
    let bottom = 90;
    document.querySelectorAll('.kf-toast').forEach(function (el) { bottom += el.offsetHeight + 8; });
    const toast = document.createElement('div');
    toast.className = 'kf-toast';
    toast.style.cssText = 'position:fixed; left:50%; bottom:' + bottom + 'px; transform:translateX(-50%);'
        + 'background:' + (bg || '#166534') + '; color:#fff; padding:12px 18px; border-radius:12px;'
        + 'font-size:0.85rem; line-height:1.4; text-align:center; z-index:2000;'
        + 'box-shadow:0 8px 24px rgba(0,0,0,0.35); max-width:85%;';
    toast.innerHTML = '<strong>' + title + '</strong><br>' + lines.join('<br>');
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 5000);
}

function showPromotionToast(messages) {
    showToast('Guild Promotion', messages, '#166534');
}

// Reads the 10 score inputs straight out of the DOM at submit time (the
// slider/toggle math in scorecard.html's inline script already maintains
// these live — no need to duplicate that logic here) and inserts one real
// scorecard_entries row.
function submitScorecard() {
    function toggleOn(key) {
        const el = document.getElementById('toggle-' + key);
        return !!(el && el.classList.contains('on'));
    }
    function sliderVal(key) {
        const el = document.getElementById('slider-' + key);
        return el ? Number(el.value) : 0;
    }

    const scoreJobWellDone = toggleOn('jwd') ? 55 : 0;
    const scoreMaterialAccountability = toggleOn('materials') ? 5 : 0;
    const scoreToolDiscipline = toggleOn('tools') ? 5 : 0;
    const scoreSiteCleanliness = toggleOn('cleanliness') ? 5 : 0;
    const scoreProductionSpeed = computeProductionSpeed(state.scorecardWorkerId);
    const scoreInitiative = sliderVal('initiative');
    const scoreHabitualSafety = sliderVal('safety');
    const scoreConstructiveHeart = sliderVal('heart');
    const scoreDispositionToLearn = sliderVal('learn');
    const scoreEliteCharacter = sliderVal('elite');

    const totalScore = scoreJobWellDone + scoreMaterialAccountability + scoreToolDiscipline + scoreSiteCleanliness
        + scoreProductionSpeed + scoreInitiative + scoreHabitualSafety + scoreConstructiveHeart
        + scoreDispositionToLearn + scoreEliteCharacter;

    const recentEntry = latestTimeEntryFor(state.scorecardWorkerId);
    const isSelf = state.scorecardWorkerId === state.currentUserId;
    const pendingSelf = isSelf ? null : pendingSelfScorecard(state.scorecardWorkerId);

    const scoreFields = {
        score_job_well_done: scoreJobWellDone,
        score_production_speed: scoreProductionSpeed,
        score_material_accountability: scoreMaterialAccountability,
        score_tool_discipline: scoreToolDiscipline,
        score_site_cleanliness: scoreSiteCleanliness,
        score_initiative: scoreInitiative,
        score_habitual_safety: scoreHabitualSafety,
        score_constructive_heart: scoreConstructiveHeart,
        score_disposition_to_learn: scoreDispositionToLearn,
        score_elite_character: scoreEliteCharacter,
        total_score: totalScore,
    };

    let scorecard;
    if (pendingSelf) {
        // Manager finalizing a worker's self-assessment: overwrite the same
        // row with the manager's scores, keeping the shift it applied to.
        scorecard = DB.update('scorecard_entries', pendingSelf.id, Object.assign({}, scoreFields, {
            status: 'reviewed',
            reviewed_by: state.currentUserId,
            reviewed_at: new Date().toISOString(),
        }));
    } else {
        scorecard = DB.insert('scorecard_entries', Object.assign({
            company_id: state.currentCompanyId,
            user_id: state.scorecardWorkerId,
            time_entry_id: recentEntry ? recentEntry.id : null,
            job_id: state.currentJobId,
            shift_date: new Date().toISOString().slice(0, 10),
            tool_discipline_photo_url: null,
            status: isSelf ? 'self_submitted' : 'reviewed',
            reviewed_by: isSelf ? null : state.currentUserId,
            reviewed_at: isSelf ? null : new Date().toISOString(),
        }, scoreFields));
    }

    // Progression only moves on a manager-reviewed scorecard, never a self one.
    const promotions = isSelf ? [] : applyScorecardToGuildProgression(scorecard);
    if (state.scorecardReturnTo) {
        const returnTo = state.scorecardReturnTo;
        state.scorecardReturnTo = null;
        loadPage(returnTo);
    } else {
        loadPage(isSelf ? 'more' : 'job-detail');
    }
    if (isSelf) {
        showToast('Self-Assessment Submitted', ['Your manager will review and finalize it.'], '#1e40af');
    } else {
        showPromotionToast(promotions);
    }
}

// ── Task Select / Training Gate / Co-Sign ─────────────────────────────────────
// Simulated version of the reference doc's task workflow gates: tapping the
// Task activity button on field-clock pulls up the picker sheet below, then
// the training video plays, then either the task starts recording
// (mastery-unlocked), requires a co-sign (competent), or stays blocked
// (student/exposure). No real video or server verification — this is a
// static nav prototype.
function openTaskSelect() {
    const existing = document.getElementById('task-select-modal');
    if (existing) existing.remove();

    const modules = DB.find('task_modules', function (m) {
        return !m.deleted_at && m.company_id === state.currentCompanyId;
    });

    const cards = modules.map(function (m) {
        const wtc = DB.findOne('worker_task_competency', function (w) {
            return w.user_id === state.currentUserId && w.task_module_id === m.id;
        });
        // No worker_task_competency row for this user+task means they've
        // never been evaluated on it — default to 'student', the safest
        // level (blocks solo work until a master explicitly promotes them),
        // matching the gate chain's existing student/exposure dead-end.
        const level = (wtc && wtc.competency_level) || 'student';
        const levelInfo = COMPETENCY_LEVELS.find(function (c) { return c.slug === level; });
        const levelName = levelInfo ? levelInfo.name : level;

        let subtitle = level === 'mastery' ? 'Runs this task solo'
            : level === 'competent' ? 'Can execute &mdash; co-sign required'
            : level === 'exposure' ? 'Has assisted &amp; observed &mdash; not solo yet'
            : 'Not yet cleared for this task';
        if (m.is_high_hazard) subtitle += ' &bull; high-hazard, PPE required';

        return '<div class="card" onclick="selectClockInTask(\'' + m.id + '\', \'' + level + '\', ' + (m.is_high_hazard ? 'true' : 'false') + ')">' +
            '<div class="card-row">' +
                '<div class="card-body">' +
                    '<div class="card-title">' + esc(m.task_name) + '</div>' +
                    '<div class="card-subtitle">' + subtitle + '</div>' +
                '</div>' +
                '<span class="badge badge-gray">' + levelName + '</span>' +
            '</div>' +
        '</div>';
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'task-select-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
        '<div class="modal-sheet">' +
            '<div class="modal-handle"></div>' +
            '<div class="page-title-sm mb-2">Select Task</div>' +
            '<div class="page-subtitle mb-4">Choose what you\'ll be working on.</div>' +
            (cards || '<div class="alert">No task modules configured for this company.</div>') +
            '<button class="btn btn-secondary mt-4" onclick="closeTaskSelectModal()">Cancel</button>' +
        '</div>';
    modal.addEventListener('click', function (e) { if (e.target === modal) closeTaskSelectModal(); });
    document.getElementById('phone').appendChild(modal);
}

function closeTaskSelectModal() {
    const modal = document.getElementById('task-select-modal');
    if (modal) modal.remove();
}

function selectClockInTask(taskModuleId, level, isHighHazard) {
    closeTaskSelectModal();
    const taskModule = DB.getById('task_modules', taskModuleId);
    state.clockInTask = {
        taskModuleId: taskModuleId,
        name: taskModule ? taskModule.task_name : 'Task',
        level: level,
        isHighHazard: !!isHighHazard,
    };
    loadPage('training-video');
}

// Called once a task is cleared (mastery-unlocked or co-signed) — routes
// through the PPE gate first if the task is flagged high-hazard, otherwise
// back to field-clock, where syncClockUI() sees the cleared task and starts
// recording it.
function proceedPastGates() {
    const task = state.clockInTask || {};
    if (task.isHighHazard) {
        loadPage('ppe-video');
    } else {
        task.cleared = true;
        loadPage('field-clock');
    }
}

// Looks up the training_modules row tied to this task_module (not every
// task_module necessarily has one) and records/updates a training_assignments
// row so there's a real persisted trail of "this user watched this training"
// alongside the phase_logs.video_completion_verified flag set at clock-in.
function recordTrainingCompletion() {
    const task = state.clockInTask || {};
    if (!task.taskModuleId) return;
    const module = DB.findOne('training_modules', function (m) { return m.task_module_id === task.taskModuleId; });
    if (!module) return; // no matching training module — nothing to record
    const now = new Date().toISOString();
    const existing = DB.findOne('training_assignments', function (a) {
        return a.user_id === state.currentUserId && a.module_id === module.id;
    });
    if (existing) {
        DB.update('training_assignments', existing.id, { viewed_at: now });
    } else {
        DB.insert('training_assignments', {
            company_id: state.currentCompanyId,
            user_id: state.currentUserId,
            module_id: module.id,
            job_id: state.currentJobId,
            assigned_at: now,
            send_at: now,
            viewed_at: now,
            ai_triggered: false,
        });
    }
}

function trainingVideoComplete() {
    const task = state.clockInTask || {};
    const levelInfo = window.COMPETENCY_LEVELS.find(function (c) { return c.slug === task.level; });
    const requiresCosign = !!(levelInfo && levelInfo.requiresCosign);
    if (task.level === 'mastery') {
        recordTrainingCompletion();
        proceedPastGates();
    } else if (requiresCosign) {
        showCoSignModal();
    } else {
        const status = document.getElementById('tv-status');
        const btn = document.getElementById('tv-continue-btn');
        if (status) status.textContent = 'Not cleared to perform this task solo yet.';
        if (btn) btn.outerHTML = '<button class="btn btn-secondary" onclick="loadPage(\'field-clock\')">Back to Field Clock</button>';
    }
}

function showCoSignModal() {
    const existing = document.getElementById('cosign-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'cosign-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
        '<div class="modal-sheet">' +
            '<div class="modal-handle"></div>' +
            '<div class="page-title-sm mb-2">Master Co-Sign Required</div>' +
            '<div class="page-subtitle mb-4">This task requires a Master to be clocked into the same job before you can proceed.</div>' +
            '<button class="btn btn-primary" onclick="confirmCoSign()">Confirm Master Co-Sign</button>' +
            '<button class="btn btn-secondary" onclick="closeCoSignModal()">Cancel</button>' +
        '</div>';
    modal.addEventListener('click', function (e) { if (e.target === modal) closeCoSignModal(); });
    document.getElementById('phone').appendChild(modal);
}

function closeCoSignModal() {
    const modal = document.getElementById('cosign-modal');
    if (modal) modal.remove();
}

function confirmCoSign() {
    closeCoSignModal();
    const task = state.clockInTask;
    if (task) {
        // No real second-user session exists in this prototype to be "the
        // master who co-signed" — stand in with the first master assigned to
        // this job (falling back to any master in the company), and stash
        // who/when on state.clockInTask so startClearedTask() can attach it
        // to the phase_logs row it creates back on field-clock.
        const assignedUserIds = DB.find('job_assignments', function (a) { return a.job_id === state.currentJobId; })
            .map(function (a) { return a.user_id; });
        const master = DB.findOne('users', function (u) {
            return u.company_id === state.currentCompanyId && u.global_level === 'master' && assignedUserIds.indexOf(u.id) !== -1;
        }) || DB.findOne('users', function (u) { return u.company_id === state.currentCompanyId && u.global_level === 'master'; });
        if (master) {
            task.cosignedBy = master.id;
            task.cosignedAt = new Date().toISOString();
        }
    }
    recordTrainingCompletion();
    proceedPastGates();
}

// ── PPE Video Gate ──────────────────────────────────────────────────────────
function recordPpeVideo() {
    const status = document.getElementById('ppe-status');
    const recordBtn = document.getElementById('ppe-record-btn');
    const continueBtn = document.getElementById('ppe-continue-btn');
    if (recordBtn) { recordBtn.disabled = true; recordBtn.textContent = 'Recording…'; }
    if (status) status.textContent = 'Recording PPE video…';
    setTimeout(function () {
        if (status) status.textContent = 'PPE video captured and uploaded.';
        if (recordBtn) { recordBtn.disabled = false; recordBtn.textContent = 'Re-record'; }
        if (continueBtn) continueBtn.disabled = false;
    }, 1200);
}

function ppeVideoComplete() {
    // Stash the "PPE was recorded" fact for startClearedTask() to read when
    // it creates this task's phase_logs row back on field-clock.
    if (state.clockInTask) {
        state.clockInTask.ppeVerified = true;
        state.clockInTask.cleared = true;
    }
    loadPage('field-clock');
}

// ── Geofenced Clock-In (simulated GPS) ──────────────────────────────────────
// The reference doc's rule: GPS is captured only at the instant of clock
// in/out — no background tracking. An out-of-radius clock-in still succeeds,
// but the entry's status becomes 'flagged' for manager review instead of a
// hard block. The prototype has no real geolocation, so coordinates are
// simulated (state.simulateOffsite, toggled on field-clock.html) — but the
// distance check itself is real haversine math against the job's address, so
// the flagging mechanism works exactly as it will in production.
const GEOFENCE_RADIUS_M = 150;

function jobSiteCoords(jobId) {
    const job = jobId ? DB.getById('jobs', jobId) : null;
    const addr = job && job.address_id ? DB.getById('addresses', job.address_id) : null;
    return (addr && addr.lat != null && addr.lng != null) ? { lat: addr.lat, lng: addr.lng } : null;
}

function metersBetween(lat1, lng1, lat2, lng2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLng = (lng2 - lng1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Jobs with no address coordinates can't be geofenced — treat as within, with
// null coords, matching a production phone that gets no GPS fix.
function simulatedGpsCapture(jobId) {
    const site = jobSiteCoords(jobId);
    if (!site) return { lat: null, lng: null, distanceM: null, within: true };
    const offsite = state.simulateOffsite === true;
    const lat = site.lat + (offsite ? 0.018 : (Math.random() - 0.5) * 0.0008);
    const lng = site.lng + (offsite ? 0.012 : (Math.random() - 0.5) * 0.0008);
    const distanceM = metersBetween(lat, lng, site.lat, site.lng);
    return { lat: lat, lng: lng, distanceM: distanceM, within: distanceM <= GEOFENCE_RADIUS_M };
}

function formatDistanceM(m) {
    if (m == null) return '';
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
}

function toggleSimulatedGps() {
    state.simulateOffsite = !state.simulateOffsite;
    saveState();
    syncGpsSimUI();
}

function syncGpsSimUI() {
    const btn = document.getElementById('gps-sim-btn');
    const sub = document.getElementById('gps-sim-sub');
    if (!btn) return;
    const off = state.simulateOffsite === true;
    btn.textContent = off ? 'Off-site' : 'On-site';
    btn.style.color = off ? '#b91c1c' : '';
    btn.style.borderColor = off ? '#fca5a5' : '';
    if (sub) sub.textContent = off
        ? 'Simulating ~2 km from the job — clock-in will be flagged'
        : 'Simulating inside the job-site geofence';
}

// ── Field Clock ─────────────────────────────────────────────────────────────
let clockedIn = false;
let timerInterval = null;
let elapsedSeconds = 0;
let clockStartedAt = null; // epoch ms — lets a reload recompute elapsed time from a real timestamp instead of resuming a stale counter
let currentTimeEntryId = null; // the time_entries row id for the in-progress clock session, so clock-out can find it again
let currentPhaseLogId = null;  // the phase_logs row (if any) tied to that session, so clock-out can stamp ended_at on it

function toggleClock() {
    const btn = document.getElementById('clock-btn');
    const status = document.getElementById('clock-status');
    if (!btn) return;

    if (!clockedIn && !state.currentJobId) {
        // A punch with no job would insert job_id: null — "Unknown Job" on
        // the timesheet and no geofence to check. Send them to pick one; the
        // job context then sticks for the rest of the day (see job-home).
        alert('Select a job first so this shift is recorded against it.');
        loadPage('jobs');
        return;
    }

    if (clockedIn) {
        // About to clock OUT — require the pre-clock-out checklist first.
        const gateOk = document.getElementById('gate-materials').checked
            && document.getElementById('gate-kit-photo').checked
            && document.getElementById('gate-cleanliness').checked;
        if (!gateOk) {
            alert('Complete the "Before You Clock Out" checklist before clocking out.');
            return;
        }
    }

    clockedIn = !clockedIn;

    if (clockedIn) {
        btn.textContent = 'Clock Out';
        btn.className = 'btn btn-primary';
        if (status) status.textContent = 'Clocked In';
        elapsedSeconds = 0;
        clockStartedAt = Date.now();
        timerInterval = setInterval(tickTimer, 1000);
        ['gate-materials', 'gate-kit-photo', 'gate-cleanliness'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });

        const clockInAt = new Date(clockStartedAt).toISOString();
        const gps = simulatedGpsCapture(state.currentJobId);
        const timeEntry = DB.insert('time_entries', {
            company_id: state.currentCompanyId,
            user_id: state.currentUserId,
            job_id: state.currentJobId,
            clock_in_at: clockInAt,
            clock_out_at: null,
            clock_in_lat: gps.lat,
            clock_in_lng: gps.lng,
            unpaid_break_minutes: 0,
            auto_clocked_out: false,
            status: gps.within ? 'active' : 'flagged',
        });
        if (!gps.within) {
            showToast('Outside Job-Site Geofence', ['Clock-in accepted, but you’re '
                + formatDistanceM(gps.distanceM) + ' from the site — this entry is flagged for manager review.'], '#b91c1c');
        }
        currentTimeEntryId = timeEntry.id;
        // Phase logs are created per-task now: recording a task (Task button
        // → picker → training/co-sign/PPE gates → startClearedTask()) inserts
        // one against this time entry; a shift with no task recorded has none.
        currentPhaseLogId = null;
    } else {
        btn.textContent = 'Clock In';
        btn.className = 'btn btn-primary';
        if (status) status.textContent = 'Clocked Out';
        clearInterval(timerInterval);
        clockStartedAt = null;

        const clockOutAt = new Date().toISOString();
        if (currentTimeEntryId) {
            // A flag from either end of the shift sticks — only a manager
            // approval on team-time clears it.
            const entry = DB.getById('time_entries', currentTimeEntryId);
            const gpsOut = simulatedGpsCapture(entry ? entry.job_id : state.currentJobId);
            const wasFlagged = (entry && entry.status === 'flagged') || !gpsOut.within;
            DB.update('time_entries', currentTimeEntryId, {
                clock_out_at: clockOutAt,
                clock_out_lat: gpsOut.lat,
                clock_out_lng: gpsOut.lng,
                status: wasFlagged ? 'flagged' : 'pending',
            });
            if (!gpsOut.within && entry && entry.status !== 'flagged') {
                showToast('Outside Job-Site Geofence', ['Clock-out recorded '
                    + formatDistanceM(gpsOut.distanceM) + ' from the site — this entry is flagged for manager review.'], '#b91c1c');
            }
        }
        if (currentPhaseLogId) {
            DB.update('phase_logs', currentPhaseLogId, { ended_at: clockOutAt });
        }
        // A task can't outlive the shift — close out an ongoing recording.
        if (activeActivities['task']) endActivity('task');
        currentTimeEntryId = null;
        currentPhaseLogId = null;
        state.clockInTask = null;
    }
    syncClockoutGate();
    saveState();
}

// The "Before You Clock Out" checklist only applies mid-shift — show it
// (directly above the clock button) while clocked in, hide it otherwise.
function syncClockoutGate() {
    const gate = document.getElementById('clockout-gate');
    if (gate) gate.style.display = clockedIn ? '' : 'none';
    syncClockoutButton();
}

// While clocked in, the Clock Out button is visibly disabled until every
// checklist item is done (QA note) — the alert in toggleClock() stays as a
// backstop. Re-run on every checkbox change (onchange in field-clock.html),
// material-log save, and kit-photo capture.
function syncClockoutButton() {
    const btn = document.getElementById('clock-btn');
    if (!btn) return;
    if (!clockedIn) {
        btn.disabled = false;
        btn.style.opacity = '';
        return;
    }
    const done = ['gate-materials', 'gate-kit-photo', 'gate-cleanliness'].every(function (id) {
        const el = document.getElementById(id);
        return el && el.checked;
    });
    btn.disabled = !done;
    btn.style.opacity = done ? '' : '0.5';
}

function tickTimer() {
    elapsedSeconds++;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const h = Math.floor(elapsedSeconds / 3600);
    const m = Math.floor((elapsedSeconds % 3600) / 60);
    const s = elapsedSeconds % 60;
    const el = document.getElementById('timer');
    if (el) {
        el.textContent =
            String(h).padStart(2, '0') + ':' +
            String(m).padStart(2, '0') + ':' +
            String(s).padStart(2, '0');
    }
}

// field-clock.html's button/status/timer are static markup driven only by
// toggleClock()/tickTimer() — so navigating back to this page (bottom-nav
// "Field" tab, or resuming after a reload) needs this to reflect the current
// clockedIn/elapsedSeconds instead of showing a stale "Clock In" button while
// clockedIn is actually true and the interval is still running.
function syncClockUI() {
    const btn = document.getElementById('clock-btn');
    const status = document.getElementById('clock-status');
    if (!btn) return;
    updateTimerDisplay();
    if (clockedIn) {
        btn.textContent = 'Clock Out';
        if (status) status.textContent = 'Clocked In';
        if (!timerInterval) timerInterval = setInterval(tickTimer, 1000);
    } else {
        btn.textContent = 'Clock In';
        if (status) status.textContent = 'Clocked Out';
    }
    syncClockoutGate();
    syncActivityButtons();
    syncGpsSimUI();
    // The page's activity log is fresh markup — re-add any still-ongoing
    // activity entries (and re-point their DOM refs) so they survive navigation.
    const log = document.getElementById('activity-log');
    if (log) {
        Object.keys(activeActivities).forEach(function (type) {
            const active = activeActivities[type];
            if (log.contains(active.entry)) return;
            const entry = document.createElement('div');
            entry.className = 'list-item';
            entry.innerHTML = `
                <div class="list-item-body">
                    <div class="list-item-title">${esc(active.label) || type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="list-item-sub">${formatClockTime(active.startMs)} &ndash; ongoing</div>
                </div>
                <span class="badge badge-gray">Active</span>`;
            removeActivityEmptyState();
            log.prepend(entry);
            active.entry = entry;
        });
    }
    // Arriving back from the gate chain with a cleared task starts it.
    startClearedTask();
}

// Driving / Lunch / Task are toggles: first tap starts recording (log entry
// shows "ongoing"), second tap stops it and stamps start–end plus the total
// duration. Keyed by type so e.g. Lunch can run while a Task is ongoing.
// Task is special: its first tap opens the task picker sheet instead, and the
// recording only starts once the gate chain clears (see startClearedTask).
const activeActivities = {}; // type -> { startMs, label, entry (DOM node in #activity-log) }

function formatClockTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// field-clock.html renders a "No activity recorded yet" row when today's log
// is empty — drop it the moment anything real lands in the log.
function removeActivityEmptyState() {
    const empty = document.getElementById('activity-empty');
    if (empty) empty.remove();
}

function formatDuration(ms) {
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return totalSec + ' sec';
    const totalMin = Math.round(totalSec / 60);
    if (totalMin < 60) return totalMin + ' min';
    return Math.floor(totalMin / 60) + ' hr ' + (totalMin % 60) + ' min';
}

function addActivity(type) {
    if (activeActivities[type]) {
        endActivity(type);
        return;
    }
    if (type === 'task') {
        // Recording a task runs the competency gate chain (picker → training
        // → co-sign/PPE), and its phase log needs an open time entry.
        if (!clockedIn) { alert('Clock in first to record a task.'); return; }
        openTaskSelect();
        return;
    }
    startActivity(type, type.charAt(0).toUpperCase() + type.slice(1));
}

function startActivity(type, label) {
    const log = document.getElementById('activity-log');
    if (!log) return;
    const startMs = Date.now();
    const entry = document.createElement('div');
    entry.className = 'list-item';
    entry.innerHTML = `
        <div class="list-item-body">
            <div class="list-item-title">${esc(label)}</div>
            <div class="list-item-sub">${formatClockTime(startMs)} &ndash; ongoing</div>
        </div>
        <span class="badge badge-gray">Active</span>`;
    removeActivityEmptyState();
    log.prepend(entry);
    activeActivities[type] = { startMs: startMs, label: label, entry: entry };
    syncActivityButtons();
}

function endActivity(type) {
    const active = activeActivities[type];
    const log = document.getElementById('activity-log');
    if (!active || !log) return;
    const endMs = Date.now();
    // Navigating away rebuilds the page, so the ongoing entry's DOM node
    // may no longer be in the (fresh) log — recreate it in that case.
    let entry = active.entry;
    if (!log.contains(entry)) {
        entry = document.createElement('div');
        entry.className = 'list-item';
        removeActivityEmptyState();
        log.prepend(entry);
    }
    entry.innerHTML = `
        <div class="list-item-body">
            <div class="list-item-title">${esc(active.label)}</div>
            <div class="list-item-sub">${formatClockTime(active.startMs)} &ndash; ${formatClockTime(endMs)} &bull; ${formatDuration(endMs - active.startMs)}</div>
        </div>`;
    // Ending a recorded task also closes its phase log.
    if (type === 'task' && currentPhaseLogId) {
        DB.update('phase_logs', currentPhaseLogId, { ended_at: new Date(endMs).toISOString() });
        currentPhaseLogId = null;
    }
    delete activeActivities[type];
    syncActivityButtons();
}

// A task cleared through the gates (picker → training → co-sign/PPE) lands
// back on field-clock with state.clockInTask.cleared set — syncClockUI()
// calls this to start recording it as the active Task and open its
// phase_logs row against the running time entry.
function startClearedTask() {
    const task = state.clockInTask;
    if (!task || !task.cleared || activeActivities['task']) return;
    state.clockInTask = null;
    startActivity('task', task.name || 'Task');
    if (currentTimeEntryId) {
        const fakeHex = Date.now().toString(16).padStart(16, '0') + (_nextIdSeq++).toString(16).padStart(4, '0');
        const phaseLog = DB.insert('phase_logs', {
            company_id: state.currentCompanyId,
            time_entry_id: currentTimeEntryId,
            user_id: state.currentUserId,
            task_module_id: task.taskModuleId || null,
            job_id: state.currentJobId,
            masons_mark: 'sha256:' + fakeHex,
            competency_at_time_of_log: task.level || null,
            cosigned_by: task.cosignedBy || null,
            cosigned_at: task.cosignedAt || null,
            video_completion_verified: true,
            ppe_video_url: task.ppeVerified ? 'https://r2.kineticflow.app/ppe/local-capture.mp4' : null,
            started_at: new Date().toISOString(),
            ended_at: null,
        });
        currentPhaseLogId = phaseLog.id;
    }
    saveState();
}

// Reflect which activities are recording on the Driving/Lunch/Task buttons —
// called after each toggle and from syncClockUI() when the page re-renders.
function syncActivityButtons() {
    ['driving', 'lunch', 'task'].forEach(function (type) {
        const btn = document.getElementById('act-btn-' + type);
        if (!btn) return;
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        if (activeActivities[type]) {
            btn.textContent = 'End ' + label;
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
        } else {
            btn.textContent = label;
            btn.classList.add('btn-secondary');
            btn.classList.remove('btn-primary');
        }
    });
}

// ── Material Log Modal ───────────────────────────────────────────────────────
// Unlike Driving/Lunch/Task, using a material isn't an event with a duration —
// it's a record of what was consumed. So it opens a picker scoped to kits
// actually checked out for this job (real kit_checkouts rows, resolved to
// inventory_kits for display name and kit_items for the material list) instead
// of starting an ongoing activity.
function getCheckedOutKits() {
    return DB.find('kit_checkouts', function (k) { return k.job_id === state.currentJobId && !k.checked_in_at; })
        .map(function (checkout) {
            const kit = DB.getById('inventory_kits', checkout.kit_id);
            if (!kit) return null;
            const items = DB.find('kit_items', function (ki) { return ki.kit_id === kit.id; });
            return { name: kit.name, materials: items };
        }).filter(Boolean);
}

function openMaterialLog() {
    const existing = document.getElementById('material-modal');
    if (existing) existing.remove();
    const kits = getCheckedOutKits();
    const modal = document.createElement('div');
    modal.id = 'material-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
        '<div class="modal-sheet">' +
            '<div class="modal-handle"></div>' +
            '<div class="page-title-sm mb-2">Log Material Used</div>' +
            '<div class="page-subtitle mb-4">Select from kits checked out for this job and enter how much was used.</div>' +
            (kits.length ? kits.map(function (kit, ki) {
                return '<div class="section-header" style="margin-top:10px;"><span class="section-title">' + esc(kit.name) + '</span></div>' +
                    '<div class="card" style="cursor:default;">' +
                    kit.materials.map(function (mat, mi) {
                        return '<div class="list-item" style="padding:8px 0;">' +
                            '<div class="list-item-body"><div class="list-item-title">' + esc(mat.name) + '</div></div>' +
                            '<input type="number" min="0" step="1" placeholder="0" class="material-qty-input" data-kit="' + ki + '" data-item="' + mi + '" style="width:56px; padding:8px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:0.85rem; text-align:center;">' +
                            '</div>';
                    }).join('') +
                    '</div>';
            }).join('') : '<div class="alert">No kits checked out for this job.</div>') +
            '<button class="btn btn-primary mt-4" onclick="saveMaterialLog()">Log Materials</button>' +
            '<button class="btn btn-secondary" onclick="closeMaterialModal()">Cancel</button>' +
        '</div>';
    modal.addEventListener('click', function (e) { if (e.target === modal) closeMaterialModal(); });
    document.getElementById('phone').appendChild(modal);
}

function closeMaterialModal() {
    const modal = document.getElementById('material-modal');
    if (modal) modal.remove();
}

function saveMaterialLog() {
    const kits = getCheckedOutKits();
    const inputs = document.querySelectorAll('#material-modal .material-qty-input');
    const log = document.getElementById('activity-log');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let loggedAny = false;
    inputs.forEach(function (input) {
        const qty = parseInt(input.value, 10);
        if (!qty || qty <= 0) return;
        loggedAny = true;
        const kit = kits[Number(input.dataset.kit)];
        const material = kit.materials[Number(input.dataset.item)];
        if (log) {
            const entry = document.createElement('div');
            entry.className = 'list-item';
            entry.innerHTML =
                '<div class="list-item-body">' +
                    '<div class="list-item-title">' + qty + '&times; ' + esc(material.name) + '</div>' +
                    '<div class="list-item-sub">' + esc(kit.name) + ' &bull; Logged at ' + time + '</div>' +
                '</div>';
            removeActivityEmptyState();
            log.prepend(entry);
        }
        DB.insert('task_materials', {
            company_id: state.currentCompanyId,
            task_id: null, // no active `tasks` row exists yet for in-progress work — see db/tasks.json note
            material_id: material.material_id || null,
            name: material.name,
            quantity: qty,
            unit: 'each',
            sync_status: 'local',
        });
    });
    if (!loggedAny) {
        alert('Enter a quantity for at least one material.');
        return;
    }
    const gate = document.getElementById('gate-materials');
    if (gate) gate.checked = true;
    syncClockoutButton();
    closeMaterialModal();
}

// ── Time Sheet ──────────────────────────────────────────────────────────────
// A scorecard for today's shift is required before the timesheet can go to
// the supervisor. If none exists yet, send the worker to fill one out and
// have submitScorecard() route back here to finish the submission.
// End-of-day is scorecard-first (QA note): the field-clock button routes
// through the daily self-assessment before the timesheet. If today's
// scorecard is already in, skip straight to the timesheet — submitScorecard()
// returns here via scorecardReturnTo either way.
function openEndOfDay() {
    const today = new Date().toISOString().slice(0, 10);
    const hasScorecard = DB.find('scorecard_entries', function (s) {
        return s.user_id === state.currentUserId && s.shift_date === today && !s.deleted_at;
    }).length > 0;
    if (hasScorecard) {
        loadPage('review-time');
        return;
    }
    state.scorecardReturnTo = 'review-time';
    openScorecard(state.currentUserId);
}

// The "Notes for Supervisor" textarea on review-time.html: Save Draft keeps
// the text in state (restored next visit), Submit stamps it onto the entries
// going to the manager — either way the worker's note is never silently lost.
function saveTimesheetDraft() {
    const notes = val('rt-notes');
    state.timesheetNote = notes || null;
    saveState();
    loadPage('field-clock');
    if (notes) showToast('Draft Saved', ['Your note will be here when you come back.'], '#1e40af');
}

function submitTimeSheet() {
    const today = new Date().toISOString().slice(0, 10);
    const hasScorecard = DB.find('scorecard_entries', function (s) {
        return s.user_id === state.currentUserId && s.shift_date === today;
    }).length > 0;
    if (!hasScorecard) {
        alert("A scorecard for today's shift is required before submitting your timesheet. Please complete it now.");
        // Stash the note so the scorecard detour doesn't wipe the textarea.
        state.timesheetNote = val('rt-notes') || state.timesheetNote || null;
        state.scorecardReturnTo = 'review-time';
        openScorecard(state.currentUserId);
        return;
    }
    // Stamp the worker's un-submitted entries so they show up on their
    // manager's Team Timesheets page (team-time.html) for QuickBooks export.
    const now = new Date().toISOString();
    const workerNote = val('rt-notes') || state.timesheetNote || null;
    DB.find('time_entries', function (t) {
        return t.user_id === state.currentUserId && !t.submitted_at;
    }).forEach(function (t) {
        // A GPS flag survives submission — only manager approval clears it.
        DB.update('time_entries', t.id, {
            status: t.status === 'flagged' ? 'flagged' : 'submitted',
            submitted_at: now,
            worker_note: workerNote,
        });
    });
    state.timesheetNote = null;
    loadPage('scoreboard');
}

// ── Team Timesheets (manager) ────────────────────────────────────────────────
function openTeamTime() { loadPage('team-time'); }

// Workers "under" the signed-in user: members of any branch whose manager_id
// is them. Admins with no branch of their own see the whole company so the
// page isn't a dead end for the admin demo account.
function managedWorkers() {
    const managedBranchIds = DB.find('branches', function (b) {
        return b.manager_id === state.currentUserId && !b.deleted_at;
    }).map(function (b) { return b.id; });
    let workers = companyMemberUsers(state.currentCompanyId).filter(function (u) {
        return u.id !== state.currentUserId && managedBranchIds.indexOf(u.branch_id) !== -1;
    });
    if (!workers.length) {
        const isAdmin = DB.get('user_roles').some(function (ur) {
            if (ur.user_id !== state.currentUserId || ur.deleted_at || ur.status === 'pending') return false;
            const role = DB.getById('roles', ur.role_id);
            return !!role && role.company_id === state.currentCompanyId && (role.name === 'admin' || role.name === 'manager');
        });
        const user = state.currentUserId ? DB.getById('users', state.currentUserId) : null;
        if (isAdmin || (user && user.is_platform_admin)) {
            workers = companyMemberUsers(state.currentCompanyId).filter(function (u) { return u.id !== state.currentUserId; });
        }
    }
    return workers;
}

// Fake QuickBooks export: no network call, just stamp the entries so the
// team-time page moves them from "awaiting export" to "sent".
function submitTeamTimeToQuickBooks(entryIds) {
    const now = new Date().toISOString();
    entryIds.forEach(function (id) {
        DB.update('time_entries', id, { qb_exported_at: now, sync_status: 'quickbooks' });
    });
    alert(entryIds.length + ' time ' + (entryIds.length === 1 ? 'entry' : 'entries') + ' sent to QuickBooks. (Demo — no real QuickBooks connection.)');
    loadPage('team-time');
}

// ── Dashboard pages ──────────────────────────────────────────────────────────
function openScoreboard() { loadPage('scoreboard'); }
function openStats() { loadPage('stats'); }
function openFinance() { loadPage('finance'); }
function openCustomerHome() { loadPage('customer-home'); }

// Customers have no real session — the customer role skips sign-in entirely
// (see start()'s comment below on simulating a tokenized property-record
// link), so state.currentJobId is never populated for them. Anchor all three
// customer-facing pages (customer-home/customer-bid/customer-invoice) to this
// one seeded job so Home/Bid/Invoice describe one consistent property visit
// instead of each page guessing independently.
const CUSTOMER_DEMO_JOB_ID = 'job-riverside-hvac';

// There's no real `invoices` table (confirmed schema gap — out of scope to
// build in this phase), so finance.html's "Outstanding Invoices" tile and
// customer-bid.html/customer-invoice.html's "Schedule of Payments" all derive
// a synthetic 50/20/20/10 deposit/draw/draw/final split from a bid's
// total_cost. Kept as one shared helper so the math isn't copy-pasted three
// times and so all three pages agree on the same numbers for the same bid.
function round2(n) { return Math.round((n || 0) * 100) / 100; }
function computeSyntheticPaymentSchedule(totalCost) {
    const cost = totalCost || 0;
    const deposit = round2(cost * 0.5);
    const draw1 = round2(cost * 0.2);
    const draw2 = round2(cost * 0.2);
    const final = round2(cost - deposit - draw1 - draw2); // remainder absorbs rounding
    return { deposit: deposit, draw1: draw1, draw2: draw2, final: final };
}

// ── More Menu ────────────────────────────────────────────────────────────────
function openMore(page) { loadPage(page); }

// ── Tab Switching (generic) ──────────────────────────────────────────────────
function switchTab(tabId, groupClass) {
    document.querySelectorAll('.' + groupClass).forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('[data-tab]').forEach(el => {
        el.style.display = el.dataset.tab === tabId ? 'block' : 'none';
    });
}

// ── Chips (multi-select toggle) ──────────────────────────────────────────────
function toggleChip(el) {
    el.classList.toggle('selected');
}

// ── Persistence ──────────────────────────────────────────────────────────────
// Snapshots state/clock/db to localStorage so a browser reload can resume the
// app instead of dropping back to sign-in. Saved from loadPage() (covers
// almost every state change, since nearly everything in this app ends by
// navigating), plus explicit call sites that change state without navigating
// (setRole, toggleClock), plus beforeunload as a safety net — DB.insert()/
// DB.update() already call saveState() themselves (see the Mock DB module
// above), which is what bid.html/bid-division.html's inline oninput/onchange
// handlers go through now (Phase 2) instead of mutating a bare in-memory
// window.bidData object.
// DB.insert()/DB.update() go through this debounced wrapper instead of
// saving directly — a burst of writes (e.g. submitJob's assignment loop, or
// bid-division typing) serializes the whole DB snapshot once, not per row.
// Anything time-critical (navigation, reset, beforeunload) still calls
// saveState() directly, which flushes the pending timer first.
let _saveTimer = null;
function saveStateSoon() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(function () { _saveTimer = null; saveState(); }, 250);
}

function saveState() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            state: state,
            clock: {
                clockedIn: clockedIn,
                startedAt: clockStartedAt,
                timeEntryId: currentTimeEntryId,
                phaseLogId: currentPhaseLogId,
            },
            db: _dbLoaded ? _tables : null,
            dbVersion: DB_VERSION,
        }));
    } catch (e) { /* localStorage unavailable (private mode, quota, etc.) */ }
}

// A snapshot from an older DB_VERSION or from before a schema change may
// be missing newly added tables, rows, or fields — using it would shadow
// the fresh seed data (e.g. all tasks showing Student because the old
// worker_task_competency rows were sparse). Discard it and let DB.load()
// re-fetch fresh seed data instead.
function restoreDbSnapshot(saved) {
    if (saved && saved.db && saved.dbVersion === DB_VERSION && TABLES.every(function (t) { return saved.db[t]; })) {
        _tables = saved.db;
        _dbLoaded = true;
    }
}

function readSavedSnapshot() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        return null;
    }
}

// The header test controls (Sign in as… / populate) can fire before the app
// has ever been opened this session, i.e. before start() has run
// restoreState(). Populate the DB the same way start() would — from the
// localStorage snapshot if a valid one exists, else fresh seeds — without
// touching session state or the clock.
function ensureDbReady() {
    if (DB.isLoaded()) return Promise.resolve();
    restoreDbSnapshot(readSavedSnapshot());
    return DB.isLoaded() ? Promise.resolve() : DB.load();
}

function restoreState() {
    const saved = readSavedSnapshot();
    if (!saved) return;

    if (saved.state) Object.assign(state, saved.state);
    restoreDbSnapshot(saved);

    if (saved.clock && saved.clock.clockedIn) {
        clockedIn = true;
        clockStartedAt = saved.clock.startedAt;
        currentTimeEntryId = saved.clock.timeEntryId || null;
        currentPhaseLogId = saved.clock.phaseLogId || null;
        elapsedSeconds = Math.max(0, Math.floor((Date.now() - clockStartedAt) / 1000));
        // start() re-runs on app resume (see shell.js renderedAppId) — don't
        // stack a second ticker on the one that's already running.
        if (!timerInterval) timerInterval = setInterval(tickTimer, 1000);
    }

    // Header toggle buttons are plain DOM (not re-rendered by loadPage), so
    // sync their active state to the restored accountType/role the same way
    // setAccountType()/setRole() do when the user clicks them directly.
    const existingBtn = document.getElementById('btn-existing');
    const newBtn = document.getElementById('btn-new');
    if (existingBtn) existingBtn.classList.toggle('active', state.accountType === 'existing');
    if (newBtn) newBtn.classList.toggle('active', state.accountType === 'new');
    const workerBtn = document.getElementById('btn-worker');
    const customerBtn = document.getElementById('btn-customer');
    const supplierBtn = document.getElementById('btn-supplier');
    if (workerBtn) workerBtn.classList.toggle('active', state.role === 'worker');
    if (customerBtn) customerBtn.classList.toggle('active', state.role === 'customer');
    if (supplierBtn) supplierBtn.classList.toggle('active', state.role === 'supplier');
}

// The admin account is seeded in db/users.json, but sessions that restored an
// older localStorage DB snapshot (saved before that row existed) would never
// see it — so start() re-asserts it into whatever table copy is live.
const PLATFORM_ADMIN_EMAIL = 'admin@gmail.com';
function ensurePlatformAdmin() {
    const existing = DB.findOne('users', function (u) {
        return (u.email || '').toLowerCase() === PLATFORM_ADMIN_EMAIL;
    });
    if (existing) return;
    DB.insert('users', {
        company_id: null,
        branch_id: null,
        email: PLATFORM_ADMIN_EMAIL,
        password_hash: '',
        phone: null,
        full_name: 'admin',
        avatar_url: null,
        push_token: null,
        global_level: 'master',
        is_active: true,
        is_platform_admin: true,
        approval_status: 'approved',
    });
}

window.addEventListener('beforeunload', saveState);

// ── App Registration ────────────────────────────────────────────────────────
// activate() is called by the shell every time this app becomes the visible
// one — it binds this app's page-facing functions onto window so the
// onclick="..." handlers in this app's fetched HTML fragments resolve to
// *this* app's implementation, not some other installed app's same-named one.
function activate() {
    Object.assign(window, {
        state, DB, resetDemoData, esc, jsArg,
        loadPage, navTo, goBack,
        setAccountType, setRole,
        populateHeaderAccountSwitch, headerSwitchAccount,
        signIn, afterSignIn, signOut, showSignUp, closeSignUp, submitAccount, goToSignIn,
        showAccountSearch, hideAccountSearch, filterAccountSearch, pickAccount, accountPositionLabel,
        showSabbathLock, hideSabbathLock,
        joinCompany, createCompany, submitJoinRequest, submitNewCompany, continueFromSetup, openBranch,
        selectCompany, manageCompany, companyMemberUsers,
        LEVELS, COMPETENCY_LEVELS, companyDivisions,
        openCompanyDivisions,
        openJob, createJob, submitJob,
        openBid, submitBid, recalcBidTotals, sendBidToCustomer,
        openDivision, saveDivision, previewProposal,
        openSchedule, openTimeSheet, openKits, openLabelGenerator, openFieldClock, openInventory,
        openScorecard, openMyScorecard, submitScorecard, isManagerOrAdmin, pendingSelfScorecard,
        computeProductionSpeed,
        openTaskSelect, closeTaskSelectModal, selectClockInTask, trainingVideoComplete, showCoSignModal, closeCoSignModal, confirmCoSign,
        recordPpeVideo, ppeVideoComplete,
        toggleClock, addActivity,
        openMaterialLog, closeMaterialModal, saveMaterialLog,
        submitTimeSheet, saveTimesheetDraft, openEndOfDay, syncClockoutButton,
        openTeamTime, managedWorkers, submitTeamTimeToQuickBooks,
        openScoreboard, openStats, openFinance, openCustomerHome, openMore, showToast,
        switchTab, toggleChip,
        CUSTOMER_DEMO_JOB_ID, computeSyntheticPaymentSchedule,
    });
}

window.Apps = window.Apps || {};
window.Apps['kinetic-flow'] = {
    activate: activate,
    // Workers/suppliers sign in normally. Customers have no accounts (per
    // the reference doc: access is via a tokenized property-record link, not
    // a login) — so the customer role skips sign-in.html and lands straight
    // on their property record, simulating "already opened the QR link."
    // Workers/suppliers who were signed in when the page was last unloaded
    // resume wherever they left off (see restoreState()).
    start: function () {
        pageHistory = [];
        restoreState(); // may already populate the mock DB from localStorage
        // task-select.html no longer exists (the picker is a sheet on
        // field-clock now), and feild-clock.html was renamed to fix the typo
        // — a session saved on either shouldn't resume onto a 404.
        if (state.currentPage === 'task-select' || state.currentPage === 'feild-clock') state.currentPage = 'field-clock';
        // First open fetches 41 db/*.json seeds — show something meanwhile,
        // and surface a fetch failure instead of leaving a silent blank screen.
        const main = document.getElementById('main');
        if (!DB.isLoaded() && main) {
            main.innerHTML = '<div class="page" style="justify-content:center; align-items:center; color:#94a3b8; font-size:0.85rem;">Loading Kinetic Flow&hellip;</div>';
        }
        (DB.isLoaded() ? Promise.resolve() : DB.load()).then(function () {
            ensurePlatformAdmin();
            if (state.role === 'customer') {
                loadPage('customer-home');
            } else if (state.signedIn && state.currentPage) {
                loadPage(state.currentPage);
            } else {
                loadPage('sign-in');
            }
        }).catch(function (err) {
            if (main) main.innerHTML =
                '<div class="page"><div class="alert">Couldn&rsquo;t load app data (' + esc(err && err.message) + '). Check your connection and try again.</div>' +
                '<button class="btn btn-primary" onclick="location.reload()">Retry</button></div>';
        });
    },
    // Closing back to the OS home screen while looking at a job's full detail
    // page downgrades it to the lean job-home page — so reopening the app
    // later resumes on the quick-actions view, not buried in job detail.
    onClose: function () {
        if (state.currentJobId && (state.currentPage === 'job-detail' || state.currentPage === 'job-detail-nobid')) {
            loadPage('job-home');
        }
    },
};
})();
