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

// ── App State ──────────────────────────────────────────────────────────────
const state = {
    accountType: 'existing',  // 'existing' | 'new'
    role: 'worker',           // 'worker' | 'customer' | 'supplier'
    currentPage: '',
    currentJob: null,
    currentDivision: null,    // 0-based index into bidData.divisions
};

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
    { icon: '',   label: 'Schedule', page: 'schedule' },
    { icon: '',   label: 'Messages', page: 'messages' },
    { icon: '',   label: 'Stats',    page: 'stats' },
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
    'inventory', 'stats', 'finance', 'customer-home', 'scoreboard',
    'job-detail', 'job-detail-nobid', 'create-job',
];

// ── Core Navigation ─────────────────────────────────────────────────────────
function loadPage(name, data) {
    if (data) state.currentPage = name;
    state.currentPage = name;

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
        })
        .catch(err => {
            document.getElementById('main').innerHTML =
                `<div class="page"><div class="alert alert-warn">Page "${name}" not found.</div>` +
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

    const jobPages = ['job-detail', 'job-detail-nobid', 'bid', 'bid-division', 'bid-proposal', 'create-job'];
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
        if (state.currentJob) { openJob(state.currentJob); return; }
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
    bootPhone();
}

// ── Auth Flow ───────────────────────────────────────────────────────────────
function signIn() {
    if (state.accountType === 'new') {
        showSignUp();
        return;
    }
    afterSignIn();
}

function afterSignIn() {
    if (state.role === 'worker') {
        loadPage('companies');
    } else if (state.role === 'customer') {
        loadPage('customer-home');
    } else {
        loadPage('inventory');
    }
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

function submitAccount() {
    closeSignUp();
    afterSignIn();
}

function goToSignIn() { loadPage('sign-in'); }

// ── Company Flow ────────────────────────────────────────────────────────────
function joinCompany() { loadPage('join-company'); }
function createCompany() { loadPage('new-company'); }
function submitJoinRequest() { loadPage('companies'); }
function submitNewCompany() { loadPage('company-setup'); }
function continueFromSetup() { loadPage('jobs'); }

// ── Jobs Flow ───────────────────────────────────────────────────────────────
const NO_BID_JOBS = ['Westgate Electrical Panel'];

function openJob(jobName) {
    state.currentJob = jobName;
    if (NO_BID_JOBS.includes(jobName)) {
        loadPage('job-detail-nobid');
    } else {
        loadPage('job-detail');
    }
}

function createJob() { loadPage('create-job'); }
function submitJob() { loadPage('jobs'); }

// ── Job Actions ─────────────────────────────────────────────────────────────
function openBid() { window.bidData = null; loadPage('bid'); } // reset bid on new open
function submitBid() { loadPage('job-detail'); }

// ── Bid Flow ─────────────────────────────────────────────────────────────────
function openDivision(index) {
    state.currentDivision = index;
    loadPage('bid-division');
}

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
function openFieldClock() { loadPage('feild-clock'); }
function openInventory() { loadPage('inventory'); }

// ── Field Clock ─────────────────────────────────────────────────────────────
let clockedIn = false;
let timerInterval = null;
let elapsedSeconds = 0;

function toggleClock() {
    clockedIn = !clockedIn;
    const btn = document.getElementById('clock-btn');
    const status = document.getElementById('clock-status');
    if (!btn) return;

    if (clockedIn) {
        btn.textContent = 'Clock Out';
        btn.className = 'btn btn-danger';
        if (status) status.textContent = 'Clocked In';
        elapsedSeconds = 0;
        timerInterval = setInterval(tickTimer, 1000);
    } else {
        btn.textContent = 'Clock In';
        btn.className = 'btn btn-green';
        if (status) status.textContent = 'Clocked Out';
        clearInterval(timerInterval);
    }
}

function tickTimer() {
    elapsedSeconds++;
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

function addActivity(type) {
    const log = document.getElementById('activity-log');
    if (!log) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icons = { driving: '&#128663;', lunch: '&#127869;', task: '&#10003;', material: '&#128295;' };
    const colors = { driving: 'icon-orange', lunch: 'icon-blue', task: 'icon-green', material: 'icon-purple' };
    const entry = document.createElement('div');
    entry.className = 'list-item';
    entry.innerHTML = `
        <div class="list-item-icon ${colors[type]}">${icons[type]}</div>
        <div class="list-item-body">
            <div class="list-item-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
            <div class="list-item-sub">Started at ${time}</div>
        </div>
        <span class="badge badge-green">Active</span>`;
    log.prepend(entry);
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

// ── Customer ─────────────────────────────────────────────────────────────────
function sendMessage() {
    const msg = document.getElementById('customer-msg');
    if (msg && msg.value.trim()) {
        msg.value = '';
        const sent = document.getElementById('message-sent');
        if (sent) { sent.style.display = 'block'; setTimeout(() => sent.style.display = 'none', 2500); }
    }
}

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

// ── App Registration ────────────────────────────────────────────────────────
// activate() is called by the shell every time this app becomes the visible
// one — it binds this app's page-facing functions onto window so the
// onclick="..." handlers in this app's fetched HTML fragments resolve to
// *this* app's implementation, not some other installed app's same-named one.
function activate() {
    Object.assign(window, {
        state,
        loadPage, navTo, goBack,
        setAccountType, setRole,
        signIn, afterSignIn, showSignUp, closeSignUp, submitAccount, goToSignIn,
        joinCompany, createCompany, submitJoinRequest, submitNewCompany, continueFromSetup,
        openJob, createJob, submitJob,
        openBid, submitBid,
        openDivision, saveDivision, previewProposal,
        openSchedule, openTimeSheet, openKits, openLabelGenerator, openFieldClock, openInventory,
        toggleClock, addActivity,
        submitTimeSheet, sendMessage,
        KIT_CATEGORIES,
        openScoreboard, openStats, openFinance, openCustomerHome, openMore,
        switchTab, toggleChip,
    });
}

window.Apps = window.Apps || {};
window.Apps['kinetic-flow'] = {
    activate: activate,
    start: function () { loadPage('sign-in'); },
};
})();
