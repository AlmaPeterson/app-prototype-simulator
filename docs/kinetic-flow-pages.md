# Kinetic Flow — Page Reference

Accurate as of 2026-07-06. One entry per file in `apps/kinetic-flow/pages/`.
Each entry says what information the page shows, what you can edit, and what
actions you can take. All data comes from the in-memory mock DB (seeded from
`db/*.json`, persisted to localStorage); "saves" below mean DB writes in that
sense — nothing hits a server.

---

## Auth & Account

### sign-in.html
- **See:** App title, email + password fields, "Forgot password?" link, Sign In button, "Continue with Google" button, "Request Access" link. Focusing the email field opens an account-picker dropdown listing every existing account (name, a role · guild-level pill, email); typing filters by name, email, or position.
- **Edit:** Email (type it or pick an account from the dropdown, which just fills the field) and password (password is not checked; email must match an approved user — demo: `j.smith@kineticsolutions.com`).
- **Do:** Sign In / Google (both call `signIn()`; a pending-approval email routes to account-pending, unknown email alerts). "Request Access" opens the sign-up sheet.

### sign-up.html (bottom-sheet modal over sign-in)
- **See:** "Request an Account" form and a note that requests are reviewed.
- **Edit:** First/last name, email, phone, role dropdown (Worker/Manager/Customer/Supplier/Admin), optional company name, notes.
- **Do:** Submit Request — creates a `users` row with `approval_status: 'pending'` and lands on account-pending. Cancel closes the sheet.

### account-pending.html
- **See:** "Request Sent" confirmation; explanation that an admin must approve the account.
- **Edit:** Nothing.
- **Do:** Back to Sign In.

### admin-approvals.html (admin's landing page after sign-in)
- **See:** "Pending Accounts" list — each pending user's name, email, company, phone, plus a pending count.
- **Edit:** Nothing directly.
- **Do:** Approve (sets `approval_status: 'approved'` so the user can sign in) or Reject (confirm dialog, soft-deletes the user). Sign Out.

---

## Companies

### companies.html (worker landing page after sign-in)
- **See:** All companies (new accounts see only companies they belong to; otherwise the seeded ones too), each card showing name, member count, and your membership badge (Active / Pending). Empty state with a centered + button when there are none.
- **Edit:** Nothing directly.
- **Do:** Tap a company to select it and go to Jobs (a Pending membership just alerts that the owner hasn't accepted yet). + button dropdown → Join a Company / Create a Company. "Manage" button (only on companies where you have an active role) → company-setup. Sign Out.

### join-company.html
- **See:** Company filter box ("Type to filter companies..."), a live "Showing X of Y companies" count, matching company cards (name + member count, "Selected" badge) with a query-echoing empty state, a role dropdown showing the selected company's real positions, an optional message field.
- **Edit:** Search text, selected company (tap to toggle), requested role, message to admin.
- **Do:** Send Join Request — creates a pending `user_roles` row (the chosen role is stored on it, so accepting needs no further input). Cancel/Back → companies.

### new-company.html
- **See:** Create-a-company form.
- **Edit:** Company name, industry dropdown, business address, city, province/state, company size, phone, optional website.
- **Do:** Create Company — inserts the company + address, seeds default roles (admin/manager/employee), makes you admin, and continues to company-setup. Cancel → companies.

### company-setup.html (reached via "Manage" on a company card)
- **See:** Position chips; branch cards (name, address, Primary badge); Company Configuration cards (Bid Divisions, Guild Levels, Competency Levels with counts); a Permissions list summarizing each position's finance access / manage-users / manage-bids; pending Join Requests (name, email, requested role, message) when any exist; Team Members list (name, position, branch) with a user search box.
- **Edit:** Everything above through bottom-sheet panels:
  - Position panel (+ Add or tap a chip/permission row): name, finance access (none/job/branch/nationwide), manage-users and manage-bids toggles; Remove Position (blocked-with-confirm if members hold it; admin can't be removed).
  - Branch panel (+ Add): name, street, city, state (first branch becomes Primary). Remove non-primary branches (unassigns their members).
  - Member panel (tap a member): branch, position, per-member finance access override, manage-users / manage-bids toggles.
- **Do:** Accept / Decline join requests (accept flips the `user_roles` row to active). Search any user and + Add them as an employee. Remove a member. Tap a branch card → branch-detail. Open the three configuration pages. Continue to Jobs / Skip for Now.

### branch-detail.html
- **See:** Branch name, Primary badge, address, manager, manager's phone, active-job count, branch member list (name + guild level) with a search box scoped to company members.
- **Edit:** Via the Edit Branch sheet: branch name, address fields, manager (dropdown of company members).
- **Do:** Add/remove branch members (sets/clears `users.branch_id`). Edit Branch. View Jobs at This Branch (→ jobs, scoped to this branch). View Finance for This Branch.

### company-divisions.html
- **See:** The company's ordered bid-division list (the checklist every new bid shows), each with its position number, an active/inactive toggle, and reorder arrows.
- **Edit:** Division names inline; order (▲/▼); active state (inactive divisions are hidden from new bids without losing history); add a new division by name; remove a division.
- **Do:** All of the above; changes apply to every bid opened afterwards. Note: edits mutate the in-memory `DIVISIONS` array only (not a DB table).

### company-levels.html
- **See:** The Guild career ladder (Entered Apprentice → Fellow Craft → Master), each level's slug, promotion type (Manual/Auto), and — for auto — its criteria (trailing days, scorecard %).
- **Edit:** Level names inline, order, promotion type chips, auto-promotion criteria; add/remove levels.
- **Do:** All of the above. Auto levels are what `applyScorecardToGuildProgression()` checks after each scorecard.

### company-competency-levels.html
- **See:** The per-task skill ladder used by the clock-in gate (Student → Exposure → Competent → Mastery), each with slug, a "Requires co-sign" toggle, and an auto-promote-after-days field.
- **Edit:** Names, order, co-sign requirement, auto-promote days; add/remove levels.
- **Do:** All of the above.

---

## Jobs

### jobs.html
- **See:** Job list for the selected company (scoped to the current branch when one is set): name, bid total or "No Bid", address + start date, job type • priority • lead. Company/branch subtitle. Search bar (visual only — not wired).
- **Edit:** Nothing.
- **Do:** Tap a job → job-home (sets it as the current job; the bottom nav appears from there on). + → create-job. ← Companies.

### create-job.html
- **See:** New-job form; team chips scoped to the current branch.
- **Edit:** Job name, customer dropdown (picking one prefills blank address fields from their record), job type, address/city/state, priority, team member chips (you are pre-selected and locked), notes, and "Create Bid with this Job?" (later / now). "+ Add New Customer" opens a sheet: name, phone, email, address — saving inserts the customer and selects them.
- **Do:** Create Job — inserts job + address + `job_assignments` (you as lead); routes to bid creation or back to jobs per the bid option. Cancel.

### job-home.html ("Home" tab once a job is selected)
- **See:** Job name and status subtitle ("Active" / "No Bid Yet").
- **Edit:** Nothing.
- **Do:** Clock In / Out (→ task-select gate chain). Quick actions: Schedule, Kits, View Bid or + Create Bid (label switches on whether the job has a bid), Time Sheet. "Full Job Details" → job-detail. ← Jobs.

### job-detail.html (jobs that have a bid)
- **See:** Job header (name, JOB-XXXX code, status badge, address, date range, static 65% progress bar); Bid & Finance card (estimated value from the bid, labour-to-date and materials-used summed from `expense_entries`); Assigned Team (each member's initials avatar, name, Lead/Team Member, guild-level badge, Clocked In / Off Site status); two static JIT training cards.
- **Edit:** Nothing directly.
- **Do:** Clock In / Schedule / Kits quick actions. View Bid → bid. Tap a team member row → scorecard for that worker (managers/admins only — others are blocked with an alert). "+ Add" (team) opens an inline picker of company members not yet on the job; tapping one inserts a `job_assignments` row (role: member) and refreshes the list. Training cards → feild-clock. ← Jobs.

### job-detail-nobid.html (jobs without a bid)
- **See:** Job header with "No Bid Yet" badge and target start; a "No Bid Created" call-to-action panel; Job Details card (customer, job type, priority, assigned lead); job notes.
- **Edit:** Nothing.
- **Do:** + Create Bid (creates the `bids` row and opens the bid builder). Schedule / Kits / Field Clock. ← Jobs.

---

## Bids

### bid.html — bid builder
- **See:** Job-header form; the company's active divisions as a numbered checklist (checked = included, showing cost with 10% contingency, scope preview, task count); auto-calculated Grand Total; project schedule form; 50/20/20/10 payment schedule with auto-calculated dollar amounts.
- **Edit:** Everything writes straight to the DB on input:
  - Header: date, expires, bid #, project (bid title), customer name/phone/email (updates the customer record), lead craftsman, site address override.
  - Divisions: check/uncheck to include (insert / soft-delete a `bid_divisions` row).
  - Schedule: start, completion, procurement days, on-site days (overrides the auto-sum).
  - Payments: milestone descriptions for draws 1 and 2.
- **Do:** "Edit Division Sheet →" on an included division → bid-division. Preview Proposal → bid-proposal. Save Draft / ← Job Detail (everything is already saved).

### bid-division.html — one division's sheet
- **See:** Division name and position ("Division N of 40"); live stats row (total, labor, materials, hours, days); division totals card (labor + materials subtotals, 10% contingency each, division total). Each task card shows total hours, labor cost, and task total, live-recalculated.
- **Edit:** Labor rate ($/hr) and guys-on-site (drives `days = ceil(hours / (8 × guys))`); division scope (shown on the proposal); tasks — each with include-checkbox, category, name, scope, qty type (SF/LF/C/EA/HR), qty, hrs/each; per-task materials — item, supplier, price, qty. Task qty, hrs/each, and material qty spinners step by whole numbers (typed decimals still accepted); material price steps by cents. Add/remove tasks and materials freely.
- **Do:** Edits are held in a page-local working copy; **Save & Return to Bid** (or the ← back button, same function) flattens it into `bid_line_items` rows, updates the division's cost rollups and the bid totals, and returns to bid.html.

### bid-proposal.html — client-facing preview
- **See:** Read-only proposal: company letterhead, bid header grid (date, expires, bid #, project, customer, craftsman, site address), included divisions with scope + cost, grand total, project schedule (on-site days auto-summed from division sheets unless overridden), legal boilerplate, 50/20/20/10 payment schedule with milestones, dual signature blocks (your company + owner).
- **Edit:** Nothing.
- **Do:** "Send to Customer" (alert only — not wired). ← Back to Bid Creation.

---

## Clock-In Gate Chain & Time

### task-select.html (entry to every clock-in)
- **See:** The company's task modules, each with your competency badge (Student/Exposure/Competent/Mastery — defaults to Student if never evaluated) and a subtitle explaining what that level allows; high-hazard tasks are flagged "PPE required". Seed data covers every Kinetic Solutions worker × task (levels distributed by guild rank), so demo accounts see a realistic mix rather than all-Student.
- **Edit:** Nothing.
- **Do:** Tap a task → training-video, carrying the task + level + hazard flag into `state.clockInTask`. ← Job.

### training-video.html
- **See:** "{Task} — Safety Training", a simulated 3-second video progress bar, a Continue button that stays disabled until the bar finishes.
- **Edit:** Nothing.
- **Do:** Continue (after 3s) — records the training completion, then routes by competency: Mastery → PPE gate (if high-hazard) or field clock; Competent → co-sign modal (a master's name confirms, then continues); Student/Exposure → blocked with a message, back to job-home. Cannot be skipped.

### ppe-video.html (high-hazard tasks only)
- **See:** "{Task} — PPE Verification", instructions to record a 3-second proof video.
- **Edit:** Nothing.
- **Do:** Record PPE Video (simulated) → enables Continue to Clock In → feild-clock.

### feild-clock.html (filename typo is intentional — don't "fix" it)
- **See:** Clock status badge, running HH:MM:SS timer, Clock In/Out button, a **Simulated GPS** card (stands in for real geolocation: On-site / Off-site toggle), the three-item "Before You Clock Out" checklist, two static JIT-training cards, activity buttons, and today's activity log (clock-in, driving, task entries — the active task shows a Mason's Mark hash).
- **Edit:** The three clock-out gate checkboxes (materials logged / kit photo / cleanliness); the GPS simulation toggle; the Material Log sheet (pick a checked-out kit, item, quantity).
- **Do:** Clock In (creates a `time_entries` row; clocking in while the simulated GPS is off-site records it as `flagged` for manager review). Record activity: Driving / Lunch / Task / Material (opens the material log). Clock Out — blocked until all three checklist items are checked. Submit Timesheet → review-time. The bottom-nav "Field" tab comes here directly, bypassing the gates (for checking an active session, not starting one).

### review-time.html — worker timesheet
- **See:** Your 5 most recent time entries (day, job, hours, in/out times, GPS-flagged warning with distance when applicable, Mason's Mark), total hours hero, activity summary tiles (on-site hrs, shift count, break hrs from `unpaid_break_minutes`, estimated pay at the user's `hourly_rate` — fallback $35/hr), recently recorded materials, a note that a completed scorecard is required to submit.
- **Edit:** Notes-for-supervisor textarea (not persisted).
- **Do:** Submit Timesheet — if today's shift has no scorecard yet it redirects you to scorecard first (and returns here); otherwise marks the entries submitted for the manager. Save Draft / ← Field Clock.

### team-time.html — manager view (More → Team Timesheets)
- **See:** Hours awaiting QuickBooks (hero, with entry count and estimated payroll); **Flagged — Outside Geofence** section listing GPS-flagged entries (who, when, job, distance from site); submitted-but-unexported entries grouped per worker with per-worker hour/pay subtotals; the last 8 entries already sent to QuickBooks.
- **Edit:** Nothing directly.
- **Do:** Approve a flagged entry (moves it into the export queue). Submit All to QuickBooks (simulated export — stamps `qb_exported_at` and moves entries to the "Already Sent" list). ← More.

---

## Scorecard & Guild

### scorecard.html (More → My Scorecard for self-assessment; job-detail's team list for manager review; or forced by the timesheet gate)
- **See:** Two modes on the same form. **Self** (worker scoring themselves): "My Scorecard — Self-Assessment". **Review** (manager/admin opening a worker): "{Worker} — Workman Scorecard"; if the worker has a pending self-assessment, the form pre-fills with their answers and the subtitle shows its shift date. Both: live-recalculated total out of 100; Production Speed auto-computed (actual vs. estimated hours, 0–5) and read-only.
- **Edit:** Job Well Done toggle (0 or 55 pts); Material Accountability / Tool Discipline / Site Cleanliness toggles (5 pts each); five Heart Side sliders 0–5 (Initiative, Habitual Safety, The Constructive Heart, Disposition to Learn, Elite Character) — all five must be touched before submitting (they show "—" until moved; pre-filled review mode counts as touched).
- **Do:** **Self:** Submit Self-Assessment — inserts a `scorecard_entries` row with `status: 'self_submitted'` (no `reviewed_by`, no guild progression), toasts that the manager will review it, returns to More (or the timesheet if the gate sent you here). **Review:** Approve & Finalize Scorecard — updates that same row to `status: 'reviewed'` with the manager's scores and `reviewed_by`/`reviewed_at` (or inserts a fresh reviewed row when no self-assessment exists), runs Guild auto-promotion (toast announces promotions), returns to job-detail. Self-submitted rows are excluded from the fellow-craft trailing average until reviewed.

### scoreboard.html (More → Scoreboard)
- **See:** Company leaderboard (top 5 by scorecard points, with guild level and a "You" badge), your rank and points, and your stat tiles (jobs done and total hours are real; on-time % and customer rating are static).
- **Edit:** Nothing.
- **Do:** Switch the leaderboard period: Monthly / Weekly / All Time.

---

## Kits, Labels & Inventory

### kits.html ("Kits" tab)
- **See:** A slide-out drawer of kit categories (from `inventory_kits.category`) expanding to kit names; selecting a kit shows its Tools, Materials (with quantities), and Videos (placeholders). Search bar filters kits by name.
- **Edit:** Per kit: + Add a tool, material (name + quantity), or video title; tap any tool/material row to rename it, change quantity, or Remove from Kit.
- **Do:** Browse/search/select kits; all edits persist to `kit_tools` / `kit_items` / the kit's `videos`. "Generate Labels" → label-generator. Video rows just alert (placeholders).

### label-generator.html
- **See:** The same category → kit → tools/materials tree as kits.html, but with checkboxes at the kit level and on every individual tool/material row; a footer showing how many labels are selected (30 per sheet).
- **Edit:** The selection (check kits and/or individual items); search filters kits.
- **Do:** Generate PDF — builds a real Avery-5160-style label sheet client-side with jsPDF (footer text "Building Forward LLC") and downloads `kit-labels.pdf`. Clear selection. ← Kits.

### inventory.html (supplier landing page; also More → Stock Inventory)
- **See:** Stock list from `materials` with per-item name, category (inferred from SKU prefix), SKU, quantity, unit cost; Total Items and Low Stock counters; category tabs; a Low Stock Alerts section (stock below reorder point, showing "N left / Min: M"); search bar.
- **Edit:** Tap any item → sheet with name, SKU, unit, in-stock qty, reorder point, unit cost. + Add creates a new item with the same fields.
- **Do:** Save changes / add items / Remove Item (confirm, soft delete); filter by tab or search.

---

## Dashboards

### stats.html ("Stats" tab / More → Task Statistics)
- **See:** Stat tiles (Jobs Completed and Labour Hours computed from `time_entries` for the selected period; On-Time Rate and Avg Rating static); By Job Type breakdown with percentage bars (real, from `jobs.job_type`); Team Performance top-3 by scorecard points; static Customer Satisfaction tiles.
- **Edit:** Nothing.
- **Do:** Switch period (This Month / Quarter / Year); "Scoreboard" shortcut.

### finance.html ("Finance" tab / More → Finance Dashboard)
- **See:** Three scope tiers — Nationwide / Branch / Job — each gated by your role's `finance_dashboard_permissions` (tabs you can't view are hidden). Overview: revenue hero (from `finance_snapshots`; the Job tier shows contract value from the bid), Revenue / Expenses / Profit / Outstanding tiles with margin. Invoices view: outstanding synthetic invoices per sent/signed bid (computed from the 50/20/20/10 schedule — there is no real invoices table). Expenses view: Labour / Materials / Overhead breakdown bars from `expense_entries`.
- **Edit:** Nothing.
- **Do:** Switch tier and view (Overview / Invoices / Expenses). Export Report is an alert placeholder.

### schedule.html ("Schedule" tab — workers and customers)
- **See:** A week of day chips with prev/next-week arrows (anchored to the seeded event cluster, week of Jun 29 2026), plus a Day List / Task Grid view toggle. Day List: the selected day's events (title, date range, assignee). Task Grid: Gantt-style week grid — tasks down the left, days across the top, a colored block (the event's `color`) under each day the task runs. Workers see `view_type: 'worker'` events; the customer role sees the customer-facing subset.
- **Edit:** Nothing.
- **Do:** Toggle Day List / Task Grid, pick a day (day view), shift weeks (both views), tap an event or grid row with a job → that job. "+ Add" is an alert placeholder.

---

## More Menu & Messaging

### more.html ("More" tab)
- **See:** Your user card (static Jake Smith demo info); grouped nav cards.
- **Edit:** Nothing.
- **Do:** Open My Scorecard (self-assessment → scorecard.html), Scoreboard, Task Statistics, Finance Dashboard, Customer Home Details, Message Templates, Team Timesheets, Company & Branches, Stock Inventory; preview the Sabbath Lock overlay; **Reset Demo Data** (discards localStorage and reloads seed JSON); Sign Out.

### message-templates.html
- **See:** Company message templates (from `message_templates`), each pre-filled with the current job's context (customer first name, job name, crew, start time); unresolvable placeholders render as editable `[blanks]`. A banner states Kinetic Flow does not send texts itself.
- **Edit:** Each template body in its textarea before copying.
- **Do:** Copy Message (clipboard) — then paste into the phone's own messaging app. That handoff is deliberate: there is no in-app messaging anywhere in Kinetic Flow.

---

## Customer Pages

The customer role has no sign-in: launching the app as Customer lands directly
on customer-home, simulating an already-opened tokenized property link. All
three customer pages anchor to the same seeded demo job
(`CUSTOMER_DEMO_JOB_ID` in app.js).

### customer-home.html ("Home" — also reachable by workers via More)
- **See:** Property record for the job: job/address/customer subtitle, Floor Plan (file link or "none on file"), Paint by Room list, Materials Used list.
- **Edit:** **Workers only** (viewing the selected job's record): Edit floor-plan link (prompt), add/edit/remove paint-by-room and materials entries via a key/value sheet. Customers see everything read-only.
- **Do:** Workers get a ← Back button; customers just browse.

### customer-bid.html ("Bid" tab)
- **See:** The demo job's proposal from the customer side: status badge (Draft / Awaiting Signature / Accepted), sent/signed dates, customer, lead craftsman, site address, included divisions with per-division cost, grand total, and the 50/20/20/10 payment schedule with paid/due status.
- **Edit:** Nothing.
- **Do:** Nothing — read-only.

### customer-invoice.html ("Invoice" tab)
- **See:** Outstanding balance hero; payment history of four synthetic invoices (Deposit / Draw 1 / Draw 2 / Final, INV-XXXX-A…D) with paid/due status derived from the bid's status. Illustrative only — no real invoices table exists.
- **Edit:** Nothing.
- **Do:** "Pay Next Installment" button appears when something is due (display only — not wired to any payment flow).
