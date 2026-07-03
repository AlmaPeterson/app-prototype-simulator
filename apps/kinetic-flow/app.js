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

// ── App State ──────────────────────────────────────────────────────────────
const state = {
    accountType: 'existing',  // 'existing' | 'new'
    role: 'worker',           // 'worker' | 'customer' | 'supplier'
    signedIn: false,
    currentPage: '',
    currentJob: null,
    currentJobId: null,
    currentCompany: null,
    currentBranch: null,
    clockInTask: null,        // { taskModuleId, name, level, isHighHazard, ppeVerified, cosignedBy, cosignedAt } — level: student|exposure|competent|mastery
    scorecardWorkerId: null,  // users.id of the worker whose scorecard is being filled out (set by openScorecard())
    // Real-identity fields populated by afterSignIn() once auth is backed by
    // the mock DB (see DB module below) — kept alongside the legacy
    // name-string fields above until each consuming page is migrated to ids.
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
    'time_entries', 'time_entry_edits', 'schedule_events', 'messages',
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
        saveState();
        return row;
    },
    update: function (table, id, patch) {
        const row = this.getById(table, id);
        if (!row) return null;
        Object.assign(row, patch, { updated_at: new Date().toISOString(), sync_status: 'local' });
        saveState();
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
    // DB.reset() alone isn't enough: session fields (currentUserId, signedIn,
    // etc.) would still point at pre-reset data, and the beforeunload
    // listener's saveState() fires during location.reload() and would
    // re-persist that stale session on top of the freshly-cleared
    // localStorage. So explicitly clear session state and save the clean
    // snapshot *before* reloading, making the beforeunload save a no-op repeat
    // of the same clean state rather than a race that undoes the reset.
    DB.reset().then(function () {
        Object.assign(state, {
            signedIn: false, currentPage: '', currentJob: null, currentJobId: null, currentCompany: null,
            currentBranch: null, clockInTask: null, scorecardWorkerId: null,
            currentUserId: null, currentUser: null, currentCompanyId: null, currentBranchId: null,
            currentBidId: null, currentDivisionId: null,
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
const workerNav = [
    { icon: '',   label: 'Home',     page: 'jobs' },
    { icon: '',   label: 'Schedule', page: 'schedule' },
    { icon: '',   label: 'Field',    page: 'feild-clock' },
    { icon: '',   label: 'Kits',     page: 'kits' },
    { icon: '',   label: 'More',     page: 'more' },
];

const customerNav = [
    { icon: '',   label: 'Home',     page: 'customer-home' },
    { icon: '',   label: 'Bid',      page: 'customer-bid' },
    { icon: '',   label: 'Invoice',  page: 'customer-invoice' },
    { icon: '',   label: 'Schedule', page: 'schedule' },
];

const supplierNav = [
    { icon: '',   label: 'Inventory', page: 'inventory' },
    { icon: '',   label: 'Kits',      page: 'kits' },
    { icon: '',   label: 'Stats',     page: 'stats' },
    { icon: '',   label: 'Finance',   page: 'finance' },
];

// Pages that show the bottom nav
const mainAppPages = [
    'schedule', 'feild-clock', 'kits', 'label-generator', 'more', 'messages',
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

function loadPage(name, data) {
    if (!isNavigatingBack && state.currentPage && state.currentPage !== name) {
        pageHistory.push(state.currentPage);
    }
    isNavigatingBack = false;

    if (data) state.currentPage = name;
    state.currentPage = name;
    saveState();

    fetch(PAGES_DIR + name + '.html')
        .then(r => {
            if (!r.ok) throw new Error('Page not found: ' + name);
            return r.text();
        })
        .then(html => {
            const main = document.getElementById('main');
            main.innerHTML = html;
            main.scrollTop = 0;
            // innerHTML does not execute <script> tags — re-run them manually
            Array.from(main.querySelectorAll('script')).forEach(function(oldScript) {
                const newScript = document.createElement('script');
                newScript.textContent = oldScript.textContent;
                document.body.appendChild(newScript);
                document.body.removeChild(newScript);
            });
            updateBottomNav();
            if (name === 'feild-clock') syncClockUI();
        })
        .catch(err => {
            document.getElementById('main').innerHTML =
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
        if (state.currentJobId) { loadPage('job-home'); return; }
        loadPage('jobs');
        return;
    }
    if (page === 'more') { loadPage('more'); return; }
    if (page === 'messages') { loadPage('messages'); return; }
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

// ── Auth Flow ───────────────────────────────────────────────────────────────
// Passwordless by design: the password field on sign-in.html is decorative
// only and is never read, checked, or stored anywhere in this file. Signing
// in looks up a real `users` row by email (case-insensitive) so the app
// carries the signed-in user's real identity/company/branch from here on;
// an email that doesn't match any seeded user falls back to a fixed demo
// identity rather than dead-ending the flow.
const DEFAULT_DEMO_EMAIL = 'j.smith@kineticsolutions.com';

function signIn() {
    if (state.accountType === 'new') {
        showSignUp();
        return;
    }
    const emailInput = document.getElementById('signin-email');
    const typed = ((emailInput && emailInput.value) || '').trim().toLowerCase();
    const user = (typed && DB.findOne('users', function (u) { return !u.deleted_at && u.email.toLowerCase() === typed; }))
        || DB.findOne('users', function (u) { return u.email === DEFAULT_DEMO_EMAIL; });
    afterSignIn(user);
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

const KINETIC_SOLUTIONS_ID = '22e15616-ddab-463d-8c8e-cd89d0fbcf33';

function submitAccount() {
    const company = DB.findOne('companies', function (c) {
        return c.name.toLowerCase() === val('signup-company').toLowerCase();
    }) || DB.getById('companies', KINETIC_SOLUTIONS_ID);
    const fullName = [val('signup-first'), val('signup-last')].filter(Boolean).join(' ') || 'New User';
    const newUser = DB.insert('users', {
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
    });
    closeSignUp();
    afterSignIn(newUser);
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
function submitJoinRequest() { loadPage('companies'); }
function continueFromSetup() { loadPage('jobs'); }

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
// Mirrors db/divisions.json, db/levels.json, db/competency_levels.json.
// Lives here (not in the page) for the same reason DIVISIONS/LEVELS do — app.js
// persists across navigations, but a page fragment's inline <script> re-runs
// every time loadPage() navigates to it, so per-visit-local state would
// forget edits. Managed by company-divisions.html / company-levels.html /
// company-competency-levels.html; read by bid.html to build a new bid's
// division checklist.
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
function openCompanyLevels() { loadPage('company-levels'); }
function openCompanyCompetencyLevels() { loadPage('company-competency-levels'); }

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
function openFieldClock() { loadPage('task-select'); }
function openInventory() { loadPage('inventory'); }

// ── PM Scorecard ─────────────────────────────────────────────────────────────
function openScorecard(userId) {
    state.scorecardWorkerId = userId;
    loadPage('scorecard');
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
    const scoreProductionSpeed = 4; // fixed auto-calc demo value — matches scorecard.html's recalcScorecard()
    const scoreInitiative = sliderVal('initiative');
    const scoreHabitualSafety = sliderVal('safety');
    const scoreConstructiveHeart = sliderVal('heart');
    const scoreDispositionToLearn = sliderVal('learn');
    const scoreEliteCharacter = sliderVal('elite');

    const totalScore = scoreJobWellDone + scoreMaterialAccountability + scoreToolDiscipline + scoreSiteCleanliness
        + scoreProductionSpeed + scoreInitiative + scoreHabitualSafety + scoreConstructiveHeart
        + scoreDispositionToLearn + scoreEliteCharacter;

    const recentEntry = DB.find('time_entries', function (t) { return t.user_id === state.scorecardWorkerId; })
        .slice()
        .sort(function (a, b) { return new Date(b.clock_in_at) - new Date(a.clock_in_at); })[0];

    DB.insert('scorecard_entries', {
        company_id: state.currentCompanyId,
        user_id: state.scorecardWorkerId,
        time_entry_id: recentEntry ? recentEntry.id : null,
        job_id: state.currentJobId,
        shift_date: new Date().toISOString().slice(0, 10),
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
        tool_discipline_photo_url: null,
        reviewed_by: state.currentUserId,
        reviewed_at: new Date().toISOString(),
    });
    loadPage('job-detail');
}

// ── Task Select / Training Gate / Co-Sign ─────────────────────────────────────
// Simulated version of the reference doc's clock-in workflow gates: pick the
// task you're working, watch the (unskippable) training video, then either
// unlock the clock-in (mastery), require a co-sign (competent), or stay
// blocked (student/exposure). No real video or server verification — this is
// a static nav prototype.
function selectClockInTask(taskModuleId, level, isHighHazard) {
    const taskModule = DB.getById('task_modules', taskModuleId);
    state.clockInTask = {
        taskModuleId: taskModuleId,
        name: taskModule ? taskModule.task_name : 'Task',
        level: level,
        isHighHazard: !!isHighHazard,
    };
    loadPage('training-video');
}

// Called once a task is cleared to clock in (mastery-unlocked or co-signed) —
// routes through the PPE gate first if the task is flagged high-hazard.
function proceedPastGates() {
    const task = state.clockInTask || {};
    if (task.isHighHazard) {
        loadPage('ppe-video');
    } else {
        loadPage('feild-clock');
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
        if (btn) btn.outerHTML = '<button class="btn btn-secondary" onclick="loadPage(\'job-home\')">Back to Job</button>';
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
        // who/when on state.clockInTask so toggleClock()'s clock-in path can
        // attach it to the phase_logs row it creates.
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
    // Stash the "PPE was recorded" fact for toggleClock()'s clock-in path to
    // read when it creates this session's phase_logs row — a phase_logs
    // insert can't happen yet since no time_entries row exists until clock-in.
    if (state.clockInTask) state.clockInTask.ppeVerified = true;
    loadPage('feild-clock');
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
        const timeEntry = DB.insert('time_entries', {
            company_id: state.currentCompanyId,
            user_id: state.currentUserId,
            job_id: state.currentJobId,
            clock_in_at: clockInAt,
            clock_out_at: null,
            clock_in_lat: null,
            clock_in_lng: null,
            unpaid_break_minutes: 0,
            auto_clocked_out: false,
            status: 'active',
        });
        currentTimeEntryId = timeEntry.id;
        currentPhaseLogId = null;

        // Only real gate-chain clock-ins (task-select → training-video →
        // [co-sign/PPE] → here) set state.clockInTask — the bottom-nav
        // "Field" tab shortcut clocks in without one, so no phase_logs row
        // is created for that path.
        if (state.clockInTask) {
            const task = state.clockInTask;
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
                started_at: clockInAt,
                ended_at: null,
            });
            currentPhaseLogId = phaseLog.id;
        }
    } else {
        btn.textContent = 'Clock In';
        btn.className = 'btn btn-primary';
        if (status) status.textContent = 'Clocked Out';
        clearInterval(timerInterval);
        clockStartedAt = null;

        const clockOutAt = new Date().toISOString();
        if (currentTimeEntryId) {
            DB.update('time_entries', currentTimeEntryId, { clock_out_at: clockOutAt, status: 'pending' });
        }
        if (currentPhaseLogId) {
            DB.update('phase_logs', currentPhaseLogId, { ended_at: clockOutAt });
        }
        currentTimeEntryId = null;
        currentPhaseLogId = null;
        state.clockInTask = null;
    }
    saveState();
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

// feild-clock.html's button/status/timer are static markup driven only by
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
}

function addActivity(type) {
    const log = document.getElementById('activity-log');
    if (!log) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'list-item';
    entry.innerHTML = `
        <div class="list-item-body">
            <div class="list-item-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="list-item-sub">Started at ${time}</div>
        </div>
        <span class="badge badge-gray">Active</span>`;
    log.prepend(entry);
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
                return '<div class="section-header" style="margin-top:10px;"><span class="section-title">' + kit.name + '</span></div>' +
                    '<div class="card" style="cursor:default;">' +
                    kit.materials.map(function (mat, mi) {
                        return '<div class="list-item" style="padding:8px 0;">' +
                            '<div class="list-item-body"><div class="list-item-title">' + mat.name + '</div></div>' +
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
                    '<div class="list-item-title">' + qty + '&times; ' + material.name + '</div>' +
                    '<div class="list-item-sub">' + kit.name + ' &bull; Logged at ' + time + '</div>' +
                '</div>';
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
    closeMaterialModal();
}

// ── Time Sheet ──────────────────────────────────────────────────────────────
function submitTimeSheet() {
    loadPage('scoreboard');
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
const CUSTOMER_DEMO_JOB_ID = 'c229964f-71e9-4d66-af48-fdb1db4c7404';

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
function saveState() {
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
        }));
    } catch (e) { /* localStorage unavailable (private mode, quota, etc.) */ }
}

function restoreState() {
    let saved;
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        saved = null;
    }
    if (!saved) return;

    if (saved.state) Object.assign(state, saved.state);
    if (saved.db) { _tables = saved.db; _dbLoaded = true; }

    if (saved.clock && saved.clock.clockedIn) {
        clockedIn = true;
        clockStartedAt = saved.clock.startedAt;
        currentTimeEntryId = saved.clock.timeEntryId || null;
        currentPhaseLogId = saved.clock.phaseLogId || null;
        elapsedSeconds = Math.max(0, Math.floor((Date.now() - clockStartedAt) / 1000));
        timerInterval = setInterval(tickTimer, 1000);
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

window.addEventListener('beforeunload', saveState);

// ── App Registration ────────────────────────────────────────────────────────
// activate() is called by the shell every time this app becomes the visible
// one — it binds this app's page-facing functions onto window so the
// onclick="..." handlers in this app's fetched HTML fragments resolve to
// *this* app's implementation, not some other installed app's same-named one.
function activate() {
    Object.assign(window, {
        state, DB, resetDemoData,
        loadPage, navTo, goBack,
        setAccountType, setRole,
        signIn, afterSignIn, signOut, showSignUp, closeSignUp, submitAccount, goToSignIn,
        showSabbathLock, hideSabbathLock,
        joinCompany, createCompany, submitJoinRequest, submitNewCompany, continueFromSetup, openBranch,
        selectCompany, manageCompany,
        DIVISIONS, LEVELS, COMPETENCY_LEVELS,
        openCompanyDivisions, openCompanyLevels, openCompanyCompetencyLevels,
        openJob, createJob, submitJob,
        openBid, submitBid, recalcBidTotals,
        openDivision, saveDivision, previewProposal,
        openSchedule, openTimeSheet, openKits, openLabelGenerator, openFieldClock, openInventory,
        openScorecard, submitScorecard,
        selectClockInTask, trainingVideoComplete, showCoSignModal, closeCoSignModal, confirmCoSign,
        recordPpeVideo, ppeVideoComplete,
        toggleClock, addActivity,
        openMaterialLog, closeMaterialModal, saveMaterialLog,
        submitTimeSheet,
        openScoreboard, openStats, openFinance, openCustomerHome, openMore,
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
        (DB.isLoaded() ? Promise.resolve() : DB.load()).then(function () {
            if (state.role === 'customer') {
                loadPage('customer-home');
            } else if (state.signedIn && state.currentPage) {
                loadPage(state.currentPage);
            } else {
                loadPage('sign-in');
            }
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
