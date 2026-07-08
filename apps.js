// ── Installed Apps Registry ──────────────────────────────────────────────────
// To add a new app to the phone's home screen:
//   1. Create a folder under apps/<id>/ with its own app.js + pages/
//   2. Wrap that app.js in an IIFE (so its state/helpers can't collide with
//      another app's globals — see apps/kinetic-flow/app.js for the pattern)
//      and have it register itself:
//        window.Apps['<id>'] = { activate() {...}, start() {...} }
//      activate() should Object.assign(window, {...}) with just the
//      functions this app's page fragments call via onclick="...". The
//      shell calls activate() every time this app becomes the visible one.
//   3. Add one entry below.
// The shell (shell.js) loads every script listed here and renders one home
// screen icon per entry — no other files need to change.
const APPS = [
    {
        id: 'kinetic-flow',
        name: 'Kinetic Flow',
        icon: '⚡',
        script: 'apps/kinetic-flow/app.js',
    },
    {
        id: 'flavor-hub',
        name: 'Flavor Hub',
        icon: '🍔',
        script: 'apps/flavor-hub/app.js',
    },
    {
        id: 'pulse-notes',
        name: 'Pulse Notes',
        icon: '📝',
        script: 'apps/pulse-notes/app.js',
    },
    {
        id: 'label-designer',
        name: 'Label Designer',
        icon: '🏷️',
        script: 'apps/label-designer/app.js',
    },
    {
        id: 'tool-rentals',
        name: 'ToolYard Rentals',
        icon: '🧰',
        script: 'apps/tool-rentals/app.js',
    },
];
