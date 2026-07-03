// ── Screen Notes / Bug Reports ───────────────────────────────────────────
// OS-chrome feature (lives alongside shell.js, not tied to any one app): the
// phone chrome's 🐛 side button opens a modal that captures whatever screen
// is currently showing (which app, which page/role if it's Kinetic Flow,
// phone size) and lets you jot a note against it.
//
// There's no backend here (this whole app is static HTML meant to run on
// GitHub Pages), so "saving" means committing straight to the repo via
// GitHub's REST API: each note is appended to notes/kinetic-flow-notes.md
// and pushed as its own commit on the configured branch, using a personal
// access token you provide once via the ⚙ settings panel. `git pull` after
// that picks up every note as normal commit history.
//
// The token is kept only in this browser's localStorage — it is never part
// of the site's source, so publishing to GitHub Pages does not expose it.
// It IS sent as a plain Authorization header on each API call, visible to
// anyone with devtools access to that browser, so use a fine-grained PAT
// scoped to only this repo's Contents permission, not a classic all-repo
// token.

const GH_CONFIG_KEY = 'kf_gh_config';

function getGithubConfig() {
    try { return JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || 'null') || {}; }
    catch (e) { return {}; }
}

function setGithubConfig(cfg) {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg));
}

function isGithubConfigured(cfg) {
    return !!(cfg && cfg.owner && cfg.repo && cfg.token);
}

// ── Settings panel ───────────────────────────────────────────────────────
function toggleGithubSettings() {
    const panel = document.getElementById('notes-github-settings');
    const opening = panel.style.display === 'none';
    panel.style.display = opening ? 'block' : 'none';
    if (opening) {
        const cfg = getGithubConfig();
        document.getElementById('gh-owner').value = cfg.owner || '';
        document.getElementById('gh-repo').value = cfg.repo || '';
        document.getElementById('gh-branch').value = cfg.branch || 'main';
        document.getElementById('gh-path').value = cfg.path || 'notes/kinetic-flow-notes.md';
        document.getElementById('gh-token').value = cfg.token || '';
    }
}

function saveGithubSettings() {
    setGithubConfig({
        owner: document.getElementById('gh-owner').value.trim(),
        repo: document.getElementById('gh-repo').value.trim(),
        branch: document.getElementById('gh-branch').value.trim() || 'main',
        path: document.getElementById('gh-path').value.trim() || 'notes/kinetic-flow-notes.md',
        token: document.getElementById('gh-token').value.trim(),
    });
    toggleGithubSettings();
    setNotesStatus(isGithubConfigured(getGithubConfig()) ? 'GitHub connection saved.' : 'Missing owner, repo, or token.');
}

// ── What screen am I looking at? ────────────────────────────────────────────
function captureNoteContext() {
    let screen = 'boot';
    if (document.getElementById('os-home').style.display !== 'none') screen = 'home';
    else if (currentAppId) screen = currentAppId;

    let page = null, role = null;
    if (currentAppId && window.state) {
        page = window.state.currentPage || null;
        role = window.state.role || null;
    }

    const accountBtn = document.querySelector('#account-toggle .active');
    const roleBtnEl = document.querySelector('#role-toggle .active');
    const sizeLbl = document.getElementById('size-label');

    return {
        app: currentAppId,
        screen: screen,
        page: page,
        role: role || (roleBtnEl ? roleBtnEl.textContent.trim() : null),
        accountType: accountBtn ? accountBtn.textContent.trim() : null,
        phoneSize: sizeLbl ? sizeLbl.textContent.trim() : null,
    };
}

function formatNoteContext(ctx) {
    const lines = [];
    lines.push('Screen: ' + (ctx.app ? ctx.app : 'OS ' + ctx.screen) + (ctx.page ? ' — ' + ctx.page : ''));
    if (ctx.role) lines.push('Role: ' + ctx.role);
    if (ctx.accountType) lines.push('Account: ' + ctx.accountType);
    if (ctx.phoneSize) lines.push('Phone size: ' + ctx.phoneSize);
    return lines.join('\n');
}

function renderNoteEntryMarkdown(entry) {
    let out = '## ' + entry.timestamp + '\n\n';
    out += '- Screen: ' + (entry.app ? entry.app : 'OS ' + entry.screen) + (entry.page ? ' — ' + entry.page : '') + '\n';
    if (entry.role) out += '- Role: ' + entry.role + '\n';
    if (entry.accountType) out += '- Account: ' + entry.accountType + '\n';
    if (entry.phoneSize) out += '- Phone size: ' + entry.phoneSize + '\n';
    out += '\n' + entry.note + '\n\n---\n\n';
    return out;
}

// ── Modal ────────────────────────────────────────────────────────────────
let pendingNoteContext = null;

function openNotesModal() {
    pendingNoteContext = captureNoteContext();
    document.getElementById('notes-context').textContent = formatNoteContext(pendingNoteContext);
    document.getElementById('notes-textarea').value = '';
    document.getElementById('notes-github-settings').style.display = 'none';
    setNotesStatus(isGithubConfigured(getGithubConfig()) ? '' : 'Not connected to GitHub yet — tap ⚙ to set it up.');
    document.getElementById('notes-modal').style.display = 'flex';
    document.getElementById('notes-textarea').focus();
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
}

function setNotesStatus(message) {
    const el = document.getElementById('notes-status');
    if (el) el.textContent = message || '';
}

function setSaving(isSaving) {
    const btn = document.getElementById('notes-save-btn');
    btn.disabled = isSaving;
    btn.textContent = isSaving ? 'Saving…' : 'Save Note';
}

function saveNote() {
    const textarea = document.getElementById('notes-textarea');
    const text = textarea.value.trim();
    if (!text) return;

    const cfg = getGithubConfig();
    if (!isGithubConfigured(cfg)) {
        setNotesStatus('Add your GitHub owner/repo/token (⚙) before saving.');
        return;
    }

    const entry = Object.assign({ timestamp: new Date().toISOString(), note: text }, pendingNoteContext);

    setSaving(true);
    setNotesStatus('Saving to GitHub…');
    commitNoteToGithub(cfg, entry)
        .then(function () {
            setSaving(false);
            closeNotesModal();
        })
        .catch(function (err) {
            setSaving(false);
            setNotesStatus(err.message || 'Failed to save — see console for details.');
            console.error('Failed to save note to GitHub:', err);
        });
}

// ── GitHub Contents API ─────────────────────────────────────────────────────
// UTF-8-safe base64 helpers (plain atob/btoa mangle anything outside Latin1).
function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

function githubApiUrl(cfg) {
    return 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) +
        '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');
}

function githubHeaders(cfg) {
    return {
        Authorization: 'Bearer ' + cfg.token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
    };
}

function githubApiError(status, body) {
    const err = new Error(githubErrorMessage(status, body));
    err.status = status;
    return err;
}

function fetchExistingFile(cfg) {
    return fetch(githubApiUrl(cfg) + '?ref=' + encodeURIComponent(cfg.branch), {
        headers: githubHeaders(cfg),
    }).then(function (res) {
        if (res.status === 404) return { sha: null, content: '# Kinetic Flow — Screen Notes\n\n' };
        if (!res.ok) return res.json().then(function (body) { throw githubApiError(res.status, body); });
        return res.json().then(function (body) {
            return { sha: body.sha, content: base64ToUtf8(body.content) };
        });
    });
}

function putFile(cfg, content, sha, message) {
    return fetch(githubApiUrl(cfg), {
        method: 'PUT',
        headers: githubHeaders(cfg),
        body: JSON.stringify({
            message: message,
            content: utf8ToBase64(content),
            branch: cfg.branch,
            sha: sha || undefined,
        }),
    }).then(function (res) {
        if (!res.ok) return res.json().then(function (body) { throw githubApiError(res.status, body); });
        return res.json();
    });
}

function githubErrorMessage(status, body) {
    const detail = body && body.message ? body.message : ('HTTP ' + status);
    const docs = body && body.documentation_url ? ' (' + body.documentation_url + ')' : '';
    if (status === 401) return 'GitHub rejected the token (401). Check it in settings (⚙).';
    if (status === 403) return 'GitHub token lacks permission (403): ' + detail + docs + ' — check the token\'s repository access and Contents permission in settings (⚙).';
    if (status === 404) return 'Repo or path not found (404): ' + detail;
    return 'GitHub error: ' + detail + docs;
}

// Appends one note's Markdown to the configured file and commits it. Retries
// once on a 409 (someone/something else updated the file between our GET and
// PUT — refetch the current sha and reapply on top of it).
function commitNoteToGithub(cfg, entry, isRetry) {
    return fetchExistingFile(cfg).then(function (existing) {
        const newContent = existing.content + renderNoteEntryMarkdown(entry);
        const message = 'Add screen note: ' + (entry.app ? entry.app : 'OS ' + entry.screen) + (entry.page ? ' / ' + entry.page : '');
        return putFile(cfg, newContent, existing.sha, message).catch(function (err) {
            if (!isRetry && err.status === 409) return commitNoteToGithub(cfg, entry, true);
            throw err;
        });
    });
}
