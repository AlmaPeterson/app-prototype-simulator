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
function loadPage(name, data) {
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

function goBack() { loadPage('jobs'); }

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
function submitNewCompany() { loadPage('company-setup'); }
function continueFromSetup() { loadPage('jobs'); }

function openBranch(branchId) {
    state.currentBranchId = branchId;
    loadPage('branch-detail');
}

function selectCompany(companyId) {
    state.currentCompanyId = companyId;
    loadPage('jobs');
}

function manageCompany(companyId) {
    state.currentCompanyId = companyId;
    loadPage('company-setup');
}

// ── Company Configuration: Divisions / Levels / Competency Levels ───────────
// Mirrors db/divisions.json, db/levels.json, db/competency_levels.json.
// Lives here (not in the page) for the same reason as KIT_CATEGORIES — app.js
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
    const addressId = customer ? customer.address_id : null;
    const notes = val('cj-notes');
    const startInput = document.getElementById('cj-start');
    const endInput = document.getElementById('cj-end');
    const scheduledStart = startInput && startInput.value ? new Date(startInput.value).toISOString() : null;
    const scheduledEnd = endInput && endInput.value ? new Date(endInput.value).toISOString() : null;

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
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
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

// ── Kits ────────────────────────────────────────────────────────────────────
// Shared catalog data — read by both kits.html (browse) and
// label-generator.html (select items to print labels for). Lives here
// (rather than duplicated in each page fragment) since app.js loads once
// per app lifetime while page fragments re-run their inline <script> every
// time they're navigated to.
const KIT_CATEGORIES = [
    {
        name: 'Drywall',
        kits: [
            { name: 'Drywall Hanging Kit', tools: ['Drywall Screw Gun', 'T-Square', 'Panel Lift', 'Utility Knife'], materials: ['1/2" Drywall Sheets', '1-1/4" Drywall Screws', 'Corner Bead'] },
            { name: 'Drywall Skimming Kit', tools: ['6" Skim Blade', '12" Skim Blade', 'Mixing Paddle'], materials: ['Joint Compound', 'Skim Coat Mix'] },
            { name: 'Mud Knives', tools: ['4" Mud Knife', '6" Mud Knife', '10" Mud Knife', '12" Mud Knife'], materials: ['Mud Pan'] },
            { name: 'Drywall Sanding Kit', tools: ['Pole Sander', 'Hand Sanding Block', 'Dust Mask'], materials: ['120-Grit Sanding Screens', '220-Grit Sandpaper'] },
            { name: 'Drywall Patch Blocking', tools: ['Drywall Saw', 'Cordless Drill'], materials: ['Wood Blocking', '1-1/4" Drywall Screws'] },
            { name: 'Drywall Tape Kit', tools: ['6" Taping Knife', 'Banjo Taper'], materials: ['Paper Tape', 'Mesh Tape', 'Joint Compound'] },
            { name: 'Drywall Old Work Box Kit', tools: ['Rotozip', 'Drywall Saw'], materials: ['Old Work Electrical Boxes', 'Box Ears'] },
            { name: 'Drywall Screw Clips', tools: ['Cordless Drill'], materials: ['Drywall Screw Clips', '1-1/4" Drywall Screws'] },
            { name: 'Drywall Texture Kit', tools: ['Hopper Gun', 'Air Compressor', 'Texture Brush'], materials: ['Texture Mix', 'Knockdown Compound'] },
            { name: 'Drywall Patch Kit', tools: ['Utility Knife', '6" Taping Knife'], materials: ['Drywall Patch Panel', 'Mesh Tape', 'Joint Compound'] },
            { name: 'Mudding and Taping Kit', tools: ['6" Taping Knife', '10" Taping Knife', 'Mud Pan'], materials: ['Joint Compound', 'Paper Tape'] },
            { name: 'Dust Barrier Kit', tools: ['Zip Pole', 'Staple Gun'], materials: ['Poly Sheeting', 'Zipper Door', "Painter's Tape"] },
            { name: '5-Minute Hot Mud', tools: ['Mixing Paddle', '6" Taping Knife'], materials: ['5-Min Setting Compound'] },
            { name: '20-Minute Hot Mud', tools: ['Mixing Paddle', '6" Taping Knife'], materials: ['20-Min Setting Compound'] },
            { name: '45-Minute Hot Mud', tools: ['Mixing Paddle', '10" Taping Knife'], materials: ['45-Min Setting Compound'] },
        ]
    },
    {
        name: 'Doors & Hardware',
        kits: [
            { name: 'Door Drilling Kit', tools: ['Door Lock Installation Jig', '2-1/8" Hole Saw', 'Spade Bit'], materials: ['Latch Faceplates', 'Strike Plates'] },
            { name: 'Door Hanging Kit', tools: ['Door Shims', 'Hinge Chisel', 'Level'], materials: ['Hinges', '3" Screws'] },
            { name: 'Commercial Door Hardware', tools: ['Drill/Driver', 'Template Kit'], materials: ['Panic Bar Hardware', 'Commercial Hinges', 'Door Closers'] },
            { name: 'Door Hardware Residential', tools: ['Drill/Driver', 'Chisel'], materials: ['Residential Knobsets', 'Deadbolts', 'Strike Plates'] },
            { name: 'Stair Railing Hardware', tools: ['Stud Finder', 'Level', 'Drill/Driver'], materials: ['Rail Brackets', 'Newel Post Anchors', 'Lag Bolts'] },
        ]
    },
    {
        name: 'Framing',
        kits: [
            { name: 'Framing Kit', tools: ['Framing Hammer', 'Speed Square', 'Circular Saw', 'Chalk Line'], materials: ['2x4 Studs', '16d Framing Nails'] },
            { name: 'Framing Plates', tools: ['Cordless Drill', 'Hammer'], materials: ['Framing Plates', 'Structural Screws'] },
        ]
    },
    {
        name: 'Finish Carpentry',
        kits: [
            { name: 'Finish Carpentry Kit', tools: ['Finish Nailer', 'Miter Saw', 'Coping Saw'], materials: ['Trim Boards', 'Finish Nails'] },
            { name: 'Finish Carpentry Trim Work', tools: ['Miter Saw', 'Finish Nailer', 'Coping Saw'], materials: ['Baseboard', 'Casing', 'Wood Filler'] },
            { name: 'Finish Carpentry Veneer Work', tools: ['Veneer Roller', 'Contact Cement Brush', 'Utility Knife'], materials: ['Wood Veneer Sheets', 'Contact Cement'] },
            { name: 'Finish Carpentry Measure and Mark', tools: ['Tape Measure', 'Combination Square', 'Marking Pencil', 'Chalk Line'], materials: [] },
            { name: 'Finish Carpentry Jigs', tools: ['Pocket Hole Jig', 'Doweling Jig', 'Story Pole'], materials: ['Pocket Hole Screws'] },
            { name: 'FC Router', tools: ['Router', 'Round-Over Bit', 'Straight Bit'], materials: [] },
            { name: 'Wood Touch-Up Kit', tools: ['Touch-Up Markers', 'Burn-In Knife'], materials: ['Wood Filler', 'Stain Matching Kit'] },
            { name: '3rd Hand', tools: ['3rd Hand Tool', 'Bar Clamps'], materials: [] },
        ]
    },
    {
        name: 'Flooring & Tile',
        kits: [
            { name: 'Tile Trowels', tools: ['1/4" V-Notch Trowel', '3/8" Square-Notch Trowel', 'Margin Trowel'], materials: [] },
            { name: 'A2 Flooring Hard Wood', tools: ['Flooring Nailer', 'Pull Bar', 'Tapping Block'], materials: ['Hardwood Planks', 'Underlayment'] },
            { name: 'Plank Flooring Kit', tools: ['Flooring Nailer', 'Pull Bar', 'Spacers'], materials: ['Vinyl Plank Flooring', 'Underlayment'] },
            { name: 'Carpet Kit', tools: ['Knee Kicker', 'Carpet Stretcher', 'Stair Tool'], materials: ['Tack Strip', 'Carpet Padding', 'Seam Tape'] },
            { name: 'Tile Kit', tools: ['Tile Cutter', 'Notched Trowel', 'Grout Float'], materials: ['Thinset', 'Grout', 'Tile Spacers'] },
        ]
    },
    {
        name: 'Painting',
        kits: [
            { name: 'Paint Brushes', tools: ['2" Angled Sash Brush', '3" Flat Brush'], materials: [] },
            { name: 'Graco Interfeed Roller', tools: ['Graco Interfeed Roller'], materials: ['9" Roller Sleeves'] },
            { name: 'Mix and Open', tools: ['Paint Mixer Paddle', 'Can Opener'], materials: [] },
            { name: 'Paint Pails', tools: ['Paint Pail', 'Pail Screen'], materials: [] },
            { name: 'Paint Spraying', tools: ['Airless Sprayer', 'Extension Pole'], materials: [] },
            { name: 'Spray Tips', tools: ['Tip Guard'], materials: ['Assorted Spray Tips'] },
            { name: 'Hotdog Roller', tools: ['Hotdog Roller Frame'], materials: ['Hotdog Roller Sleeves'] },
            { name: 'Paint Prep Bondo', tools: ['Putty Knife', 'Sanding Block'], materials: ['Bondo Filler', 'Hardener'] },
            { name: 'Paint Prep Caulk', tools: ['Caulk Gun', 'Caulk Finishing Tool'], materials: ["Painter's Caulk"] },
            { name: 'Tape Off Kit', tools: ['Tape Dispenser Tool'], materials: ["Painter's Tape", 'Masking Paper', 'Plastic Sheeting'] },
            { name: 'Inner Feed Rollers 3/8" Nap', tools: ['Roller Frame'], materials: ['3/8" Nap Roller Covers'] },
            { name: 'Inner Feed Rollers 1/2" Nap', tools: ['Roller Frame'], materials: ['1/2" Nap Roller Covers'] },
            { name: '4" Rollers', tools: ['4" Roller Frame'], materials: ['4" Roller Covers'] },
        ]
    },
    {
        name: 'Plumbing',
        kits: [
            { name: 'Copper Kit', tools: ['Tubing Cutter', 'Propane Torch', 'Deburring Tool'], materials: ['Copper Fittings', 'Solder', 'Flux'] },
            { name: 'Copper 3/4" Kit', tools: ['3/4" Tubing Cutter', 'Propane Torch'], materials: ['3/4" Copper Pipe', '3/4" Fittings', 'Solder'] },
            { name: 'Pex B Crimp 1/2" Kit', tools: ['1/2" Crimp Tool', 'Go/No-Go Gauge'], materials: ['1/2" PEX Tubing', '1/2" Crimp Rings'] },
            { name: 'Pex Crimp SS 3/4" Kit', tools: ['3/4" Stainless Clamp Tool'], materials: ['3/4" PEX Tubing', '3/4" Stainless Clamp Rings'] },
            { name: 'Pex A Expansion Kit', tools: ['Expansion Tool', 'Expander Head Set'], materials: ['PEX-A Tubing', 'Expansion Rings'] },
            { name: 'Gas Iron Pipe Kit', tools: ['Pipe Threader', 'Pipe Wrench', 'Pipe Vise'], materials: ['Black Iron Pipe', 'Fittings', 'Pipe Dope'] },
            { name: 'Sprinkler Maintenance Kit', tools: ['Sprinkler Head Puller', 'Pipe Cutter'], materials: ['Sprinkler Heads', 'Risers', 'PVC Fittings'] },
            { name: 'Shut Off Valves Sink/Toilet Kit', tools: ['Basin Wrench', 'Adjustable Wrench'], materials: ['Quarter-Turn Shut Off Valves', 'Supply Lines'] },
            { name: 'Plumbing Glue Kit', tools: ['Applicator Brush'], materials: ['PVC Cement', 'CPVC Cement', 'Primer'] },
            { name: 'Silicone Kit', tools: ['Caulk Gun', 'Silicone Finishing Tool'], materials: ['Silicone Sealant'] },
            { name: 'CPVC Kit', tools: ['Pipe Cutter', 'Deburring Tool'], materials: ['CPVC Pipe', 'CPVC Fittings', 'CPVC Cement'] },
            { name: 'PVC Kit', tools: ['Pipe Cutter', 'Deburring Tool'], materials: ['PVC Pipe', 'PVC Fittings', 'PVC Cement'] },
            { name: 'Large Plumbing Tools', tools: ['Pipe Wrench Set', 'Pipe Vise', 'Threading Machine'], materials: [] },
            { name: 'Miscellaneous Plumbing', tools: ['Basin Wrench', 'Channel Locks'], materials: ['Assorted Fittings', 'Washers', 'O-Rings'] },
            { name: 'Toilet Bolts', tools: ['Ratchet Wrench'], materials: ['Closet Bolts', 'Bolt Caps'] },
            { name: 'Soldering Kit', tools: ['Propane Torch', 'Emery Cloth', 'Flux Brush'], materials: ['Solder', 'Flux'] },
            { name: 'Plastic Pipe Installation Kit', tools: ['Pipe Cutter', 'Deburring Tool', 'Tape Measure'], materials: ['PVC/CPVC Pipe', 'Fittings', 'Cement'] },
        ]
    },
    {
        name: 'Electrical',
        kits: [
            { name: 'Miscellaneous Electrical', tools: ['Wire Strippers', 'Voltage Tester'], materials: ['Wire Nuts', 'Electrical Tape'] },
            { name: 'Electrical Boxes', tools: ['Hole Saw', 'Cordless Drill'], materials: ['Single-Gang Boxes', 'Double-Gang Boxes', 'Box Screws'] },
            { name: 'Electrical Screws', tools: ['Screwdriver'], materials: ['6-32 Machine Screws', 'Grounding Screws'] },
            { name: 'Electrical Wafer Lights', tools: ['Hole Saw', 'Wire Strippers'], materials: ['LED Wafer Lights', 'Junction Boxes'] },
            { name: 'EMT Conduit', tools: ['Conduit Bender', 'Hacksaw'], materials: ['EMT Conduit', 'Set Screw Connectors', 'Straps'] },
            { name: 'Outlets and Switches', tools: ['Wire Strippers', 'Screwdriver', 'Voltage Tester'], materials: ['Duplex Outlets', 'Switches', 'Wire Nuts'] },
            { name: 'Outlet and Switch Covers', tools: ['Screwdriver'], materials: ['Outlet Covers', 'Switch Plates'] },
            { name: 'Electrical Breakers', tools: ['Voltage Tester', 'Screwdriver'], materials: ['Single-Pole Breakers', 'Double-Pole Breakers'] },
            { name: 'Wire Connections Kit', tools: ['Wire Strippers', 'Crimping Tool'], materials: ['Wire Nuts', 'Butt Connectors', 'Electrical Tape'] },
            { name: 'Finish Electrical Kit', tools: ['Wire Strippers', 'Voltage Tester', 'Screwdriver Set'], materials: ['Devices', 'Cover Plates', 'Wire Nuts'] },
            { name: 'Glow Rods', tools: ['Fish Tape / Glow Rods', 'Wire Pulling Lube'], materials: [] },
        ]
    },
    {
        name: 'Fixtures & HVAC',
        kits: [
            { name: 'HVAC Kit', tools: ['Manifold Gauges', 'Vacuum Pump', 'Refrigerant Scale'], materials: ['Refrigerant', 'Line Set Insulation'] },
            { name: 'Toilet Kit', tools: ['Wax Ring Tool', 'Adjustable Wrench'], materials: ['Wax Ring', 'Closet Bolts', 'Toilet Tank Kit'] },
            { name: 'Sink Kit', tools: ['Basin Wrench', 'Putty Knife'], materials: ['P-Trap', 'Supply Lines', "Plumber's Putty"] },
            { name: 'Bathtub Kit', tools: ['Tub Drain Wrench', 'Caulk Gun'], materials: ['Tub Drain Kit', 'Overflow Gasket', 'Silicone'] },
            { name: 'Washer and Dryer Kit', tools: ['Adjustable Wrench', 'Level'], materials: ['Supply Hoses', 'Dryer Vent Kit'] },
            { name: 'Water Heater Kit', tools: ['Pipe Wrench', 'Element Wrench'], materials: ['T&P Valve', 'Anode Rod', 'Supply Fittings'] },
        ]
    },
    {
        name: 'Fasteners & Hardware',
        kits: [
            { name: 'Toggle Bolts', tools: ['Drill/Driver'], materials: ['Toggle Bolts, Assorted Sizes'] },
            { name: 'Building Screws', tools: ['Impact Driver'], materials: ['Structural Screws, Assorted Lengths'] },
            { name: 'Bolt Kit', tools: ['Ratchet Set'], materials: ['Assorted Bolts', 'Nuts', 'Washers'] },
            { name: 'Brick and Block Anchors', tools: ['Hammer Drill', 'Masonry Bit'], materials: ['Wedge Anchors', 'Sleeve Anchors'] },
            { name: 'Pan Head Screws', tools: ['Screwdriver'], materials: ['Pan Head Screws, Assorted Sizes'] },
            { name: 'Small Screws', tools: ['Precision Screwdriver Set'], materials: ['Small Screws, Assorted Sizes'] },
            { name: 'Screws for Metal', tools: ['Impact Driver'], materials: ['Self-Tapping Metal Screws'] },
            { name: 'Structural Glue Kit', tools: ['Caulk Gun'], materials: ['Construction Adhesive'] },
        ]
    },
    {
        name: 'Tools',
        kits: [
            { name: 'Oscillating Tool Kit', tools: ['Oscillating Multi-Tool', 'Blade Set'], materials: [] },
            { name: 'Hammers', tools: ['Claw Hammer'], materials: [] },
            { name: 'Hammers / Larger', tools: ['Framing Hammer', 'Sledgehammer'], materials: [] },
            { name: 'Chisels / Smaller', tools: ['1/4" Chisel', '1/2" Chisel'], materials: [] },
            { name: 'Speed Squares', tools: ['7" Speed Square', '12" Speed Square'], materials: [] },
            { name: 'Razor Blades', tools: ['Utility Knife'], materials: ['Razor Blades'] },
            { name: 'Open End Wrench', tools: ['Open End Wrench Set'], materials: [] },
            { name: 'Allen Wrenches', tools: ['Allen Wrench Set', 'T-Handle Hex Set'], materials: [] },
            { name: 'Wrench Impact Sockets', tools: ['Impact Socket Set'], materials: [] },
            { name: 'Hole Saw', tools: ['Hole Saw Kit', 'Arbor'], materials: [] },
            { name: 'Carbide Hole Saw Bits', tools: ['Carbide-Tipped Hole Saw Set'], materials: [] },
            { name: 'Rotary Hammer', tools: ['Rotary Hammer', 'SDS Bit Set'], materials: [] },
            { name: '3/8" Socket Set', tools: ['3/8" Drive Ratchet', 'Socket Set'], materials: [] },
            { name: 'Demolition Kit', tools: ['Demo Hammer', 'Pry Bar', 'Sledgehammer'], materials: [] },
            { name: 'Vacuum', tools: ['Shop Vacuum', 'HEPA Filter'], materials: ['Vacuum Bags'] },
            { name: 'Empty Kit', tools: [], materials: [] },
        ]
    },
    {
        name: 'Drill Bits & Sanding',
        kits: [
            { name: 'Wood Drill Bits', tools: ['Cordless Drill'], materials: ['Wood Drill Bit Set'] },
            { name: 'Metal Drill Bits', tools: ['Cordless Drill'], materials: ['Cobalt Drill Bit Set'] },
            { name: 'Screw Bits', tools: ['Impact Driver'], materials: ['Phillips/Square Bit Set'] },
            { name: 'Festool Sanders', tools: ['Festool ETS Sander', 'Festool Dust Extractor'], materials: ['Sanding Discs'] },
            { name: '6" Sanding Disc', tools: ['6" Random Orbit Sander'], materials: ['6" Sanding Discs, Assorted Grits'] },
            { name: '5" Disc Sanding Paper', tools: ['5" Random Orbit Sander'], materials: ['5" Sanding Discs, Assorted Grits'] },
            { name: 'Delta Sanding Paper', tools: ['Detail/Delta Sander'], materials: ['Delta Sanding Sheets, Assorted Grits'] },
            { name: '2" x 3" Rectangle Sanding Paper', tools: ['Detail Sander'], materials: ['2"x3" Sanding Sheets'] },
        ]
    },
    {
        name: 'Safety & Cleanup',
        kits: [
            { name: 'Safety Kit', tools: ['Safety Glasses', 'Ear Protection', 'Respirator'], materials: ['Gloves', 'First Aid Kit'] },
            { name: 'Paint Cleanup Kit', tools: ['5-Gallon Bucket', 'Paint Roller Cleaner'], materials: ['Mineral Spirits', 'Rags'] },
            { name: 'General Cleanup Kit', tools: ['Broom', 'Dustpan', 'Shop Vacuum'], materials: ['Trash Bags'] },
            { name: 'Insulation Kit', tools: ['Insulation Knife', 'Staple Gun'], materials: ['Fiberglass Batts', 'Vapor Barrier'] },
        ]
    },
];

// ── Dashboard pages ──────────────────────────────────────────────────────────
function openScoreboard() { loadPage('scoreboard'); }
function openStats() { loadPage('stats'); }
function openFinance() { loadPage('finance'); }
function openCustomerHome() { loadPage('customer-home'); }

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
        KIT_CATEGORIES,
        openScoreboard, openStats, openFinance, openCustomerHome, openMore,
        switchTab, toggleChip,
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
