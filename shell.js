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
    if (!currentAppId) return;
    const entry = window.Apps && window.Apps[currentAppId];
    if (entry && entry.onClose) entry.onClose();
    showScreen('home');
}

// ── Side Controls (Back / Home) ───────────────────────────────────────────
// Generic OS-chrome equivalents of a phone's hardware/gesture buttons. Back
// defers to the running app's own goBack() (exposed onto window by its
// activate()), which returns true if it handled the navigation. If there's
// no app open, no goBack defined, or the app reports its back-stack is
// empty (returns false), Back falls through to closing the app — the same
// place a phone's back button lands you when there's nowhere left to go.
function phoneBack() {
    if (!currentAppId) return;
    if (typeof window.goBack === 'function' && window.goBack()) return;
    closeApp();
}

function phoneHome() {
    closeApp();
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

// ── Fullscreen ───────────────────────────────────────────────────────────────
// Drops the phone's bezel/header chrome so it fills the whole browser
// viewport (and requests real browser fullscreen where supported) — useful
// for viewing the prototype on an actual phone screen instead of as a
// scaled-down mockup on desktop.
let preFullscreenSize = null;

function toggleFullscreen() {
    const phone = document.getElementById('phone');
    const enteringFullscreen = !document.body.classList.contains('fullscreen-mode');

    // Capture the current windowed size before the fullscreen-mode class
    // goes on — the class forces #phone to 100vw/100vh via CSS, so reading
    // offsetWidth/Height after toggling would just record the fullscreen
    // size instead of the size to restore to.
    if (enteringFullscreen) {
        preFullscreenSize = { w: phone.offsetWidth, h: phone.offsetHeight };
    }

    document.body.classList.toggle('fullscreen-mode');

    if (enteringFullscreen) {
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    } else {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        if (preFullscreenSize) {
            setPhoneSize(preFullscreenSize.w, preFullscreenSize.h);
            preFullscreenSize = null;
        }
    }
}

document.addEventListener('fullscreenchange', () => {
    // Browser fullscreen can be exited via Esc without going through our
    // button (e.g. pressing Esc) — keep the CSS state in sync either way.
    if (!document.fullscreenElement && document.body.classList.contains('fullscreen-mode')) {
        toggleFullscreen();
    }
});

// ── Init ────────────────────────────────────────────────────────────────────
// On a wide (desktop) viewport there's room to show the phone at its "Large"
// preset; on a narrow viewport (an actual phone) that size wouldn't fit
// on-screen, so default to the smaller "Phone" preset instead.
const WIDE_SCREEN_BREAKPOINT = 600;
if (window.innerWidth < WIDE_SCREEN_BREAKPOINT) {
    setPhoneSize(390, 720);
} else {
    setPhoneSize(430, 932);
}

preloadApps().then(() => {
    // The header's Account/Role toggles are wired to Kinetic Flow's
    // setAccountType/setRole, which only exist as window globals once its
    // activate() has run. Run it now so those controls work the instant the
    // page loads, not only after the app icon has first been tapped.
    const entry = window.Apps && window.Apps['kinetic-flow'];
    if (entry && entry.activate) entry.activate();
});
bootPhone();
