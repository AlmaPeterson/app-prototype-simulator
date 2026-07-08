// ── Label Designer — App Simulator adapter ─────────────────────────────────
// Classic script loaded by the shell (see apps.js). The designer itself is an
// ES-module app (js/app.js + components); this adapter bridges the two:
// it registers window.Apps['label-designer'], lazily dynamic-imports the
// module graph on first launch, injects the app's (#ld-root-scoped)
// stylesheets, and adapts the shell's goBack() contract to the module's
// handleBack().
(function () {
    const APP_ID = 'label-designer';
    // Resolve app-relative URLs against this script's own URL so the app
    // works no matter where the site is hosted (root, GitHub Pages subpath).
    const SCRIPT_URL = document.currentScript && document.currentScript.src;
    const appUrl = (rel) => new URL(rel, SCRIPT_URL || window.location.href).href;

    /** @type {object|null} Resolved module namespace, once loaded. */
    let mod = null;
    let modulePromise = null;

    function loadModule() {
        if (!modulePromise) {
            modulePromise = import(appUrl('js/app.js')).then((m) => (mod = m));
        }
        return modulePromise;
    }

    function injectStylesheets() {
        ['css/globals.css', 'css/ui.css', 'css/canvas.css'].forEach((href) => {
            const id = 'ld-css-' + href.replace(/\W+/g, '-');
            if (document.getElementById(id)) return;
            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = appUrl(href);
            document.head.appendChild(link);
        });
    }

    // Shell Back-button contract: true = handled, false = close the app.
    // Must answer synchronously, so it can only defer to the module once
    // the dynamic import has resolved (before that there's no UI to unwind).
    function ldGoBack() {
        return mod ? mod.handleBack() : false;
    }

    window.Apps = window.Apps || {};
    window.Apps[APP_ID] = {
        activate() {
            window.goBack = ldGoBack;
        },

        start() {
            injectStylesheets();
            const main = document.getElementById('main');
            main.innerHTML = '<div id="ld-root"></div>';
            const root = document.getElementById('ld-root');
            // Another app (Kinetic Flow's Labels page) can stage a template +
            // data handoff on window.LabelDesignerHandoff just before calling
            // openApp('label-designer') — consumed once, here, so a later
            // plain re-open of this app doesn't replay stale data.
            const handoff = window.LabelDesignerHandoff || null;
            window.LabelDesignerHandoff = null;
            loadModule()
                .then(() => mod.mountLabelDesigner(root))
                .then(() => { if (handoff) mod.loadHandoff(handoff); })
                .catch((err) => {
                    console.error('Label Designer failed to start:', err);
                    root.innerHTML =
                        '<div style="padding:24px;color:#b91c1c;">' +
                        'Label Designer failed to load: ' + err.message +
                        '</div>';
                });
        },
    };
})();
