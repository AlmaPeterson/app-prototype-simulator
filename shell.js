// ── OS Shell ──────────────────────────────────────────────────────────────
// Generic phone chrome shared by every app: boot animation, home screen
// (rendered from the APPS registry in apps.js), opening/closing apps, and
// the resizable phone frame. No Kinetic-Flow-specific logic lives here —
// that all lives in apps/kinetic-flow/app.js.

const BOOT_DELAY_MS = 400;

const loadedAppScripts = new Set();
const launchedApps = new Set();
let currentAppId = null;

// ── App Loading ──────────────────────────────────────────────────────────
// All registered apps' scripts are preloaded at boot (see init, below) so
// that app-defined functions wired to header controls (e.g. Kinetic Flow's
// setAccountType/setRole) are ready the instant the page loads, not only
// after the home screen icon has been tapped.
function loadAppScript(app) {
    return new Promise((resolve, reject) => {
        if (loadedAppScripts.has(app.id)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = app.script;
        s.onload = () => { loadedAppScripts.add(app.id); resolve(); };
        s.onerror = () => reject(new Error('Failed to load app script: ' + app.script));
        document.body.appendChild(s);
    });
}

function preloadApps() {
    return Promise.all(APPS.map(loadAppScript));
}

// ── Home Screen ────────────────────────────────────────────────────────────
function renderHomeScreen() {
    const container = document.getElementById('home-icons');
    container.innerHTML = APPS.map(app => `
        <div class="home-icon-slot">
            <div class="home-icon" onclick="openApp('${app.id}')" title="Open ${app.name}">
                <div class="home-icon-glyph">${app.icon}</div>
            </div>
            <div class="home-icon-label">${app.name}</div>
        </div>
    `).join('');
}

// ── OS Shell (boot screen / home screen / running app) ──────────────────────
function showScreen(which) {
    document.getElementById('os-boot').style.display = which === 'boot' ? 'flex' : 'none';
    document.getElementById('os-home').style.display = which === 'home' ? 'flex' : 'none';
    document.getElementById('app-container').style.display = which === 'app' ? 'flex' : 'none';
}

function bootPhone() {
    currentAppId = null;
    launchedApps.clear();
    showScreen('boot');
    renderHomeScreen();
    setTimeout(() => showScreen('home'), BOOT_DELAY_MS);
}

function openApp(appId) {
    const app = APPS.find(a => a.id === appId);
    if (!app) return;
    currentAppId = appId;
    showScreen('app');
    loadAppScript(app).then(() => {
        const entry = window.Apps && window.Apps[appId];
        if (entry && entry.activate) entry.activate();
        if (!launchedApps.has(appId)) {
            launchedApps.add(appId);
            if (entry && entry.start) entry.start();
        }
    });
}

// For header controls that jump straight into a specific page of an app
// (bypassing its normal start() entry point) — marks the app as already
// launched so reopening it later won't re-trigger start() over the page
// the control just navigated to. Still re-activates the app's globals in
// case another app was opened (and stole them) in between.
function launchApp(appId) {
    currentAppId = appId;
    launchedApps.add(appId);
    showScreen('app');
    const entry = window.Apps && window.Apps[appId];
    if (entry && entry.activate) entry.activate();
}

function closeApp() {
    if (currentAppId) showScreen('home');
}

// ── Phone Resize ─────────────────────────────────────────────────────────────
const MIN_W = 280, MAX_W = 900, MIN_H = 420, MAX_H = 1100;

function setPhoneSize(w, h) {
    const phone = document.getElementById('phone');
    phone.style.width  = w + 'px';
    phone.style.height = h + 'px';
    updateSizeLabel(w, h);

    // Mark matching preset active
    document.querySelectorAll('#size-presets button').forEach(btn => {
        btn.classList.remove('active');
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes(w + ', ' + h) || onclick.includes(w + ',' + h)) {
            btn.classList.add('active');
        }
    });
}

function updateSizeLabel(w, h) {
    const lbl = document.getElementById('size-label');
    if (lbl) lbl.innerHTML = Math.round(w) + ' &times; ' + Math.round(h);
}

(function initResize() {
    const grip  = document.getElementById('resize-grip');
    const phone = document.getElementById('phone');
    if (!grip || !phone) return;

    let startX, startY, startW, startH;

    grip.addEventListener('mousedown', e => {
        startX = e.clientX;
        startY = e.clientY;
        startW = phone.offsetWidth;
        startH = phone.offsetHeight;
        grip.classList.add('dragging');
        document.body.style.cursor = 'se-resize';
        document.body.style.userSelect = 'none';

        function onMove(e) {
            const w = Math.round(Math.max(MIN_W, Math.min(MAX_W, startW + (e.clientX - startX))));
            const h = Math.round(Math.max(MIN_H, Math.min(MAX_H, startH + (e.clientY - startY))));
            phone.style.width  = w + 'px';
            phone.style.height = h + 'px';
            updateSizeLabel(w, h);

            // Deactivate all presets while custom-dragging
            document.querySelectorAll('#size-presets button').forEach(b => b.classList.remove('active'));
        }

        function onUp() {
            grip.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });

    // Touch support
    grip.addEventListener('touchstart', e => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        startW = phone.offsetWidth;
        startH = phone.offsetHeight;

        function onTouch(e) {
            const t = e.touches[0];
            const w = Math.round(Math.max(MIN_W, Math.min(MAX_W, startW + (t.clientX - startX))));
            const h = Math.round(Math.max(MIN_H, Math.min(MAX_H, startH + (t.clientY - startY))));
            phone.style.width  = w + 'px';
            phone.style.height = h + 'px';
            updateSizeLabel(w, h);
        }

        function onTouchEnd() {
            document.removeEventListener('touchmove', onTouch);
            document.removeEventListener('touchend', onTouchEnd);
        }

        document.addEventListener('touchmove', onTouch, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
        e.preventDefault();
    }, { passive: false });
})();

// ── Init ─────────────────────────────────────────────────────────────────────
preloadApps();
bootPhone();
