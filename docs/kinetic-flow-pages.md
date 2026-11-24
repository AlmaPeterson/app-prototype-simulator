# Kinetic Flow — Page Reference

Accurate as of 2026-08-12. One entry per file in `apps/kinetic-flow/pages/`.
Each entry says what information the page shows, what you can edit, and what
actions you can take. All data comes from the in-memory mock DB (seeded from
`db/*.json`, persisted to localStorage); "saves" below mean DB writes in that
sense — nothing hits a server.

---

## Auth & Account

### sign-in.html
- **See:** App title, email + password fields, "Forgot password?" link, Sign In button, "Continue with Google" button, "Request Access" link. Focusing the email field opens an account-picker dropdown listing every existing account (name, a role · guild-level pill, email); typing filters by name, email, or position.
- **Edit:** Email (type it or pick an account from the dropdown, which just fills the field; Enter in the field submits) and password (password is not checked; the email must match a real account — demo accounts are role-named: `master@kineticflow.com`, `supplier@kineticflow.com`, etc.).
- **Do:** Sign In / Google (both call `signIn()`; a pending-approval email routes to account-pending; an empty or unknown email shows an inline error and does **not** sign in — no demo fallback). "Request Access" opens the sign-up sheet (the only path to a new account — the old header Existing/New Account toggle is gone).

### sign-up.html (bottom-sheet modal over sign-in)
- **See:** "Request an Account" form and a note that an admin reviews requests and can adjust the granted position.
- **Edit:** First/last name, email, phone, requested position (dropdown of the company's real roles — Admin/Manager/Employee/Supplier — filled by `showSignUp()` since injected fragments' scripts never run), notes.
- **Do:** Submit Request — creates a `users` row with `approval_status: 'pending'` (the note saved as `request_note`) plus a pending `user_roles` row holding the requested position, and lands on account-pending. Cancel closes the sheet.

### account-pending.html
- **See:** "Request Sent" confirmation; explanation that an admin must approve the account.
- **Edit:** Nothing.
- **Do:** Back to Sign In.

---

## Company (single-company model)

> **Single-company refactor (2026-07-13):** Kinetic Flow is built for one
> company; branches are the only org structure. The company picker
> (companies.html), join-company, new-company, and the platform-admin
> account (admin@gmail.com) with its admin-approvals page are all gone.
> Signing in lands straight on Jobs (Inventory for supplier-role users).
> "Admin" is not an account type — it's the `manage_users` permission on
> whatever position (or per-member override) a user holds. Anyone with it
> gets a **Manage Users** entry in the ⋯ menu plus a red dot on the ⋯
> button (and a count pill on the menu row) whenever sign-up requests are
> pending.

### manage-users.html (⋯ menu → Manage Users; gated by the manage_users permission)
- **See:** Account Requests (pending sign-ups: name, email/phone, note, a position dropdown prefilled with what they requested — Employee when they didn't pick); position chips; branch cards (name, address, Primary badge); Company Configuration: Bid Divisions card plus the fixed Guild/Competency ladders (badged "Fixed"); a Permissions list summarizing each position's finance access / manage-users / manage-bids; Team Members list (name, position, branch — pending accounts excluded).
- **Edit:** Everything above through bottom-sheet panels:
  - Position panel (+ Add or tap a chip/permission row): name, finance access (none/job/branch/nationwide, stored as three booleans), manage-users and manage-bids toggles (roles hold a `map[string]bool`; a user's permissions are the union of their roles); Remove Position (blocked-with-confirm if members hold it; admin can't be removed).
  - Branch panel (+ Add): name, street, city, state (first branch becomes Primary). Remove non-primary branches (unassigns their members).
  - Member panel (tap a member): branch, position, per-member finance access override, manage-users / manage-bids toggles.
- **Do:** Approve an account request (sets `status: 'approved'` and activates their `user_roles` row at whichever position is selected — the approver can change it) or Reject (confirm dialog, sets `status: 'rejected'`; the row is kept and cannot sign in). Remove a member (deletes their account — new members only arrive via Request Access, so there is no separate add-user search). Tap a branch card → branch-detail. Open Bid Divisions. Done → back.

### branch-detail.html
- **See:** Branch name, Primary badge, address, manager, manager's phone, active-job count, branch member list (name + guild level) with a search box scoped to company members.
- **Edit:** Via the Edit Branch sheet: branch name, address fields, manager (dropdown of company members).
- **Do:** Add/remove branch members (sets/clears `users.branch_id`). Edit Branch. View Jobs at This Branch (→ jobs, scoped to this branch). View Finance for This Branch.

### company-divisions.html
- **See:** The company's ordered bid-division list (the checklist every new bid shows), each with its position number, a real CSI MasterFormat division number (2026-08-12 — see the gap analysis doc's C5), an active/inactive toggle, and reorder arrows.
- **Edit:** Division names inline; CSI number (small number input, `setCompanyDivisionCsi()`); order (▲/▼); active state (inactive divisions are hidden from new bids without losing history); add a new division by name (starts with no CSI number — there's no reliable way to infer one for a free-typed name); remove a division.
- **Do:** All of the above; changes apply to every bid opened afterwards. Edits write to the real `divisions` DB table (via `companyDivisions()`), same as everything else in the mock DB — this page has no special in-memory-only behavior.

> **Note:** the Guild ladder (Entered Apprentice → Fellow Craft → Master) and the
> per-task Competency ladder (Student → Exposure → Competent → Mastery) are fixed,
> app-wide constants — the same for every company. The former company-levels.html
> and company-competency-levels.html configuration pages were removed on purpose:
> a rank should mean the same thing everywhere, and the progression engine's slug
> lookups (`fellow_craft`, `mastery`) must never break from config edits.
> Guild level = overall career rank (one badge per person, promoted via scorecards);
> competency level = per-task clearance (gates the clock-in flow).

---

## Jobs

### jobs.html (landing page after sign-in for non-supplier users)
- **See:** Job list (scoped to the current branch when one is set): name, bid total or "No Bid", address + start date, job type • priority • lead. Company/branch subtitle. Empty states for no jobs / no search matches. Shows the app header and bottom nav (it's a main-app page now that it's the landing screen).
- **Edit:** Search text — filters live on name, address, job type, and lead.
- **Do:** Tap a job → job-home (sets it as the current job). + → create-job (hidden for supplier-role users, who browse jobs for material planning only). Browsing this list does **not** clear the current job — only opening a different one changes it.

### create-job.html
- **See:** New-job form; team chips scoped to the current branch.
- **Edit:** Job name, customer dropdown (picking one prefills blank address fields from their record), job type, address/city/state, priority, team member chips (you are pre-selected and locked), notes, and "Create Bid with this Job?" (later / now). "+ Add New Customer" opens a sheet: name, phone, email, address — saving inserts the customer and selects them.
- **Do:** Create Job — inserts job + address + `job_assignments` (you as lead); routes to bid creation or back to jobs per the bid option. Cancel.

### job-home.html ("Home" tab once a job is selected)
- **See:** Job name and a tappable status subtitle ("Active / No Bid Yet • Switch job"). Job context is deliberately sticky: workers pick a job once and it stays current until they open another. A **Prep for Tomorrow** section (QA note 2026-07-07) under the clock button lists training videos for this job's upcoming (not-yet-complete) scheduled tasks — your own assignments when you have any, otherwise the job's — each card showing its schedule date and a Watch or green Ready badge ("watched — no video needed on-site" once viewed today/yesterday). Hidden for supplier-role users or when no upcoming task has a training module. A **Kits & Carts Needed** section (QA note 2026-07-14) lists the union of every `required_kit_ids` set on the job's bid divisions (picked on bid-division.html), each showing Needed / Checked Out / "In Use — {other job}" (flags a double-booked kit instead of letting it silently check out twice). Hidden when the job has no bid or no division names any kits.
- **Edit:** Nothing.
- **Do:** Tap a pending prep card → training-video in prep mode (watch tonight; the on-site task gate then skips the video for a day). Tap the subtitle (or tap the Home tab again while here) → jobs list to switch jobs. Clock In / Out (→ field-clock; hidden for supplier-role users). Quick actions: Schedule, Kits, View Bid or + Create Bid (label switches on whether the job has a bid), Time Sheet. Kits & Carts Needed: Check Out / Check In right from the row (writes `kit_checkouts`, same helpers as kits.html). "Full Job Details" → job-detail. ← Jobs.

### job-detail.html (jobs that have a bid)
- **See:** Job header (name, JOB-XXXX code, status badge, address, date range, progress bar — 65% static placeholder, or a real 100% once `jobs.status === 'closed'`, see job-closeout.html); Bid & Finance card (estimated value from the bid, labour-to-date and materials-used summed from `expense_entries`); Assigned Team (each member's initials avatar, name, Lead/Team Member, guild-level badge, Clocked In / Off Site status); two static JIT training cards. Managers/admins also see a Close-Out box (2026-08-12): "Close Out Job" (or "View Close-Out Record" once closed) → job-closeout.
- **Edit:** Nothing directly.
- **Do:** Clock In / Schedule / Kits / **Deliveries** (2026-08-12, → material-orders) quick actions. View Bid → bid. **Change Orders** (2026-08-10) → change-orders, scoped to this job's bid. Tap a team member row → scorecard for that worker (managers/admins only — others are blocked with an alert). "+ Add" (team) opens an inline picker of company members not yet on the job; tapping one inserts a `job_assignments` row (role: member) and refreshes the list. Training cards → field-clock. Close-Out box → job-closeout (managers/admins only). ← Jobs.

### job-detail-nobid.html (jobs without a bid)
- **See:** Job header with "No Bid Yet" badge and target start; a "No Bid Created" call-to-action panel; Job Details card (customer, job type, priority, assigned lead); job notes.
- **Edit:** Nothing.
- **Do:** + Create Bid (creates the `bids` row and opens the bid builder). Schedule / Kits / Field Clock. ← Jobs.

### job-closeout.html (job-detail's Close-Out box, managers/admins only; 2026-08-12)
Shared foundation for B1 (Closed-Loop Kit Debrief) and D2 (Surprise & Delight) — see the gap analysis doc.
- **See:** Two sections. **Surprise & Delight**: once logged, shows the item + confirmation that a paired +$75/−$75 invoice line posted; until then, a preset stewardship-item dropdown + mandatory photo capture. **Kit Debrief**: every kit still checked out to the job, "Needs Debrief" until a debrief is submitted, then "Debriefed • Passed/Flagged". A **Finish Close-Out** section at the bottom lists what's still missing and gates "Mark Job Complete" (stays `disabled`, not just alert-blocked, until both sections are done).
- **Edit:** Stewardship item (dropdown; "Other" reveals a free-text description) + a simulated photo capture (`captureKitPhoto()`-style button, same 900ms fake-camera pattern as field-clock's kit photo). Per-kit debrief form: Performance Audit Yes/No, Friction Source dropdown, per-tool "Needs Maintenance" checkboxes, Inventory Status Complete/Incomplete, photo capture.
- **Do:** "Log Stewardship Fix" — inserts a `stewardship_logs` row and the paired invoice lines. "Submit Debrief" per kit — inserts a `kit_debriefs` row, auto-checks the kit back in, auto-opens a `replacement_tickets` "maintenance work order" for any flagged tool or incomplete inventory. "Mark Job Complete" (enabled only once both sections are done) — sets `jobs.status = 'closed'` + `closed_at`. ← Job.

### material-orders.html (job-detail's "Deliveries" quick action; 2026-08-12)
Built for C6/A9 — see the gap analysis doc.
- **See:** This job's `material_orders`, each with name/qty/unit, a status badge (Ordered/In-Transit/Landed/Staged), carrier + tracking number once assigned, and which schedule_events row(s) are waiting on it.
- **Edit:** "+ New Order": material name, quantity, unit, bid division (optional), expected delivery date.
- **Do:** "Advance to {next status}" — steps the order forward one stage (`advanceMaterialOrder()`); the first advance to In-Transit assigns a simulated carrier + tracking number (no real shipping API). "Log Order" creates the row. ← Job.

---

## Bids (rebuilt on the libraries, 2026-11-24)

Bid lines no longer carry free-typed descriptions. A `bid_line_items` row points at a library row
(`scope_task_id` / `material_id` / `kit_id` / `room_id` / `scope_status_id`) plus `quantity` and `frictions`
(`no_power_water`, `ladder_scaffold`, `occupied`, +10% each). A "custom" task/material (snapshot on the line) is
still possible. All money comes from `pricing.js`. See `docs/decisions/001`-`008`.

### bid.html — bid builder
- **See:** Job-header form; the **4-Day Sprint** and **Payment terms** gate cards (flag `bidGates`) plus a red "N lines need pricing" card; the 58 Kinetic Master Sequence divisions (filterable) with the client price, line count and needs-pricing badge for included ones; **Grand Total (client price)**; an **Internal Summary** (hours by tier, labor, kit fees, taxed materials + kits + mileage, exact total, contingency held separately, crew days, kits and bill of materials); Schedule; Mileage & Terms; Schedule of Payments.
- **Edit:** Header fields, include/exclude divisions, schedule dates, **Miles to Site**, **Millwork job** checkbox (division 38 also counts). The mileage rate is a system setting (`mileage_rate_per_mile`), not a per-bid field.
- **Do:** "Edit Division Sheet" -> bid-division. Preview Proposal -> bid-proposal. The payment schedule comes from the terms gate: 100% upfront under $5,000 or for millwork, otherwise 50% deposit and the balance at Thursday handover (flag off: legacy 50/20/20/10).

### bid-division.html — one division's sheet (internal)
- **See:** Division name; the library scope text (inclusions / exclusions) the client will see; an internal stats card (tier hours, days, labor, kit fees, taxed materials, mileage, exact and client price, needs-pricing and excluded counts); Guys on Site; Kits & Carts Required (physical inventory kits, drives kit checkout); Crew Assigned; the line editor and the line list.
- **Edit:** Add a **library task** (division is fixed; pick category, then task; quantity, room, scope status, three friction toggles, kit), a **material** (search the materials library) or a **custom task** (hours per unit, 0 = needs pricing). Each line: quantity, status, friction toggles, kit, remove. Edits write immediately; "Done" persists the kit chips and returns.
- **Needs pricing:** a task with no production hours or a material/kit with no price shows NEEDS PRICING and is excluded from totals, never $0.

### bid-proposal.html — client-facing preview
- **See:** Letterhead, header grid, per division: library inclusions, each task's scope with quantity, exclusions, and ONE fixed total; the grand total; schedule; the payment schedule from the terms gate; acceptance block. No hours, tiers, kits or internal costs.
- **Do:** "Send to Customer" generates the PDF from the same client model and moves the bid to sent (blocked while any line needs pricing). Invoices are cut from the payment schedule.

---

## Change Orders (scope-status driven, 2026-11-24)

A change order is its own signable document against a sent bid. Its lines use the same library line shape
(`change_order_line_items`) and a **scope status** decides how they count: new lines are **PCO** (priced, pending, not billed);
when the customer signs they become the change order's own code (CO-001, ...) and are billable. VOID and non-billable
statuses (PUNCH-INT, WAR-RPR) are excluded from totals and from the client document. Numbering uses the library codes
(CO-001, CO-002, ... per bid). It is paid in full on acceptance.

### change-orders.html (job-detail's "Change Orders" button)
- **See:** A contract ledger (original contract BASE + signed change orders = contract sum; pending PCO shown separately) and the job's change orders with status and amounts.
- **Do:** "+ New Change Order" (hidden until the bid is sent/signed).

### change-order.html — one change order's sheet (internal)
- **See:** Billable now / pending (PCO) / proposed total / excluded lines, and needs-pricing count; title, reason, expiry; the line editor (division picker is available because a change order can touch any division).
- **Do:** Add library tasks, materials or custom tasks, set each line's scope status, "Preview & Send".

### change-order-proposal.html — client-facing preview
- **See:** Header, scope grouped by division (task scope + quantity), one total, payment note, acceptance block.
- **Do:** "Send to Customer" (blocked while lines need pricing; generates the PDF and the invoice); once sent, "Customer signed - mark signed" flips PCO lines to the CO code.

---

## Field Clock, Task Gate Chain & Time

### field-clock.html (renamed from feild-clock.html 2026-07-07; restoreState remaps sessions saved on the old name)
- **See:** A tappable job chip in the header showing which job a punch will land on (red "No job selected — tap to choose" when unset), today's real date, clock status badge, running HH:MM:SS timer, Clock In/Out button, a **Simulated GPS** card (stands in for real geolocation: On-site / Off-site toggle), the "Before You Clock Out" checklist (appears directly above the clock button, only while clocked in) — materials/kit-photo/cleanliness, plus a fourth **Time & Energy Audit** item (2026-08-12, see the gap analysis doc's A5) asking "Any friction points today?" with four buttons (Tool Failure / Material or Kit Delay / Hidden Site Conditions or Scope Creep / Smooth Run), a **JIT Training** list built from the company's real `training_modules` (Done with watch date via your `training_assignments`, or Pending — the section hides when the company has none), activity buttons, and **Today's Log** — your real clock punches and completed task phase-logs for today from the DB (tasks show their Mason's Mark), with in-progress activities prepended on top and an empty state when nothing's recorded yet.
- **Edit:** The clock-out gate: materials-logged and cleanliness checkboxes, a "Take Photo" button for the kit photo (simulated capture — checks the box and timestamps it), and the friction-check buttons (tapping one both logs it and satisfies the gate item — nothing to type unless it's worth noting, and the app doesn't ask); the GPS simulation toggle; the Material Log sheet (pick a checked-out kit, item, quantity).
- **Do:** Tap the job chip → jobs list to switch jobs. Clock In — **requires a selected job** (alerts and routes to the jobs list otherwise); creates a `time_entries` row; clocking in while the simulated GPS is off-site records it as `flagged` for manager review. Record activity: Driving / Lunch / Task / Material (opens the material log). **Task** (requires being clocked in) opens the task picker sheet — the company's task modules, each with your competency badge (Student/Exposure/Competent/Mastery — defaults to Student if never evaluated) and a subtitle explaining what that level allows; high-hazard tasks are flagged "PPE required". Picking one runs the gate chain (training-video → co-sign/PPE below) — **unless its training video was already watched today or yesterday** (via job-home's Prep for Tomorrow, QA note 2026-07-07), in which case the video step is skipped straight to the competency branch; once cleared, the task starts recording in the activity log and opens a `phase_logs` row against the running time entry — tapping End Task stamps its `ended_at`. Tapping a Pending training card also routes into the Task gate chain. Tapping a friction-check button inserts a `friction_reports` row routed to your branch manager (or the job's lead) — see team-time.html. Clock Out — the button is visibly disabled (dimmed) until all four checklist items are done, and clocking out ends any ongoing task. "Daily Scorecard & Timesheet" — end-of-day is scorecard-first: opens your self-assessment, which returns to review-time for submission (skips straight to review-time if today's scorecard is already in).

### training-video.html
- **See:** Two modes on the same player. **Gate mode** (opened from the field-clock task picker): "{Task} — Safety Training", subtitle notes it can't be skipped. **Prep mode** (opened from job-home's Prep for Tomorrow, QA note 2026-07-07): "{Task} — Training", subtitle explains watching now clears tomorrow's on-site video. Both: a simulated 3-second video progress bar, a Continue button that stays disabled until the bar finishes.
- **Edit:** Nothing.
- **Do:** Continue (after 3s) — **Prep mode:** records the training completion (same `training_assignments` trail the gate uses) and returns to job-home with a confirmation toast; no competency gates involved. **Gate mode:** records the training completion, then routes by competency: Mastery → PPE gate (if high-hazard) or back to the field clock (task starts recording); Competent → co-sign modal (a master's name confirms, then continues); Student/Exposure → blocked with a message, back to the field clock.

### ppe-video.html (high-hazard tasks only)
- **See:** "{Task} — PPE Verification", instructions to record a 3-second proof video.
- **Edit:** Nothing.
- **Do:** Record PPE Video (simulated) → enables Continue → field-clock, where the task starts recording.

### review-time.html — worker timesheet
- **See:** Your 5 most recent time entries (day, job, hours, in/out times, GPS-flagged warning with distance when applicable, Mason's Mark), total hours hero, activity summary tiles (on-site hrs, shift count, break hrs from `unpaid_break_minutes`, estimated pay at the user's `hourly_rate` — fallback $35/hr), recently recorded materials, a note that a completed scorecard is required to submit.
- **Edit:** Notes-for-supervisor textarea — Save Draft keeps it in state (restored next visit, and across the scorecard-gate detour); Submit stamps it onto the submitted entries as `worker_note`, where the manager sees it on team-time.
- **Do:** Submit Timesheet — if today's shift has no scorecard yet it redirects you to scorecard first (and returns here); otherwise marks the entries submitted for the manager. Save Draft / ← Field Clock.

### team-time.html — manager view (⋯ menu → Team Timesheets)
- **See:** Hours awaiting QuickBooks (hero, with entry count and estimated payroll); **Flagged — Outside Geofence** section listing GPS-flagged entries (who, when, job, distance from site); **Friction Reports** section (2026-08-12) listing open `friction_reports` routed to you (or unrouted ones from a worker you manage) — worker, category (green for Smooth Run, red otherwise), job, date; submitted-but-unexported entries grouped per worker with per-worker hour/pay subtotals, each entry showing the worker's timesheet note in italics when one was submitted; the last 8 entries already sent to QuickBooks.
- **Edit:** Nothing directly.
- **Do:** Approve a flagged entry (moves it into the export queue). Acknowledge a friction report (stamps `resolved_at`/`resolved_by`, drops it off the list). Submit All to QuickBooks (simulated export — stamps `qb_exported_at` and moves entries to the "Already Sent" list). ← Back.

---

## Scorecard & Guild

### scorecard.html (⋯ menu → My Scorecard for self-assessment; job-detail's team list for manager review; or forced by the timesheet gate)
- **See:** Two modes on the same form. **Self** (worker scoring themselves): "My Scorecard — Self-Assessment". **Review** (manager/admin opening a worker): "{Worker} — Workman Scorecard"; if the worker has a pending self-assessment, the form pre-fills with their answers and the subtitle shows its shift date. Both: live-recalculated total out of 100; Production Speed auto-computed (actual vs. estimated hours, 0–5) and read-only.
- **Edit:** Job Well Done toggle (0 or 55 pts); Material Accountability / Tool Discipline / Site Cleanliness toggles (5 pts each); five Heart Side sliders 0–5 (Initiative, Habitual Safety, The Constructive Heart, Disposition to Learn, Elite Character) — all five must be touched before submitting (they show "—" until moved; pre-filled review mode counts as touched).
- **Do:** **Self:** Submit Self-Assessment — inserts a `scorecard_entries` row with `status: 'self_submitted'` (no `reviewed_by`, no guild progression), toasts that the manager will review it, returns to the page it was opened from (or the timesheet if the gate sent you here). **Review:** Approve & Finalize Scorecard — updates that same row to `status: 'reviewed'` with the manager's scores and `reviewed_by`/`reviewed_at` (or inserts a fresh reviewed row when no self-assessment exists), runs Guild auto-promotion (toast announces promotions), returns to job-detail. Self-submitted rows are excluded from the fellow-craft trailing average until reviewed.

### scoreboard.html (⋯ menu → Scoreboard)
- **See:** Company leaderboard (top 5 by scorecard points, with guild level and a "You" badge), your rank and points, and your stat tiles (jobs done and total hours are real; on-time % and customer rating are static).
- **Edit:** Nothing.
- **Do:** Switch the leaderboard period: Monthly / Weekly / All Time.

---

## Kits, Labels & Inventory

### kits.html ("Kits" tab)
- **See:** A slide-out drawer of kit categories (from `inventory_kits.category`) expanding to kit names; an All/Kits/Carts segmented filter above the drawer/search (`inventory_kits.kind`, QA note 2026-07-14 — a "cart" is just a kit whose owned rows are all consumable materials, no new table). Selecting a kit shows its Tools/Materials sections (a section with zero rows collapses to a plain "+ Add Tool"/"+ Add Material" link instead of a header + empty-state box, so a cart doesn't show a bare "Tools" section and vice versa), and Videos (placeholders). `kind: 'kit'` rows also show a live-derived status (Ready / In-Transit / Needs Audit / Out of Service — see shop-logistics.html) and a **Check Out to Job** / **Check In** control (writes real `kit_checkouts` rows — this used to be seed-data-only). Search bar filters kits by name. A company with no kits sees a "+ Create a Kit" empty state instead.
- **Edit:** Create/edit a kit (name + category + **Kind** — Specialized Kit vs. Modular Cart — + description + location + photo sheet; inserts/updates a real `inventory_kits` row). Per kit: + Add a tool, material (name + quantity + brand), or video title; tap any tool/material row to rename it, change quantity/brand/photo, or Remove from Kit.
- **Do:** Browse/search/select kits; filter by kind; Check Out (job picker) / Check In a kit or cart; all tool/material edits persist to `materials` rows (`kit_id` + `item_type`). "Labels" → label-generator. Video rows just alert (labeled as demo).

### shop-logistics.html (⋯ menu → Shop Logistics; gated by the manage_inventory permission)
- **See:** Four tabs. **Active Audits** — every `kind: 'kit'` row that isn't Ready (Needs Audit / Out of Service selectable; In-Transit shown dimmed, informational only), each showing which job it's assigned to if checked out. **History** — past `kit_audits` rows, newest first. **Reorder** — open `replacement_tickets` (one per flagged issue from a failed audit or a job-closeout kit debrief) plus `kind: 'cart'`-owned materials where `stock_qty < reorder_qty`. **Rig Dashboard** (2026-08-12, see the gap analysis doc's B1) — every `kit_debriefs` row from job-closeout.html (kit, job, date, Clean/flagged status, flagged-item count), with a This Week / All Time filter — doubles as the spec's separate "Rig Management Dashboard" and "Weekly System Debrief."
- **Edit:** Selecting an auditable kit opens Pass/Fail; Fail reveals a checklist of that kit's tool rows, each flaggable Missing/Damaged/Needs Replacement.
- **Do:** Submit Audit — inserts one `kit_audits` row plus one `replacement_tickets` row per flagged issue; a Fail also flips the kit's live status to Out of Service until every open ticket for it is resolved. Reorder tab: Mark Fulfilled (ticket) / Mark Restocked (cart material — resets `stock_qty` to `reorder_qty * 2`, a simple par level, not real receiving). Rig Dashboard: switch This Week / All Time. Done → back to wherever the ⋯ menu was opened from. See `docs/kinetic-flow-cart-kit-tracking-plan.md` for the full design reasoning.

### label-generator.html ("Labels")
- **See:** A mock "Saved Templates" rail (previews that will sync from the separate Label Maker app once it exists), then the same category → kit → tools/materials tree as kits.html with checkboxes at the kit level and on every individual tool/material row; a footer showing how many labels are selected.
- **Edit:** The selection (check kits and/or individual items); search filters kits.
- **Do:** "Open in Label Maker" — hands the selection off to the user's separate Label Maker app; until that app is installed in this simulator it's an honest stub (toast). This page deliberately does **not** generate labels itself (QA note 2026-07-06). Clear selection. ← Kits.

### inventory.html (supplier-role landing page after sign-in; also ⋯ menu → Stock Inventory)

> **Supplier role:** supplier is a company role (seeded as `supplier@kineticflow.com`;
> every company gets a default `supplier` role), not an account type — the old header
> Supplier toggle is gone. Supplier-role users get their own bottom nav
> (Inventory / Jobs / Schedule / Kits): jobs and the schedule are included so
> they can see what materials each job needs and when to order/ship, but they can't
> create jobs, clock in, or see finance.
- **See:** Stock list from `materials` with per-item name, category (inferred from SKU prefix), SKU, quantity, unit cost; Total Items and Low Stock counters; category tabs; a Low Stock Alerts section (stock below reorder point, showing "N left / Min: M"); search bar.
- **Edit:** Tap any item → sheet with name, SKU, unit, in-stock qty, reorder point, unit cost. + Add creates a new item with the same fields.
- **Do:** Save changes / add items / Remove Item (confirm, soft delete); filter by tab or search.

---

## Dashboards

### stats.html (⋯ menu → Task Statistics)
- **See:** Stat tiles (Jobs Completed and Labour Hours computed from `time_entries` for the selected period; On-Time Rate and Avg Rating static); By Job Type breakdown with percentage bars (real, from `jobs.job_type`); Team Performance top-3 by scorecard points; static Customer Satisfaction tiles.
- **Edit:** Nothing.
- **Do:** Switch period (This Month / Quarter / Year); "Scoreboard" shortcut.

### finance.html (⋯ menu → Finance Dashboard)
- **See:** Three scope tiers — Nationwide / Branch / Job — each gated by your role's `finance_dashboard_permissions` (tabs you can't view are hidden). Overview: revenue hero (from `finance_snapshots`; the Job tier shows contract value from the bid), Revenue / Expenses / Profit / Outstanding tiles with margin. Invoices view (2026-08-10 — real, persisted `invoices` rows, replacing the old in-memory-only 50/20/20/10 synthetic split): unpaid invoices with milestone label, invoice number, and amount — one row per bid draw (Deposit/Draw 1/Draw 2/Final Balance) generated when a bid is sent. `ensureInvoicesForBid()` self-heals any bid that reached sent/signed before this existed. Expenses view: Labour / Materials / Overhead breakdown bars from `expense_entries`.
- **Edit:** Nothing directly.
- **Do:** Switch tier and view (Overview / Invoices / Expenses). Invoices view: **Mark Paid** on any unpaid row (stamps `status: 'paid'` + `paid_at`, removing it from the outstanding list). Export Report is an alert placeholder (labeled as demo).

### schedule.html ("Schedule" tab — workers and supplier-role users)
- **See:** A Gantt-style task grid — tasks down the left (sticky column), workdays across the top (**Monday–Friday only; Saturday and Sunday are locked days of rest and never show**), a colored block under each day a task runs. Two ranges: **Week** (one work week, prev/next arrows, anchored to the seeded cluster week of Jun 29 2026, always fits the page) and **Full** (every scheduled weekday from earliest to latest event on file; fixed-width columns that scroll sideways with edge-fade hints). Scoped to the sticky current job when one is set (tappable subtitle → jobs list); otherwise all jobs' events show. Everyone signed in sees `view_type: 'worker'` events (customers get that information via the bid PDF, not an app surface). A row whose start date currently violates its dependency's lag or its linked material order's Next-Day Rule (2026-08-12, see the gap analysis doc's C5/A9) shows a ⚠ prefix on its name, with the specific reason in the cell's title/tooltip — re-checked live on every render, so a dependency or delivery that changes after the row was created still flags it.
- **Auto-generated from the bid (QA note 2026-07-13):** opening the page for a job with a bid and no bid-derived rows yet derives the schedule from the bid sheets via `generateScheduleFromBid`: each included labor task becomes one `schedule_events` row lasting `ceil(hours ÷ (8 × guys))` workdays, tasks run back-to-back in proposal order, starting on the bid's start date (fallback: the job's scheduled start, weekend-snapped forward), colored per division, and (2026-08-12) chained via `dependency_id` to the row immediately before it (0-day lag) so the run is a real dependency sequence, not just sequential dates. Rows are best-effort matched to a `task_modules` row by name so the JIT training gate still fires. The view jumps to Full so the whole run is visible.
- **Do:** **Sync from Bid** (shown only when the current job has a bid) — re-derives after bid edits, soft-deleting prior bid-derived rows but leaving manual entries alone. "+ Add" bottom sheet (title, job, start/end dates defaulting to the viewed Monday, plus **Depends On** / **Lag (days)** / **Material Delivery** — 2026-08-12, scoped to whichever job is selected and re-populated on job change) — inserts a manual row (`bid_division_id: null`, assigned to you, blue, `status: 'scheduled'`); if the chosen start date violates the dependency's lag or the Next-Day Rule, a `confirm()` shows the specific reason and lets you schedule anyway rather than hard-blocking. Toggle Week/Full, shift weeks (Week only), tap a task's name cell (rows with a job) → that job.

---

## App Header, ⋯ Menu & Messaging

### App header (not a page — persistent bar above every main-app page)
The More tab and more.html were removed; a slim header now sits above `#main`
on exactly the pages that show the bottom nav (never on sign-in, never in
Customer mode). Left: initials avatar + your name + company —
tap it for the profile sheet (name, email, position • company, guild-level
badge, a Scoreboard Rank card with your monthly rank + points → scoreboard,
Sign Out). Right: a green "▲ #N" chip that appears **only when your monthly
scoreboard rank improved since you last viewed the scoreboard** (tap →
scoreboard, which re-baselines it; `state.rankSeen` persists the baseline —
deliberately never an always-on rank, so a low rank isn't rubbed in all day),
then a ⋯ button opening a dropdown with the old More content — Dashboards (My Scorecard, Scoreboard, Task Statistics, Finance
Dashboard, Customer Home Details, Message Templates), Management (Team
Timesheets, Manage Users — only for users with the manage_users permission,
with a "N pending" pill when sign-up requests are waiting — and Stock
Inventory), Testing ("Simulate Sabbath Lock" — a checkmark-toggle, not the
old one-shot "Sabbath Lock" preview; 2026-08-12, see field-clock/A2 in the
gap analysis doc — checking it locks the whole app behind the Sabbath
splash immediately, same as a real Sunday would), and Account (Sign Out).
The ⋯ button itself carries a red dot for those users while any request is
pending. Both
bottom navs are four tabs — worker: Home / Schedule / Field / Kits; supplier:
Inventory / Jobs / Schedule / Kits.
(Resetting demo data lives in the website header's Reset Data button, not in
the app.)

### message-templates.html
- **See:** Company message templates (from `message_templates`), each pre-filled with the current job's context (customer first name, job name, crew, start time); unresolvable placeholders render as editable `[blanks]`. A banner states Kinetic Flow does not send texts itself.
- **Edit:** Each template body in its textarea before copying.
- **Do:** Copy Message (clipboard) — then paste into the phone's own messaging app. That handoff is deliberate: there is no in-app messaging anywhere in Kinetic Flow.

---

## Customer Pages

Customers never really use the app (QA notes 2026-07-07): bids, invoices, and
the schedule reach them as a **generated PDF** (see bid-proposal's Send to
Customer), and the QR code posted at the property opens a **website** showing
the floor plan and building details. In this prototype, Customer mode in the
header simulates that website: it hard-signs-out any worker session, shows the
property-link picker, and renders the property page read-only with no bottom
nav. The old customer-bid.html and customer-invoice.html tabs were removed.

### customer-links.html (Customer mode's entry screen)
- **See:** One card per `property_records` row — job name, address, and its tokenized URL (`kineticflow.app/p/{access_token}…`) — plus a note that this simulates scanning the property's QR code.
- **Edit:** Nothing.
- **Do:** Tap a link → that property's customer-home, exactly as if the QR code was scanned.

### customer-home.html (the QR-website stand-in — also reachable by workers via the ⋯ menu)
- **See:** Property record for the job: job/address/customer subtitle, Floor Plan (file link or "none on file"), Paint by Room list, Materials Used list.
- **Edit:** **Workers only** (viewing the selected job's record): Edit floor-plan link (prompt), add/edit/remove paint-by-room and materials entries via a key/value sheet — this is how crews maintain what the customer's QR page will show. Customers see everything read-only.
- **Do:** ← Back — workers return to where they came from, customers to the property-link picker.
