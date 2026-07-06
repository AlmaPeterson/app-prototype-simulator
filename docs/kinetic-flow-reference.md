# Kinetic Flow — Developer Reference

Accurate as of 2026-07-06. For deep architectural narrative see `kinetic-flow-app.md`
(older; some details there predate the mock-DB refactor).

## What it is

A **clickable prototype** of Kinetic Flow: a field-service management app for
construction/trades companies (jobs, bids, clock-in, timesheets, tool kits,
scorecards, finance, customer proposals/invoices). It exists to validate screens
and navigation flows before the real build (planned: Flutter + Go + PostgreSQL).

It is **not a product**: no server, no real auth, no real payments/SMS/video.
All data is a mock database seeded from JSON files and persisted only to
`localStorage`.

## How to run

```
python3 -m http.server   # from repo root
```

Open `index.html`. Must be served over HTTP — pages load via `fetch()`, which
fails on `file://`. The site also deploys as-is to GitHub Pages (fully static).

## Where it lives

The repo is a **multi-app phone simulator**. `index.html` + `shell.js` + `apps.js`
render a phone frame (boot screen, home screen, back/home buttons, resizing) and
know nothing about Kinetic Flow. Everything Kinetic-Flow-specific is in:

```
apps/kinetic-flow/
  app.js     All state, navigation, business logic. One IIFE, registered as
             window.Apps['kinetic-flow']; activate() exposes its public
             functions on window for the pages' inline onclick handlers.
  pages/     ~40 HTML fragments (no <html>/<body>) fetched into the phone's
             #main div. Inline <script>s are re-executed manually on each load.
  db/        ~40 JSON "tables" (users, jobs, bids, time_entries, kits, …).
             Seed data only — never written back to.
```

## Data layer (mock DB)

`app.js` loads every `db/*.json` table into memory once, then all reads/writes
hit the in-memory copy. `saveState()` snapshots mutated tables + app state into
`localStorage` (`kineticFlow.state`), so reloads resume where you left off.
Locally created rows get `local-…` ids from `genId()`. `resetDemoData()` clears
the snapshot and re-seeds from the JSON files.

## Roles and entry points

The phone header has an **Existing/New Account** toggle and a **Worker /
Customer / Supplier** role selector (prototype-only controls, not app UI):

- **Worker** — sign in → companies list → jobs → job home (bottom nav: Home,
  Schedule, Field, Kits, More). Demo login: `j.smith@kineticsolutions.com`,
  any password.
- **Customer** — no sign-in; lands directly on `customer-home` (simulates
  opening a tokenized property-record link — customers have no accounts).
  Nav: Home, Bid, Invoice, Schedule.
- **Supplier** — sign in → inventory. Nav: Inventory, Kits, Stats, Finance.

Within a company, `user_roles` grants **admin**/**manager** permissions
(approvals, team timesheets, scorecards, finance tiers).

## Main flows

- **Accounts** — sign-up requests and company join requests go to a pending
  state; an admin approves them on `admin-approvals.html`.
- **Companies** — join or create a company; setup covers branches, positions,
  divisions, levels, competency levels.
- **Jobs & bids** — create a job; jobs without a bid route to a "Create Bid"
  page. The bid builder (`bid.html` → per-division `bid-division.html` →
  `bid-proposal.html`) mirrors the real R6 Bid Packet spreadsheet: 40-division
  checklist, labor/materials per task, 10% contingency, 50/20/20/10 payment
  schedule. Customers see the result on `customer-bid.html` / `customer-invoice.html`.
- **Clock-in gate chain** — `task-select` → unskippable training video →
  branches on the worker's competency for that task (mastery passes; competent
  needs a co-sign; student/exposure blocked) → PPE video if high-hazard →
  `feild-clock.html` (note the filename typo is load-bearing). Clock-out is
  gated by a materials/kit-photo/cleanliness checklist.
- **Timesheets** — worker submits weekly time (`review-time`); a submitted
  timesheet requires the manager to fill a **Workman Scorecard** (100-point
  grading) which feeds Guild-rank progression; managers review team time and
  "send to QuickBooks" (simulated) on `team-time.html`.
- **Kits & labels** — Google-Drive-style browser of trade-categorized tool/
  material kits; `label-generator.html` produces a real Avery-5160 PDF
  client-side via jsPDF.
- **Finance** — static dashboards with Nationwide/Branch/Job tiers, permission-
  gated per role.
- **Message templates** — canned texts that hand off to the phone's own SMS app
  (`sms:` links). There is deliberately **no in-app messaging**; customers must
  never see anything texting-related.

## Conventions that will bite you

- Page fragments must not contain `<html>/<head>/<body>`; shared data/helpers
  live in `app.js`, never duplicated across pages (fragments' scripts re-run on
  every visit — wrap their state in an IIFE).
- Styling is deliberately minimal: neutral grays, `#2563eb` as the single
  accent, no emojis/badges/gradients inside `pages/*.html`. (Exception: red
  Sign Out button.) Real styling comes later.
- Never build inline `onclick` attributes from strings containing quotes
  (`JSON.stringify` breaks HTML attribute parsing) — pass indices, look up data
  in the handler.
