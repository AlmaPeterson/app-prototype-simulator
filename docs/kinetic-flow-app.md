# Kinetic Flow — App Review & Situation Reference

Reviewed as of 2026-07-02, against the working tree (includes uncommitted changes to
`apps/kinetic-flow/app.js` and `pages/feild-clock.html` adding the Material Log modal).

## 1. What This Is

Kinetic Flow is a **static-data navigation prototype** for a field-service management
app aimed at construction/trades companies (electrical, HVAC, plumbing). It is not a
functioning product — there is no backend, no persistence beyond the current page
session, and most forms don't submit anywhere. Its purpose is to let the team click
through every screen and decision branch a real Kinetic Flow app would have, to
validate structure and flow before building the real thing in Flutter + Go + Postgres.

It now lives inside a small **multi-app phone simulator** (`index.html` / `shell.js` /
`apps.js`) that renders a phone frame with a boot animation, a home screen with app
icons, and a "close app" gesture. Kinetic Flow (⚡) is one of three installed apps on
that home screen, alongside Flavor Hub (🍔) and Pulse Notes (📝) — both unrelated apps
not covered by this doc. Everything below is specific to `apps/kinetic-flow/`.

Run it via a local HTTP server (`python3 -m http.server` from the repo root, or
equivalent) and open `index.html` — page fragments are loaded with `fetch()`, which
doesn't work over `file://`.

## 2. Architecture

- **Shell (`shell.js` + `apps.js`, repo root):** generic OS chrome shared by every
  installed app — boot screen, home screen icon grid, opening/closing apps, phone
  resize, fullscreen. Has zero Kinetic-Flow-specific logic.
- **App (`apps/kinetic-flow/app.js`):** one big IIFE holding all Kinetic-Flow state,
  navigation, and business logic (~790 lines). Registers itself as
  `window.Apps['kinetic-flow'] = { activate, start, onClose }`.
  - `activate()` — called by the shell every time this app becomes visible; copies
    ~40 functions + `state` + `KIT_CATEGORIES` onto `window` so the page fragments'
    inline `onclick="..."` handlers resolve to this app's implementation (not some
    other installed app's same-named function, since every app shares one `window`).
  - `start()` — called once per "launch" (see §4): worker/supplier → `sign-in`;
    customer → `customer-home` directly (no login — see §5).
  - `onClose()` — if you're on `job-detail`/`job-detail-nobid` when you back out to
    the phone's home screen, it downgrades `state.currentPage` to `job-home` first,
    so reopening the app resumes on the lean quick-actions view, not buried in detail.
- **Pages (`apps/kinetic-flow/pages/*.html`, 33 files):** fragments with no
  `<html>/<body>` — `loadPage(name)` fetches one, injects it into `#main`, scrolls to
  top, and **manually re-executes any `<script>` tags** (since `innerHTML` doesn't run
  them per the HTML5 spec). Because these scripts re-run on every visit, each page's
  own inline script is IIFE-wrapped so its top-level `let`/`const` don't collide with
  themselves the second time you navigate there.
- **Bottom nav** lives outside `#main` (`<nav id="bottom-nav">`) so it stays fixed
  while page content scrolls under it. It's rebuilt after every `loadPage()` call.

## 3. Global State

```js
state = {
  accountType: 'existing' | 'new',
  role: 'worker' | 'customer' | 'supplier',
  currentPage: '',
  currentJob: null,          // job name string, set by openJob()
  currentDivision: null,     // 0-based index into bidData.divisions
  currentBranch: null,       // set by openBranch()
  clockInTask: { name, level, isHighHazard } | null,
  scorecardWorker: null,     // worker name string, set by openScorecard()
};
```

Plus two module-level globals that live outside `state`:
- `window.bidData` — the active bid object (see §8). Persists across bid-flow
  navigations but is **wiped every time `openBid()` runs**.
- `clockedIn` / `elapsedSeconds` / `timerInterval` in app.js — the field-clock timer.

None of this survives a full page reload; it's all in-memory JS state.

## 4. Header Controls (always visible, outside the phone)

| Control | Effect |
|---|---|
| Existing / New Account toggle | Sets `state.accountType`, then `launchApp('kinetic-flow')` (jumps straight into the app, marks it "already launched" so reopening later won't re-run `start()`) and loads `sign-in` directly. Does **not** reset the OS shell to the home screen. |
| Worker / Customer / Supplier toggle | Sets `state.role`, then calls the shell's `bootPhone()` — this is a **full reset**: clears `launchedApps`, replays the boot animation, and lands on the home screen. You must tap the Kinetic Flow icon again to re-enter. `currentJob`/`bidData`/etc. are *not* cleared by this, only the phone screen. |
| Mini / Phone / Large / Tablet size presets | Resizes `#phone` to a fixed `w×h`, updates the size label, highlights the matching preset button. |
| Drag grip (bottom-right) | Freehand resize, clamped 280–900 × 420–1100, mouse and touch supported. Deactivates all preset buttons while dragging. |
| Fullscreen button | Drops the header/frame chrome, requests real browser fullscreen (best-effort, failure is swallowed), remembers the pre-fullscreen size to restore on exit. Pressing Esc (browser-native fullscreen exit) is caught by a `fullscreenchange` listener and syncs the CSS state back — exiting via the button and via Esc both resolve to the same place. |

## 5. Top-Level Role Flows

**Worker** (default role): Sign In → Companies → Jobs → Job Detail → ... (full detail
in §6). Bottom nav: Home · Schedule · Field · Kits · More.

**Customer:** *No sign-in step at all.* `start()` special-cases `role === 'customer'`
and loads `customer-home` directly — this simulates "already opened the tokenized
property-record QR link," matching the reference doc's "customers have no accounts"
model. Bottom nav: Home · Schedule · Messages · Stats.

**Supplier:** Sign In → Inventory. Bottom nav: Inventory · Kits · Stats · Finance.

Switching role via the header always goes through the full `bootPhone()` reset
described in §4 — there's no in-app role switch.

## 6. Every Situation, Screen by Screen

### 6.1 Boot / Home Screen (shell, not app-specific)
- On load, all installed apps' scripts are **preloaded** in parallel so header
  controls work immediately, even before any app icon is tapped.
- Tapping an icon: loads that app's script if not already loaded → calls `activate()`
  (always) → calls `start()` **only if this is the first time it's been opened since
  the last boot** (tracked in a `Set`, cleared by `bootPhone()`).
- Tapping the home-indicator bar at the bottom of the phone → `closeApp()` → runs the
  current app's `onClose()` hook (see §2) → shows the home screen. The app's state is
  preserved; reopening it does **not** call `start()` again (unless a boot happened
  in between), so you resume exactly where you left off — modulo the job-detail →
  job-home downgrade.

### 6.2 Sign In (`sign-in.html`)
- Email/password fields are decorative — no validation, both "Sign In" and
  "Continue with Google" call the same `signIn()`.
- `signIn()`: if `state.accountType === 'new'`, opens the **Request Access** modal
  instead of signing in; otherwise proceeds straight to `afterSignIn()`, which routes
  by role (worker → Companies, customer → Customer Home, supplier → Inventory).
- "Request Access" text link at the bottom always opens the sign-up modal, **regardless**
  of the header's Existing/New toggle state — two separate paths reach the same modal.
- "Forgot password?" is a dead link (no `onclick`).

### 6.3 Sign-Up Modal (`sign-up.html`)
- Rendered as an overlay appended directly to `#phone` (not into `#main`), so the dimmed
  sign-in page stays visible behind it.
- No field validation. "Submit Request" closes the modal and calls `afterSignIn()` —
  i.e. it drops you straight into the app as if instantly approved, even though the
  on-screen copy says "Your request will be reviewed... you'll receive an email once
  approved." This is a known gap between copy and behavior.
- "Cancel" or clicking the dimmed backdrop both close the modal without effect.

### 6.4 Companies (`companies.html`) — worker only
- **New account empty state:** if `state.accountType === 'new'`, the company list is
  hidden and a centered "No companies yet" + `+` button is shown instead — this check
  runs in the page's own inline script (`state.accountType`), independent of anything
  server-side.
- Two demo companies: **Kinetic Solutions LLC** (has a "Manage" button → 
  `company-setup.html`) and **ProFlow Industries** (no Manage button — demonstrates
  access-gating by omission; there's no real permission check behind it).
- Tapping anywhere on a company card (other than the Manage button, which stops
  propagation) → `jobs.html`.
- `+` button opens a small dropdown: **Join a Company** → `join-company.html`,
  **Create a Company** → `new-company.html`. Dropdown closes on outside click or after
  either choice.
- **Sign Out** card is deliberately styled red (`#dc2626`) — the one intentional
  exception to the app's otherwise neutral/single-accent color rule — and routes back
  to `sign-in.html`. It does not clear any state (job selection, bid data, etc. all
  persist under the hood; only the visible page changes).

### 6.5 Join / Create Company
- `join-company.html`: three demo company cards toggle a visual "selected" state on
  tap (no real single-select enforcement — multiple could show as selected
  simultaneously). "Send Join Request" always just returns to Companies; nothing is
  actually created or queued.
- `new-company.html`: no validation on any field. "Create Company" always succeeds →
  `company-setup.html`.

### 6.6 Company Setup (`company-setup.html`)
- Position chips (Admin/Manager/.../Apprentice/Dispatcher/Estimator) toggle
  select/deselect visually via `toggleChip()` — purely cosmetic.
- "+ Add" buttons next to Positions and Branches have **no `onclick` handler at all**
  — completely inert.
- Two branch cards: Calgary HQ (Primary badge) and Edmonton Branch. Tapping either
  (outside the Edmonton card's "Remove" link) → `branch-detail.html`. "Remove" on
  Edmonton stops propagation and does nothing else — inert.
- Permission toggle switches (3 rows) are plain styled `<div>`s with no `onclick` —
  inert; two render visually "on" (blue) and one "off" (gray) but clicking them
  changes nothing.
- Invite textarea has no submit action of its own.
- "Continue to Jobs →" and "Skip for Now" both call the same `continueFromSetup()` →
  `jobs.html`. There is no functional difference between them.

### 6.7 Branch Detail (`branch-detail.html`)
- Reads `state.currentBranch` (set by `openBranch(name)` in company-setup.html) and
  looks up one of two hardcoded records (`BRANCH_DATA['Calgary HQ']` /
  `['Edmonton Branch']`); **falls back to Calgary HQ** if the name isn't recognized —
  can't currently happen since only those two names are ever passed in, but note this
  as the default-on-miss behavior if a third branch is ever added without a matching
  data entry.
- "View Jobs at This Branch" / "View Finance for This Branch" both navigate to the
  generic `jobs.html` / `finance.html` — neither is actually filtered to the branch.

### 6.8 Jobs List (`jobs.html`) — worker
- Bottom nav is **hidden** on this page (`'jobs'` is intentionally excluded from
  `mainAppPages`) — it only reappears once a job is selected.
- "← Companies" back button, `+` button → `create-job.html`, search bar is decorative
  (no filtering logic).
- 4 static demo jobs, each routed through `openJob(name)`:
  - **Riverside HVAC Retrofit**, **Northview Plumbing**, **Summit Commercial Wiring**
    → `job-detail.html` (has a bid).
  - **Westgate Electrical Panel** → `job-detail-nobid.html` (the one entry in the
    `NO_BID_JOBS` array in app.js).
  - ⚠️ **`job-detail.html`'s content is entirely hardcoded to "Riverside HVAC
    Retrofit"** — tapping Northview or Summit still shows Riverside's header, price,
    team, and progress bar. Only `job-home.html` (the "Home" tab landing page) is
    actually dynamic per `state.currentJob`.

### 6.9 Job Home (`job-home.html`) — the dynamic per-job landing page
- Title/subtitle and the "View Bid" vs "+ Create Bid" button label are computed live
  from `state.currentJob` and whether it's in `NO_BID_JOBS`.
- "Clock In / Out" → `openFieldClock()` → `task-select.html` (full gate chain, §6.12).
- Quick actions: Schedule, Kits, View/Create Bid, Time Sheet — all generic pages, none
  scoped to the current job beyond the bid button's label.
- "Full Job Details" card → `openJob(state.currentJob)` → re-routes through the same
  bid/no-bid check into `job-detail.html` or `job-detail-nobid.html`.

### 6.10 Job Detail — With Bid (`job-detail.html`)
- Entirely static (see the ⚠️ note in §6.8). Shows progress bar (65%), Estimated
  Value/Labour/Materials, two team rows (Jake Smith "Clocked In", Amy Chen "Off Site"),
  and two JIT training cards.
- Tapping a **team member row** → `openScorecard(name)` → `scorecard.html` (§6.16).
  Both Jake and Amy route to the same scorecard page; only the displayed name differs.
- "View Bid" (section action) and Bid & Finance quick-action → `openBid()`.
- Both JIT training cards route to `feild-clock.html` regardless of Done/Pending
  status — not actually gating anything from here.
- "Clock In" quick action skips the task-select flow entirely and goes straight to
  `openFieldClock()` → task-select (same as job-home's button — this is the flow
  entry point, not a bypass).

### 6.11 Job Detail — No Bid (`job-detail-nobid.html`)
- Static Westgate Electrical Panel content. Big centered CTA: "No Bid Created" → 
  "+ Create Bid" → `openBid()`.
- Other actions (Schedule, Kits, Field Clock) same as the bid version.
- Job Info list shows "Unassigned" team and a Notes alert box — no interactivity.

### 6.12 Create Job (`create-job.html`)
- No validation on any field.
- "Create Bid with this Job?" select (`later` default / `now`) branches
  `handleCreateJob()`: `now` → `openBid()` (jumps straight to a **fresh** bid, wiping
  any previous `bidData`); `later` → `submitJob()` → back to `jobs.html`.
- Neither path actually adds the new job to the jobs list — `jobs.html` is fully
  static, so a "created" job never appears there.

### 6.13 Clock-In Gate Chain (task-select → training-video → co-sign/PPE → field clock)

This is the most branch-heavy flow in the app, simulating the reference doc's
JIT-training/competency system. **Only reachable via `openFieldClock()`** (job-home's
"Clock In/Out" button or job-detail's "Clock In" quick action) — the bottom-nav
**Field** tab bypasses all of it and loads `feild-clock.html` directly, for checking
an already-active session rather than starting a new one.

1. **`task-select.html`** — 3 hardcoded demo tasks, each calling
   `selectClockInTask(name, level, isHighHazard)`:
   - *Air Handler Install* — `mastery`, `isHighHazard: true`
   - *Ductwork Sealing* — `competent`, not hazardous
   - *Refrigerant Handling* — `exposure`, not hazardous
2. **`training-video.html`** — unskippable; Continue button stays `disabled` for a
   hardcoded 3-second `setTimeout` (simulating a training video), then
   `trainingVideoComplete()` branches on `state.clockInTask.level`:
   - **`mastery`** → `proceedPastGates()` directly.
   - **`competent`** → opens the **Master Co-Sign** modal. "Confirm Master Co-Sign" →
     closes modal → `proceedPastGates()`. "Cancel" or backdrop click just closes the
     modal, leaving the user stuck on the training-video page (no further action
     available except backing out via bottom nav or the app doesn't offer a retry
     button here).
   - **`student` / `exposure`** → the Continue button is replaced with "Back to Job"
     (→ `job-home`) and status text reads "Not cleared to perform this task solo yet."
     This is a dead end by design — the worker cannot clock in on this task.
3. **`proceedPastGates()`** — the single chokepoint for "cleared, but is this task
   high-hazard?" logic:
   - `isHighHazard: true` → `ppe-video.html`.
   - otherwise → `feild-clock.html` directly.
4. **`ppe-video.html`** (only reached for Air Handler Install in the demo data) —
   "Record PPE Video" button disables itself, shows "Recording…" for 1.2s, then
   re-enables as "Re-record" and unlocks "Continue to Clock In" → `feild-clock.html`.
   Re-recording is allowed any number of times before continuing.

### 6.14 Field Clock (`feild-clock.html`)
- **Clock In:** immediate — no gate. Sets timer running (`tickTimer()` every second,
  `HH:MM:SS`), resets `elapsedSeconds`, and **unchecks all 3 clock-out gate
  checkboxes** (materials logged / kit photo uploaded / site cleanliness confirmed).
- **Clock Out:** blocked by an `alert()` unless all 3 gate checkboxes are checked.
  Once satisfied, stops the timer and flips the button back to "Clock In."
- **Record Activity** buttons: Driving / Lunch / Task each call `addActivity(type)`,
  which just prepends a new log entry with a start timestamp and a permanent "Active"
  badge — there is no way to stop/close one of these entries, no duration tracking,
  and clicking the same button repeatedly just piles up more "Active" entries. This is
  clearly a simulated placeholder, not real time-tracking.
- **Material button** → `openMaterialLog()` (new, currently uncommitted feature — see
  §9): opens a bottom-sheet modal listing 3 hardcoded "checked out for this job" kits
  (HVAC Kit, Copper Kit, Miscellaneous Electrical — looked up live from the shared
  `KIT_CATEGORIES` catalog so text never drifts from the Kits browser) with a numeric
  qty input per material.
  - "Log Materials" requires at least one qty > 0, else `alert()`s and stays open.
  - On success: prepends one activity-log entry per non-zero material, **auto-checks
    the "Materials logged" gate checkbox**, and closes the modal.
  - "Cancel" or backdrop click closes without saving anything.
- JIT Training cards here are static/inert except "Refrigerant Handling," whose
  `onclick` is a placeholder `alert('Open training module')` — not connected to the
  real gate chain in §6.13.
- "Submit Timesheet" → `review-time.html`.

### 6.15 Time Sheet (`review-time.html`)
- Entirely static demo data (hours, activity summary, materials list). Notes textarea
  has no persistence. "Submit Timesheet" → `scoreboard.html`. "Save Draft" → back to
  `feild-clock.html`. Neither actually saves anything.

### 6.16 Scoreboard / Scorecard
- **`scoreboard.html`** — static leaderboard + personal stats. The Monthly/Weekly/All
  Time tab bar has no `onclick` wiring — only "Monthly" is ever shown active; clicking
  the other tabs does nothing.
- **`scorecard.html`** (manager grading a worker, opened from a team-member row in
  `job-detail.html`) — fully interactive scoring, entirely local to the page's own
  inline script (no persistence beyond the page's lifetime):
  - Header shows `state.scorecardWorker`'s name (falls back to "Jake Smith" if unset).
  - Total starts at **4** (a fixed, non-interactive "Production Speed — auto-calc
    demo value").
  - 4 binary toggles: **Job Well Done** (0 or +55, the single biggest swing factor),
    **Material Accountability**, **Tool Discipline**, **Site Cleanliness** (each +5).
  - 5 character sliders (0–5 each, default 3): Initiative, Habitual Safety, The
    Constructive Heart, Disposition to Learn, Elite Character.
  - Total recalculates live on every toggle/slider change; max possible = 100
    (4 + 55 + 5+5+5 + 5×5 = 99, so the displayed "/100" is never quite reachable with
    the fixed 4-point Production Speed baseline — worth flagging if this scoring
    model gets built for real).
  - "Submit Scorecard" → back to `job-detail.html`; the score is discarded, not stored
    anywhere.

### 6.17 Bid System (`bid.html` → `bid-division.html` → `bid-proposal.html`)

The most data-heavy part of the app — mirrors the real "R6 Bid Packet" Google Sheet
template (40-division CSI-style checklist).

- **`openBid()`** (called from job-home's/job-detail's "View Bid"/"Create Bid" and
  from create-job's "Yes, take me to bid creation") **always sets
  `window.bidData = null` before navigating to `bid.html`.** This means: if you leave
  the bid flow (back to job-detail) and tap "View Bid" again, **any edits you made are
  discarded** and `bid.html` reseeds its hardcoded demo bid from scratch. Only staying
  *within* the bid flow (bid ↔ bid-division ↔ bid-proposal, none of which call
  `openBid()` again) preserves in-progress edits.
- **`bid.html`** on first load with no existing `bidData`: seeds a full 40-division
  array from a hardcoded `NAMES` list (Planning/Design through Furnishings), all
  blank/unchecked, then pre-fills 3 divisions with real demo task data — **Division 22
  (Finish Carpentry — Phase 2)**, **Division 23 (Painting)**, **Division 32 (Floor
  Coverings — Phase 2)** — plus a header (project "Westgate Electrical Panel",
  customer Jordan Blake, craftsman Alex Rivera, etc.).
  - Every header field is a bound `<input>` — typing updates `window.bidData` live via
    `input` listeners (no explicit "save").
  - Each of the 40 division rows has a checkbox; toggling `included` re-renders the
    list and recalculates. When included, an "Edit Division Sheet →" button appears
    (`openDivision(i)` → `bid-division.html`) plus a live task count if the division
    already has tasks.
  - Grand Total and the 4-row Schedule of Payments (50% deposit / 20% draw 1 / 20%
    draw 2 / 10% final) recalculate from the sum of all included divisions' totals.
  - Formula per division: `total = labor + materials + labor×0.10 + materials×0.10`
    (10% contingency on both labor and materials), where a task only contributes if
    `task.included` is true.
  - "Preview Proposal →" → `bid-proposal.html`. "Save Draft" → `openJob(state.currentJob)`
    (back to job-detail/nobid) — this is a real navigation, not an actual save
    (there's nothing further to save; `bidData` is already live-bound).
- **`bid-division.html`** — full editor for one division (`state.currentDivision`
  indexes into `bidData.divisions`):
  - Labor Rate and Guys on Site inputs recalc everything live.
  - Task cards are fully inline-editable (category, name, scope, qty type
    `SF/LF/C/EA/HR`, qty, hrs/each) with per-task include toggle, add/remove task,
    and add/remove material (item/supplier/price/qty) all wired to mutate
    `window.bidData` directly (no separate "save" step — `saveDivision()` just
    navigates back to `bid.html`, whose re-render picks up the already-mutated data).
  - Days calc: `Math.ceil(totalHours / (8 × guysOnSite))`.
  - Removing the last task shows an empty state with "+ Add First Task."
- **`bid-proposal.html`** — read-only client-facing document (Building Forward LLC
  letterhead, legal boilerplate, dual signature blocks).
  - If `window.bidData` is somehow null when this page loads, shows a red inline error
    ("No bid data. Go back and create a bid first.") instead of a proposal — can't
    normally happen since this page is only reached via `previewProposal()` from
    `bid.html`, which always has `bidData` set by then.
  - If zero divisions are included: "No divisions selected" placeholder instead of a
    line-item list.
  - Milestone descriptions for Progress Draw 1/2 fall back to a blank underscore line
    if the corresponding `milestone1`/`milestone2` field was left empty.
  - "Send to Customer" → `alert('Send flow not wired in prototype.')` — explicitly a
    stub. "← Back to Bid Creation" → `bid.html` (does not clear `bidData`).

### 6.18 Kits & Tools (`kits.html`)
- Browse-only UI over the shared `KIT_CATEGORIES` catalog (13 categories, ~118 kits,
  each with `tools[]`/`materials[]` arrays — defined once in app.js, exposed via
  `activate()` so it never drifts out of sync between this page and the label
  generator).
- Hamburger button opens a slide-out drawer of categories; tapping a category expands
  it in place to list its kits; tapping a kit selects it, closes the drawer, and
  renders a detail view (Tools list, Materials list, and a single "Overview" video
  card whose `onclick` is a placeholder `alert('Training video placeholder')`).
- Search box filters across **all** kits by name (not scoped to the expanded
  category), rendering a flat results list with each kit's parent category as a
  subtitle; typing a query clears any current kit selection, and selecting a kit
  clears the query.
- Before any kit is selected: "No kit selected" empty state with a "Browse
  Categories" button that just reopens the drawer.
- "Generate Labels" button (top of page) → `label-generator.html`.

### 6.19 Label Generator (`label-generator.html`)
- Same category/kit tree as Kits, but every kit and every individual tool/material row
  gets its own checkbox; a kit-level checkbox selects the *whole kit* as **one**
  label, independent of selecting its individual tools/materials as separate labels
  (no cascade logic between the two — checking the kit does not auto-check its items,
  and vice versa).
- Selections are stored in a `Map` keyed by a composite id (`K|ci|ki` for kits,
  `T|ci|ki|i` / `M|ci|ki|i` for individual items) so expand/collapse state doesn't
  lose selections, and the footer's "N labels selected" count updates live.
- Search behaves like Kits' search but with checkboxes; selecting a kit from search
  results ("jump to kit") scrolls the main tree to that kit and expands it in place.
- "Clear" empties the whole selection with no confirmation.
- "Generate PDF" (`generateLabelsPDF()`):
  - Guards: 0 selected → `alert()` and stop. `window.jspdf` not loaded (the jsPDF CDN
    `<script>` in `index.html` failed, e.g. offline) → `alert()` and stop.
  - Otherwise builds a client-side PDF via jsPDF: 3 columns × 10 rows = 30 labels per
    letter-size page (Avery-5160-style), auto-paginating for more than 30 selections,
    each label bordered with the item text centered (word-wrapped via
    `splitTextToSize`) and a small "Building Forward LLC" footer line. Downloads as
    `kit-labels.pdf`.
  - **Historical gotcha (already fixed, worth knowing):** item names containing a
    literal `"` (e.g. `1/2" Chisel`) previously broke inline `onclick` handlers built
    with `JSON.stringify()`, because HTML attribute parsing doesn't respect backslash
    escaping — the browser would truncate the attribute at the literal quote and throw
    "Unexpected end of input." The current code passes only numeric indices through
    `onclick` attributes and looks up the real text from the data array inside the
    handler — don't reintroduce string-stuffed `onclick` attributes here.

### 6.20 Inventory (`inventory.html`) — supplier / worker
- Fully static stock list + low-stock alert section + category tab bar (only "All" is
  ever actually active — the HVAC/Electrical/Plumbing tabs have no `onclick`).
  Search bar is decorative. "+ Add" → `alert('Add inventory item form')` stub.

### 6.21 Finance (`finance.html`) — manager / supplier
- Tier tab bar (Nationwide / Branch / Job) — `selectFinanceTier(tier)` swaps the
  subtitle, hero stat, and 4 stat-cards between 3 fully static datasets. The
  Outstanding Invoices and Expense Breakdown sections below **do not change** across
  tiers — deliberate simplification, not a bug (per project notes: not worth tripling
  the static line-item data for a nav prototype).
- A second, unwired tab bar (Overview / Invoices / Expenses) only ever shows
  "Overview" active — no `onclick` on the other two.
- "Export Report" button has no `onclick` — inert.

### 6.22 Stats (`stats.html`) — all roles
- Fully static: This Month/Quarter/Year tab bar is unwired (only "This Month" active),
  job-type breakdown bars, team performance rows, and customer satisfaction stats are
  all hardcoded numbers. "Scoreboard" section-action link → `scoreboard.html`.

### 6.23 Customer Home (`customer-home.html`)
- Static property-record view (2 active jobs, upcoming visits). Tapping the Riverside
  job card → `job-detail.html` (same static Riverside content noted in §6.8/§6.10 —
  happens to match here since the demo data is consistent).
- Built-in mini chat with a single technician (Jake Smith): typing + Enter-equivalent
  send button (`sendMessage()`) clears the input and flashes a "Message sent!" banner
  for 2.5s if the message isn't blank; three quick-reply chips just pre-fill the input
  text (they don't auto-send). This chat is **independent of** the separate
  `messages.html` conversation UI (§6.24) — neither reads the other's state, and
  nothing here persists across navigation.

### 6.24 Messages (`messages.html`) — customer bottom nav
- 3 static conversation-list cards (Riverside Properties, Summit Corp, Northview
  Dev.), each with an unread-count badge on two of them. Tapping any card →
  `showConversation(name)`, which reveals a single shared inline chat panel below the
  list (not a per-conversation history — switching between conversations just
  relabels the same panel and re-shows the same 2 hardcoded demo messages every time).
  `sendConvoMsg()` appends a new outgoing bubble locally; nothing is sent anywhere or
  retained if you navigate away and back.

### 6.25 Schedule (`schedule.html`) — worker / customer
- Mon–Fri are hardcoded with static job slots (Sat/Sun chips exist but there's no
  Saturday/Sunday content block — selecting those days visually highlights the chip
  but **the job list below does not filter by selected day at all**; every day's
  block is always shown, stacked, regardless of which chip is active). Thursday shows
  a "Holiday — No jobs scheduled" placeholder.
- Tapping a job slot → `openJob(name)` (same routing/bid-check as the jobs list).
- Left/right week-navigation arrows have no `onclick` — inert.
- "+ Add" → `alert('Create schedule entry — form would open here.')` stub.

### 6.26 More Menu (`more.html`) — worker
- Nav hub: Scoreboard, Task Statistics, Finance Dashboard, Customer Summary (all real
  navigations), Company & Branches (→ `companies.html`), Stock Inventory
  (→ `inventory.html`), a **Sabbath Lock preview** card, and the same red Sign Out
  card pattern as Companies.
- **Sabbath Lock** (`showSabbathLock()`/`hideSabbathLock()`): a manually-triggered
  full-screen overlay simulating the reference doc's real Sunday-midnight server
  lockout. There is no actual date/cron check anywhere in the app — this is purely a
  visual preview, entered and exited only from this one card, and doesn't block
  anything else in the app while open (you could theoretically navigate underneath it
  if you knew the function names, but there's no UI path to do so).

## 7. Error / Fallback Paths

- **Unknown page name in `loadPage()`:** the `fetch()` `.catch` renders an inline
  `<div class="page"><div class="alert">Page "X" not found.</div>` block with a
  "← Back" button wired to `goBack()`.
- **`goBack()` is hardcoded to `loadPage('jobs')`** regardless of role or context —
  this only matters today if a typo'd page name is ever introduced (there are no
  currently-reachable dead links), but it means a future broken link on a
  customer/supplier screen would "recover" into the worker-only Jobs page, which
  assumes a worker/company context.
- **`branch-detail.html`** falls back to Calgary HQ's data if `state.currentBranch`
  doesn't match a known key (see §6.7).
- **`bid-proposal.html`** shows a red inline error if `window.bidData` is null (see
  §6.17) — theoretically unreachable via the current UI, but the check exists.
- **Label generator PDF button** guards both "nothing selected" and "jsPDF failed to
  load" with `alert()`s rather than failing silently or throwing.

## 8. Shared Data Model

- **`KIT_CATEGORIES`** (app.js): 13 categories (Drywall, Doors & Hardware, Framing,
  Finish Carpentry, Flooring & Tile, Painting, Plumbing, Electrical, Fixtures & HVAC,
  Fasteners & Hardware, Tools, Drill Bits & Sanding, Safety & Cleanup) → ~118 kits,
  each `{ name, tools: [], materials: [] }`. Defined once, shared by `kits.html`,
  `label-generator.html`, and (new) the Material Log modal's `getCheckedOutKits()` —
  intentionally centralized so the three consumers never drift out of sync (page
  fragments' inline scripts re-run on every visit; app.js loads once per app
  lifetime).
- **`window.bidData`**: `{ date, expires, bidNumber, project, customer, craftsman,
  address, phone, email, startDate, procurementDays, constructionDays,
  completionDate, milestone1, milestone2, divisions: [40 × { name, included, scope,
  laborRate, guys, tasks: [{ category, name, included, scope, qtyType, qty, hrsEach,
  materials: [{ item, supplier, price, qty }] }] }] }`. Lives on `window` (not
  `state`) specifically so it survives navigation between the three bid pages without
  needing to be threaded through every `loadPage()` call — but see the "wiped by
  `openBid()`" gotcha in §6.17.
- **`NO_BID_JOBS`**: single-element array (`['Westgate Electrical Panel']`) controlling
  which job name routes to `job-detail-nobid.html` instead of `job-detail.html`.

## 9. In-Progress / Uncommitted Work

As of this review, `git status` shows uncommitted changes to `apps/kinetic-flow/app.js`
and `apps/kinetic-flow/pages/feild-clock.html`: the **Material Log modal**
(`openMaterialLog()` / `closeMaterialModal()` / `saveMaterialLog()`, §6.14). The old
"Material" activity button used to just call the generic `addActivity('material')`
(a plain timestamp log entry like Driving/Lunch/Task); it's been replaced with a real
picker scoped to 3 hardcoded "checked out" kits, sourced live from `KIT_CATEGORIES`,
that logs specific quantities and auto-satisfies the clock-out gate's "Materials
logged" checkbox. This is not yet committed to git.

## 10. Known Prototype Limitations (by design or as-yet-unwired)

- All data is static/dummy — no real backend, no data binding, nothing persists past
  the in-memory session (a full page reload resets everything).
- `job-detail.html` shows fixed "Riverside HVAC Retrofit" content no matter which job
  was tapped; only `job-home.html` is genuinely per-job.
- `openBid()` unconditionally discards `window.bidData` — re-entering the bid flow
  from outside it (rather than navigating within bid ↔ bid-division ↔ bid-proposal)
  loses all edits.
- Several tab bars (Scoreboard's Monthly/Weekly/All Time, Stats' Month/Quarter/Year,
  Finance's Overview/Invoices/Expenses, Inventory's category tabs) render a
  hardcoded-active first tab with no click handling on the others.
- Several buttons are intentional stubs: "Send to Customer" (bid-proposal), "Export
  Report" (finance), "+ Add" (inventory, company-setup positions/branches), schedule's
  week-nav arrows and "+ Add," JIT-training "Refrigerant Handling" card on
  field-clock.
- Company-setup's permission toggles and position "+ Add" have no wiring at all.
- Scorecard's max achievable total is 99, not the "/100" the header displays (fixed
  4-pt Production Speed baseline + 55 + 5+5+5 + 5×5).
- Schedule's day-of-week chip selector doesn't filter the job list.

## 11. Design Rule Worth Knowing

Page fragments under `apps/kinetic-flow/pages/*.html` intentionally use **minimal
styling**: plain `1px solid #e2e8f0` borders, white/neutral backgrounds, muted
grayscale text, and a single blue accent (`#2563eb`) reserved for interactive/primary
elements (buttons, active nav tab, focus rings, selected chips). No emojis, no
colored badges, no gradients within page content — the one deliberate exception is
the red Sign Out card (`#dc2626`) on `companies.html` and `more.html`. This rule does
**not** extend to the phone's OS chrome (boot/home screens, resize grip, app icons),
which already used gradients/glyphs before this rule was adopted. Real visual design
is expected to replace this neutral placeholder once the team moves into actual UI
development.
