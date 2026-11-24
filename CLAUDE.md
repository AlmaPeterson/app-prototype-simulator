# App Prototype Simulator

A static HTML phone-shell prototype ("OS" in `index.html` / `shell.js` / `apps.js`) that hosts several mini-apps.
The main one is **Kinetic Flow** in `apps/kinetic-flow/`: a construction bid / field / inventory app prototype used to
validate flows before the real build (Flutter + Go + Postgres, repo `~/Work/kinetic-flow`).

## Layout (Kinetic Flow)
- `apps/kinetic-flow/app.js`: one big IIFE with state, the mock DB, navigation and logic. `activate()` copies the
  functions page fragments call onto `window`; anything new that a page's inline `onclick` or script uses must be added
  to that `Object.assign(window, {...})` list.
- `apps/kinetic-flow/pages/*.html`: page fragments (no `<html>`/`<body>`), fetched by `loadPage(name)`; their inline
  scripts re-run on every visit, so keep them IIFE-wrapped.
- `apps/kinetic-flow/db/*.json`: seed "tables". `DB.load()` fetches them; edits live in localStorage
  (`kineticFlow.state`). **Bump `DB_VERSION` in app.js whenever a seed file or its shape changes.**
- `apps/kinetic-flow/pricing.js`: the pricing engine, pure functions (`window.KFPricing`, also `module.exports`).
  No DOM, no DB. All bid and change-order money comes from here.
- `apps/kinetic-flow/tests/pricing.html`: browser assertions for the engine (sample numbers from the sheets).
- `docs/`: `kinetic-flow-app.md` (app reference), `kinetic-flow-pages.md` (page by page), the gap analysis, and
  `docs/decisions/` (one short note per meaningful decision).

## Run and verify
No build step. Node is optional.
```bash
python3 -m http.server 8931          # from the repo root; open http://localhost:8931/index.html
```
Pricing tests: open `http://localhost:8931/apps/kinetic-flow/tests/pricing.html` (it prints pass/fail and sets
`data-pass` / `data-fail` on `<body>`). Full recipe for driving the app with Playwright (sign in, open a bid, capture
page and console errors): `.claude/skills/verify/SKILL.md`. Reset state with the header "Reset Data" button or by
clearing `localStorage`. There is no error overlay; always capture `pageerror` and console errors.

## Data rules
- **Privacy (hard rule):** never put real client names, addresses, phones or emails from the shared sheets (or anyone
  real) in the repo. Seed people are fictional: `example.com` emails, `555` phones. Library content that is not personal
  (tasks, materials, kits, rooms, statuses, division text, prices) is fine.
- The library tables mirror six shared Google Sheets: `divisions` (58, LIB-06 CI), `scope_tasks` (LIB-06 tabs),
  `kits` (LIB_02), `materials` (LIB_03, merged into the existing table), `rooms` (LIB-04), `scope_statuses` (LIB-05),
  `customers` (LIB_01 column shape only). `locations` means storage places (shop/truck); rooms are separate.
- Follow the real backend's conventions: `company_id` on every row, `created_at` / `updated_at` in UTC, soft delete via
  `deleted_at`, `sync_status`, UUID-style ids for new tables, money never as float in the real DB (in JSON keep values
  exact to cents; round only for display, and use the engine's `ceilStep` for client prices). Users have
  `status` (pending / approved / rejected); companies have `invite_code`; permissions live on company roles as a
  boolean map and a user's permissions are the union across roles.
- Bid lines reference library rows plus quantity and friction toggles. An unpriced task or material is "needs pricing",
  never $0, and blocks sending.
- Clients never see hours, tiers, kits or internal costs: client views and PDFs are built from `bidProposalModel()` /
  `changeOrderProposalModel()` only.

## Feature flags
`FLAGS` in app.js (header ⋯ menu, "Feature Flags"): `libraryBids` (library pickers; OFF = custom lines only) and
`bidGates` (4-Day Sprint + payment-terms gates; OFF = legacy 50/20/20/10). Both default ON.

## Decisions
Record every meaningful decision as `docs/decisions/NNN-<slug>.md` with: date, decision, why, alternatives considered,
who is affected, when to revisit.

## Library import
The seeds were generated from the sheets with throwaway scripts (not committed: they read private Drive exports).
To refresh after the owner cleans the libraries, re-read the sheets and regenerate `divisions`, `scope_tasks`, `kits`,
`materials`, `rooms`, `scope_statuses`, then bump `DB_VERSION` and rerun `tests/pricing.html`.
