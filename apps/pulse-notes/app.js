// ── Pulse Notes App ──────────────────────────────────────────────────────────
// Small self-contained notes demo app. Exists to give the home screen a
// third icon to arrange in the grid — see apps/kinetic-flow/app.js for the
// fuller reference implementation of the same window.Apps pattern.
(function () {
let nextId = 3;
const state = {
    tab: 'notes',   // 'notes' | 'trash'
    notes: [
        { id: 1, text: 'Pick up the grid layout review notes.' },
        { id: 2, text: 'Try the app switcher with 3+ icons installed.' },
    ],
    trash: [],
};

function addNote() {
    const text = prompt('New note:');
    if (!text) return;
    state.notes.unshift({ id: nextId++, text });
    render();
}

function deleteNote(id) {
    const idx = state.notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const [note] = state.notes.splice(idx, 1);
    state.trash.unshift(note);
    render();
}

function restoreNote(id) {
    const idx = state.trash.findIndex(n => n.id === id);
    if (idx === -1) return;
    const [note] = state.trash.splice(idx, 1);
    state.notes.unshift(note);
    render();
}

function switchTab(tab) {
    state.tab = tab;
    render();
}

function renderNotes() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Notes</div>
                <div class="page-subtitle">${state.notes.length} note(s)</div>
            </div>
            <button class="btn btn-primary" onclick="pnAddNote()">+ New Note</button>
            ${state.notes.map(n => `
                <div class="card card-row">
                    <div class="card-body"><div class="card-subtitle">${n.text}</div></div>
                    <button class="btn btn-secondary btn-sm" onclick="pnDeleteNote(${n.id})">Delete</button>
                </div>
            `).join('')}
        </div>
    `;
}

function renderTrash() {
    return `
        <div class="page">
            <div class="page-header">
                <div class="page-title">Trash</div>
                <div class="page-subtitle">${state.trash.length ? state.trash.length + ' deleted note(s)' : 'Nothing here.'}</div>
            </div>
            ${state.trash.map(n => `
                <div class="card card-row">
                    <div class="card-body"><div class="card-subtitle">${n.text}</div></div>
                    <button class="btn btn-outline btn-sm" onclick="pnRestoreNote(${n.id})">Restore</button>
                </div>
            `).join('')}
        </div>
    `;
}

function render() {
    const main = document.getElementById('main');
    main.innerHTML = state.tab === 'trash' ? renderTrash() : renderNotes();
    main.scrollTop = 0;
    updateBottomNav();
}

function updateBottomNav() {
    const tabs = [
        { key: 'notes', icon: '📝', label: 'Notes' },
        { key: 'trash', icon: '🗑️', label: 'Trash' },
    ];
    document.getElementById('bottom-nav').innerHTML = tabs.map(t => `
        <button class="nav-tab ${state.tab === t.key ? 'active' : ''}" onclick="pnSwitchTab('${t.key}')">
            <span class="nav-tab-icon">${t.icon}</span>${t.label}
        </button>
    `).join('');
}

// ── App Registration ────────────────────────────────────────────────────────
function activate() {
    Object.assign(window, {
        pnAddNote: addNote,
        pnDeleteNote: deleteNote,
        pnRestoreNote: restoreNote,
        pnSwitchTab: switchTab,
    });
}

window.Apps = window.Apps || {};
window.Apps['pulse-notes'] = {
    activate: activate,
    start: function () { render(); },
};
})();
