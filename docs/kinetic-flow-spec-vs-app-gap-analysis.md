# Kinetic Flow: Spec vs. App Gap Analysis

Generated 2026-08-12 by auditing all 23 emails under the Gmail label **Kinetic Flow/Spec** (Jun 12 – Aug 12, 2026, almost entirely from Josh Peterson) plus the linked Google Doc **"Kinetic Flow Master Specification"** against the actual code in `apps/kinetic-flow/`. 31 discrete spec items were checked. Verdicts are file/field-cited, not guesses.

**Tally: 16 Implemented · 10 Partial · 5 Not Implemented**

> **Updated 2026-08-12 (same day, later session):** A2, A5, A9, B1, C5, C6, and
> D2 moved from Not Implemented to Implemented this session — see each
> section below for what shipped. The remaining Not Implemented items are B5,
> C7, D1, D6, D7; the 10 Partial items are unchanged. Original tally (9
> Implemented · 10 Partial · 12 Not Implemented) reflected the state before
> this update.

Sections mirror how the app is organized, not how the emails arrived. A short appendix lists emails that were organizational/cultural rather than app-spec (System 1,000 manifesto, role-alignment memos, the dev-tree/prompt-playbook emails) — reviewed, but nothing to diff against code.

---

## A. Field Operations / Time Clock

### A1. Geofencing — **PARTIAL**
Spec ([step-by-step geofencing email](#)) wants: circular geofence (center lat/lon + radius) with a 50–100m minimum radius, Haversine backend validation, a 3–5 min hysteresis buffer before confirming clock-out (to kill GPS-drift false exits), a location-accuracy threshold (discard pings worse than ±50m), offline-first local caching with background sync, and an admin "requires review" override.

- **Have:** Real Haversine (`metersBetween()`, `app.js:2274-2281`). Out-of-geofence punches get `status:'flagged'` and route to `team-time.html` for admin approval — functions as the "requires review" flag.
- **Missing:** Radius is a hardcoded global `GEOFENCE_RADIUS_M = 150` (not per-job, not 50–100m). No hysteresis buffer — GPS is sampled once at clock-in/out only. No accuracy-threshold discard logic. `sync_status` field exists but there's no real offline queue/retry (no network layer exists in this static prototype at all).

### A2. Sabbath Lock Protocol — **IMPLEMENTED** ✅ (2026-08-12)
Master Spec wants an un-bypassable cron-style lock: every Sunday 12:00AM–11:59PM the entire app freezes (check-ins, time tracking, inventory, project views) behind a splash screen.

- `isSabbathLocked()` checks `new Date().getDay() === 0` against the real device clock (plus a `state.simulateSabbath` testing override, toggled from the header ⋯ menu, same idea as the field-clock GPS simulator). `loadPage()` — the one central navigation entry point — checks it before every fetch and, when locked, blocks the destination and shows a full `#phone`-covering splash instead; `toggleClock()` gets the same guard for the one path that doesn't route through `loadPage()` (a shift already open when midnight rolls into Sunday). Sign-in/up/account-pending stay reachable; a real Sunday lock has no exit button, only the simulated one does. Customers are exempt (the spec's frozen surfaces are all worker-side).

### A3. PPE Gating for high-hazard phases — **PARTIAL**
Spec wants a mandatory ~3-second PPE video *recording* before clock-in unlocks, scoped only to phases tagged high-hazard.

- **Have:** Correctly scoped via `task_modules.is_high_hazard` (5 of 12 seeded modules). `ppe-video.html`'s Continue button stays disabled until `recordPpeVideo()` completes — genuinely gates clock-in.
- **Missing:** No real camera capture — `recordPpeVideo()` is a 1.2s `setTimeout` simulating the recording (consistent with the prototype's no-hardware-access pattern elsewhere).

### A4. JIT training/media gate — **PARTIAL**
Master Spec wants: select a phase → full-screen unskippable video → Clock-In stays locked until 100% of video duration plays.

- **Have:** Real gating logic tied to phase selection: `selectClockInTask()` → `training-video.html` → Continue disabled until callback fires → branches by competency (auto-clears at mastery, triggers co-sign otherwise). Also independently blocks clock-in via `pendingRequiredTraining()` if today's/tomorrow's assigned training is outstanding.
- **Missing:** No actual `<video>` element or fullscreen API — it's a CSS width-transition + fixed 3-second timer. No real duration-watched enforcement.

### A5. Time & Energy Audit / Friction Check — **IMPLEMENTED** ✅ (2026-08-12)
Spec wants a mandatory clock-out prompt: "Any friction points today?" with buttons for Tool Failure, Material/Kit Delay, Hidden Site Conditions/Scope Creep, Smooth Run — routed to the right manager.

- Added as a fourth, separate mandatory clock-out gate item alongside the pre-existing "Before You Clock Out" checklist (materials/kit-photo/cleanliness stays a distinct wrap-up checklist, not folded into this). All four buttons from the spec exist on `field-clock.html`; tapping one inserts a `friction_reports` row immediately (`submitFrictionReport()`) and satisfies the gate. `resolveFrictionRouting()` routes it to the worker's branch manager (`branches.manager_id`, the same managed-by relationship `team-time.html` already used), falling back to the job's lead. `team-time.html` gets a "Friction Reports" section for the routed-to manager with an Acknowledge action.

### A6. Three-tier user progression (Entered Apprentice → Fellow Craft → Master) — **PARTIAL**
Master Spec wants Level 1 restricted to Material Staging/Cleanliness/Fleet Maintenance only (blocked from high-precision phases), Level 2 auto-unlocked after a 30-day trailing 100% compliance average, Level 3 = full admin + apprentice evaluation controls.

- **Have:** The rank axis is real and correctly kept separate from the labor-billing tiers (see [[kinetic-flow-levels-name-collision]]): `levels.json` = apprentice(1, manual) → fellow_craft(2, auto) → master(3, manual). Auto-promotion is live code (`applyScorecardToGuildProgression()`, `app.js:1765-1844`) reading a real 30-day/100%-scorecard threshold, not just seed data.
- **Missing:** No permission check restricts Level-1 apprentices to the specified task categories — no such restriction exists anywhere. "Master" rank doesn't grant admin rights; admin permissions come from a completely separate, uncoupled `roles.json` system.

### A7. "Mason's Mark" cryptographic signature — **PARTIAL**
Spec wants an unforgeable unique digital ID on every phase log/checklist/sign-off for permanent per-craftsman audit trail.

- **Have:** Every `phase_logs` row carries a `masons_mark` field styled `"sha256:<hex>"` and displayed on `field-clock.html`/`review-time.html` — more than a bare FK.
- **Missing:** It's not actually cryptographic. Generation is `'sha256:' + Date.now().toString(16) + counter` — a timestamp+counter string labeled "sha256," not a hash of the log content, trivially reproducible. The opposite of "unforgeable."

### A8. 100-Point Workman Scorecard — **IMPLEMENTED** ✅
Master Spec's exact breakdown: Production & Quality 60 (Job Well Done 55 binary + Production Speed 5 auto-calc), Logistical & Spatial 15 (Material Accountability 5, Tool Discipline 5 w/ mandatory photo, Site Cleanliness 5), Heart Side 25 (five 1–5 sliders: Initiative, Habitual Safety, Constructive Heart, Disposition to Learn, Elite Character).

- `scorecard.html`/`scorecard_entries.json` match this almost field-for-field, including the mandatory tool-discipline photo and PM review/finalize flow. No named category is missing.

### A9. "Next-Day Rule" scheduling guardrail — **IMPLEMENTED**, one caveat (2026-08-12)
(See also C6 — same rule described from the scheduling side.) Spec wants a hard minimum +1-day lag between a parts delivery date and any labor task scheduled against it.

- `scheduleStartBlockers()` checks a schedule event's proposed start date against its linked `material_orders` row: blocked entirely if the order isn't `staged` yet, and against a hard (non-configurable) 1-day-minimum lag past the staged date once it is. Checked when creating a schedule entry and re-checked live on the grid (a ⚠ flag appears on any existing row whose material status changed out from under it).
- **Caveat:** a violation surfaces as a `confirm()` ("...Schedule it anyway?") rather than an unconditional block — a deliberate choice (real PMs sometimes need to compress a schedule around an expedited delivery) but short of "hard minimum" taken completely literally.

---

## B. Kits, Carts & Inventory

### B1. "Closed-Loop Kit Debrief" (newest spec, 2026-08-12) — **IMPLEMENTED**, one caveat (2026-08-12)
Spec: on Job Close-out/Demobilization, mandatory QR kit scan → 4 fields (Performance Audit Y/N, Friction Source dropdown, per-tool maintenance checklist, Inventory Status toggle) → auto-links to Project/Asset ID → pushes to a "Rig Management Dashboard" + auto-generates a maintenance work order if flagged → surfaces in a "Weekly System Debrief."

- Built a real Job Close-out event (`job-closeout.html`, a manager/admin-gated "Close Out Job" action on job-detail.html — shared foundation with D2) that lists every kit still checked out to the job and requires a debrief (`kit_debriefs` table) for each: Performance Audit Y/N, Friction Source dropdown, per-tool maintenance checklist, Inventory Status toggle, all four fields from the spec. Debriefing auto-checks the kit back in, auto-generates a `replacement_tickets` "maintenance work order" for any flagged tool or incomplete inventory, and is job-linked by construction. Shop Logistics gets a "Rig Dashboard" tab (This Week / All Time filter) listing every debrief with its flagged count.
- **Caveat:** the "QR kit scan" is a tap-to-select from a list, not a simulated QR scan animation — consistent with how kit checkout elsewhere in the app already simulates QR routing as a tap (no real camera/QR decode exists anywhere in this prototype). The spec's two separate dashboards ("Rig Management Dashboard" and "Weekly System Debrief") were merged into one tab with a period filter rather than built as two pages.

### B2. Modular Carts vs. Specialized Kits classification — **IMPLEMENTED** ✅
`inventory_kits.json` has an explicit `kind: 'kit' | 'cart'` field; `kits.html` mirrors the spec's own language ("Specialized Kit — fixed tools, audited nightly" vs "Modular Cart — consumables, billed to jobs"). Carts own depleting `materials` rows; kits own tool rows subject to nightly audit.

### B3. Shop Hand Restock & Audit Dashboard — **IMPLEMENTED**, one scope gap
`shop-logistics.html`'s Active Audits tab matches the spec closely: kit list by derived status, selected-kit detail, Yes/No damage-free toggle, per-tool missing/damaged checklist, "Submit Audit & Create Replacement Ticket" (verified wired to `replacement_tickets.json`).

- **Gap:** the kit list filters to `kind === 'kit'` only — carts never appear in Active Audits, so it's kits-only, not "carts and kits" as spec'd.

### B4. Daily "Closed-Loop" cart/kit workflow — **PARTIAL**
Spec: AM scan-out → field "bill to job" scans → PM scan-in → auto-compiled restock pull list for carts + 60-second damage audit for kits with auto "Out of Service" flag, replenishment ticket, and shop-manager ping.

- **Have:** AM checkout, field material logging (now decrements stock), PM check-in, and live "Out of Service" derivation from open replacement tickets all genuinely work.
- **Missing:** No auto-compiled pull list from the day's scan events — the Reorder tab is just a live below-threshold stock check, not a compiled daily restock list. No notification/ping mechanism exists anywhere in the app.

### B5. "100% material-free truck" policy — **NOT IMPLEMENTED** (contradicted by data)
`locations.json` still lists `truck_1`/`truck_2` as active locations. 20 of 37 kits and 7 of 80 standalone materials currently sit at a truck location. No enum restriction or UI enforcement pushes toward zero.

### B6. Granular per-sub-task competency (4-tier) — **IMPLEMENTED** ✅
`competency_levels.json`: student(implicit "None") → exposure → competent(requires co-sign) → mastery — exactly matching spec. `task_modules.json` tracks sub-tasks *within* a division independently (e.g., "Hanging Pre-Hung Doors" vs "Installing Baseboard Trim" as separate Division 06 rows, each with its own `min_competency_to_solo`). `worker_task_competency.json` confirms per-sub-task tracking, not per-division rollup.

### B7. 30-Day Mastery Trigger + supervising-Master co-sign — **IMPLEMENTED**, one simplification
Full-screen forced training video before clock-in and a "Master Co-Sign Required" modal both exist and are wired to real competency data. Auto-promotion to Mastery after 30 compliant days (PM "Job Well Done" passes) is live code.

- **Simplification:** the co-sign modal doesn't actually prompt "who is your supervising Master on-site today" with a picker — it auto-resolves to the first available master, acknowledged in-code as a stand-in for a real second-user session (not possible in this single-session prototype).

### B8. JIT night-before push + standalone searchable Playbook library — **PARTIAL**
- **Have (as pull, not push):** job-home's "Prep for Tomorrow" section surfaces tomorrow's task training for the worker to tap and watch. `training_assignments.json` carries a `send_at` field suggesting a scheduled-push was designed in, but nothing reads/acts on it as an actual trigger — no push/notification mechanism exists in the app at all.
- **Missing entirely:** no standalone, always-accessible, searchable "Digital Playbook & Tool Vault" browse page. Video access today is scattered and assignment-scoped only (`training-video.html`, `kit-video.html`, `material-video.html`).

---

## C. Bids, Labor Rates & Scheduling

> **2026-11-24:** the bid system was rebuilt on the shared libraries; see section E, which supersedes C1-C4 where they overlap. The C notes below describe the 2026-08-12 behavior.

### C1. 3-Tier Labor Rate Engine — **IMPLEMENTED**, exact dollar match ✅
Spec wants Support & Prep $120/hr, Trade Professional $300/hr, Master Specialist $500/hr. `bid-division.html` codes exactly this: `DEFAULT_RATE_APPRENTICE=120`, `DEFAULT_RATE_FELLOW=300`, `DEFAULT_RATE_MASTER=500`, with matching UI labels "Support & Prep" / "Trade Professional" / "Master Specialist." Correctly kept independent of the worker-rank `levels.json` axis (see A6 and [[kinetic-flow-levels-name-collision]]).

### C2. Per-line-item hour-splitting across all 3 tiers — **IMPLEMENTED** ✅
`bid_line_items.json` carries `hrs_each_master/fellow_craft/apprentice` as sibling fields on one row; `calcTask()` blends labor cost across all three simultaneously — matches spec's example exactly.

### C3. Internal admin view vs. client proposal view — **IMPLEMENTED** ✅
Internal (`bid-division.html`) shows full per-tier hour math. Client-facing `bid-proposal.html` renders only a single flat dollar total per division — zero tier/rate/hour keywords anywhere in that template. Minor gap: no rolled-up "Total Apprentice Hours vs Lead Pro Hours" summary widget exists for internal crew-scheduling use, even though the per-task data to build one is already there.

### C4. Change Order tracking (Original vs. Change) — **IMPLEMENTED** as separate-table design
`change_orders`/`change_order_line_items` are real, wired tables with their own numbering, status, and 3-tier rates; each links back to its originating bid. `change-order-proposal.html` renders a signature block and generates a real invoice on send.

- **Caveat:** `signed_at`/`signature_url` fields exist in schema but there's no actual e-signature capture UI — status advances to "sent" but never programmatically to "signed." It's a signable *document* (formatted for print/physical signing), not a functioning e-sign workflow.

### C5. CSI MasterFormat divisions with dependency/lag-day scheduling — **IMPLEMENTED**, one caveat (2026-08-12)
`divisions.json`'s 41 rows all have `division_number: null` — no CSI codes assigned at all. `schedule_events.json` has no `dependency_id` or `lag_days` field; the schedule is a flat, independently-dated calendar with no sequencing/curing-gap logic.

- All 41 divisions now carry a best-effort real CSI MasterFormat division number (e.g. Framing → 06, Rough Plumbing → 22; administrative/QA-checkpoint divisions like Pre-Drywall Sign-Off land in 01 General Requirements), copied onto `bid_divisions` when toggled onto a bid, editable on `company-divisions.html`, shown on `bid-division.html`. `schedule_events` gained `dependency_id`/`lag_days`; `generateScheduleFromBid()` now chains its generated rows into a real dependency sequence instead of just sequential dates, and the "+ Add" flow lets a manual entry depend on another event with a configurable lag.
- **Caveat:** same override-not-hard-block design as A9 (see there) — a small number of CSI assignments are inherently judgment calls since not every construction phase (e.g. cleanup, inspections) maps cleanly to a trade division.

### C6. Material lifecycle (Ordered→In-Transit→Landed→Staged) + Next-Day Rule enforcement — **IMPLEMENTED** ✅ (2026-08-12)
(Same underlying rule as A9.) `materials.json` is pure static inventory — no delivery-status field, no carrier/tracking field, no lifecycle timestamps. `task_materials.json` is a plain BOM link. Nothing in the schema could enforce "task can't go Active until materials are Staged" even in principle — the two concepts aren't connected at all today.

- New `material_orders` table drives the full Ordered → In-Transit → Landed → Staged lifecycle (`advanceMaterialOrder()`), with a simulated carrier/tracking number assigned on the first advance (same honest-simulation pattern as the fake QuickBooks export and the PPE/kit-photo camera captures — no real shipping API). New `material-orders.html` page (job-detail's "Deliveries" quick action) lists a job's orders and lets a PM log/advance them. `schedule_events.material_order_id` is the link C6 needed; see A9 for the enforcement side.

### C7. Voice-to-Bid / Voice-to-Inventory dictation — **NOT IMPLEMENTED**
Confirmed absent repo-wide (no Speech Recognition API usage, no dictation UI, no NLP parsing, no division-aware clarification guardrail). Net-new feature.

---

## D. Client Communication, Invoicing & Closing

### D1. Script Vault — full shortcut-trigger library — **NOT IMPLEMENTED** (as specced)
The finalized Revision 6 spec defines ~26 shortcut triggers across 6 phases (bidding, pre-construction, daily ops, quality/delays, price/capacity, closing — `bidconsult`, `qualityfix`, `gchandoff`, `reviewask`, etc., full text in the source email). What exists today (`message_templates.json`) is a much smaller, different 6-scenario library: `job_starting_tomorrow`, `on_our_way`, `running_late`, `progress_update`, `need_reschedule`, `job_complete`. None of the bidding-phase, quality/delay, or pricing/capacity content exists even loosely.

- **Working as designed, separately:** per [[kinetic-flow-no-in-app-texting]], this is deliberately copy-to-clipboard only (the page states outright "Kinetic Flow does not send texts itself") — that part is not a gap, it's an intentional decision. Variable auto-fill (client name, job name, crew, start time) does work for the 4 placeholders the existing templates use.
- **Missing:** the other ~20 phase-specific scripts, and any contextual auto-suggest tied to geofence/schedule state.

### D2. "Surprise & Delight" mandatory closeout gatekeeper — **IMPLEMENTED** ✅ (2026-08-12)
Spec wants a hard block on marking a job 100% complete until the worker logs a small stewardship fix (preset item menu + mandatory photo), then auto-generates a paired +$75/–$75 invoice line.

- Built on the same `job-closeout.html` foundation as B1. A preset stewardship-item dropdown (five real options + Other) plus a mandatory simulated photo capture (`stewardship_logs` table) genuinely gates "Mark Job Complete" — the button stays `disabled`, not just alert-blocked, until both this and B1's kit debrief are done (`jobCloseoutReady()`). Logging the fix auto-inserts two flat `invoices` rows (+$75 / −$75, both `status: 'paid'`) — the paired add-on/credit the spec asked for, built as two rows rather than a new sub-line-item schema (matches how `generateInvoiceForChangeOrder()` already does one-row-per-event). `job-detail.html`'s percent-complete bar now shows a real 100% once `jobs.status === 'closed'`, still the 65% placeholder otherwise (a full task/phase completion rollup remains out of scope).

### D3. Automated Bid Packet Generation — **PARTIAL**
`bid-proposal.html` genuinely compiles and renders the bid's own data (scope, pricing, schedule, signature block) and exports a PDF.

- **Missing:** no upload/attach mechanism for architectural plan sets anywhere in the app, so nothing aggregates uploaded drawings into the packet as spec'd.

### D4. Digital Closing Packet & QR Code Engine — **PARTIAL**
`property_records.json` is a real but shallow finishes-log (paint colors, materials-used, floor plan URL, notes) rendered on `customer-home.html` — no sheen field, no trim-profile field, no warranty info, no supplier list, no linkage to invoices/drawings.

- **No QR generation exists anywhere in the codebase.** `customer-links.html` shows a plain-text placeholder URL string, explicitly commented as simulating the QR link concept rather than generating one. `label-generator.html` does generate real QR-bearing labels, but for shop inventory (kits/tools/materials) — unrelated to homeowner closing packets.
- No packet compiler exists that aggregates proposal + invoices + warranty + finishes log into one document.

### D5. Payroll & QuickBooks synergy — **PARTIAL**
A real UI stub exists: `team-time.html`'s "Submit All to QuickBooks" calls `submitTeamTimeToQuickBooks()`, which stamps `time_entries` rows — code comment explicitly says *"Fake QuickBooks export: no network call, just stamp the entries."* Geofenced time-capture data itself (the input side) is fully real.

- **Missing:** no actual export format (CSV/IIF) or API integration. No W-2 core-crew vs. 1099 subcontractor classification field exists anywhere (`roles.json` only has admin/manager/employee/supplier).

### D6. AI Voice Reception & Qualification (phone-answering bot) — **NOT IMPLEMENTED**
Confirmed absent repo-wide. `job_history_library.json` does hold the avg-cost/avg-hours-by-task data a future price-bracket lookup could query, but nothing calls it. Consistent with the client's own dev-tree email, which places this at the "Leaves" (lowest-priority, build-last) tier — its total absence tracks the client's own sequencing plan rather than being an oversight.

### D7. "In-Project Value Drops" (auto-push tips/updates to clients) — **NOT IMPLEMENTED**
No content-push, feed, or notification mechanism to customers exists anywhere; customer pages are read-only pull views.

---

## E. Libraries, pricing engine and accounts alignment (2026-11-24)

The owner's six shared Google Sheets libraries (LIB_01 clients, LIB_02 kits, LIB_03 materials, LIB-04 rooms,
LIB-05 scope statuses, LIB-06 master scope) now drive bids. Verdicts below supersede C1-C4 where they overlap.
Decisions: `docs/decisions/001`-`008`.

| Item | Status | Notes |
|---|---|---|
| E1. 58-division Kinetic Master Sequence with inclusion/exclusion text | **IMPLEMENTED** | Replaces the 41-name list; new companies are seeded from it. |
| E2. Division -> category -> task library with hours per unit per tier | **PARTIAL** | Imported as found: tabs 1-27 only, mostly unpriced, several tabs hold tasks from other trades (note 008). Unpriced tasks show "needs pricing". |
| E3. Labor tiers 300/500/85/120/200 PHR | **IMPLEMENTED** | Read from the sheet formulas (note 009): 300/500 task work x quantity, 85/120/200 setup/staging x trips. Supersedes C1 (flat 500/300/120). |
| E4. Friction toggles, tax, waste/freight/markup, kit deployment fees, mileage, $5 rounding | **IMPLEMENTED** | Reproduces bid 2608010 ($2,239.01 exact, $2,245 client) and the Demo sample labor/materials/total. Specialist hours 15.55 reproduced; mileage is per division with deployments, plus $90/h planning (note 009). |
| E5. Kits library (PK/EK) | **PARTIAL** | LIB_02 is filled in only for Demolition; fees mostly missing. Linked loosely to physical `inventory_kits`. |
| E6. Rooms library and room per line | **IMPLEMENTED** | 47 rooms in their own table (`locations` stays storage places). |
| E7. Scope statuses and scope-status-driven change orders (PCO -> CO-nnn, VOID, non-billable) | **IMPLEMENTED** | Supersedes C4's separate-amount design. `signChangeOrder()` is the hook for real e-signature, still absent. |
| E8. Internal vs client firewall | **IMPLEMENTED** | Supersedes C3; asserted by a browser test. |
| E9. 4-Day Sprint and payment-terms gates | **IMPLEMENTED** | Behind `bidGates`. Terms: 100% upfront under $5,000 or millwork, else 50% + Thursday handover. |
| E10. Accounts model (status, invite code, boolean role permissions, union) | **IMPLEMENTED** | Per-member permission overrides kept as a prototype extra (note 007). |
| E11. Real client rows (LIB_01) | **NOT IMPORTED** | Privacy rule: only the column shape is used; all rows are fictional. |

---

## Appendix: emails reviewed with no app-spec content

These were read in full but describe company culture, org structure, or Alma's own dev process rather than app behavior — nothing to diff against code:

- **"The Building Forward Standard: System 1,000 & Master Vision"** (2026-06-15) — the 10-category "100% standard" manifesto. Its *individual* mandates each map to specific items above (Sabbath → A2, tool maintenance → B-section, schedule reliability → C5/C6, etc.) but the email itself is a values statement, not a spec.
- **Google Doc share notification** (2026-06-16) — just the share link; content is the Master Specification, already covered above (A2, A6, A7, A8).
- **"Building Forward | Master Company Roadmap & Role Alignments"** (3 revisions, 2026-06-12) — assigns AORs to Albert/Savanna/Bradley/Andrew/Josh. The Alma-specific bullets are covered above (D1, D3, D4, D5, D6, B8); the rest is other people's job descriptions.
- **Dev-tree flowchart, prompt playbook, "getting started" emails** (2026-06-13) — these are Josh's coaching notes to help Alma structure his own Claude sessions (Roots→Trunk→Limbs→Branches→Leaves sequencing). Useful context for *prioritization* (they explicitly rank AI voice/QR/voice-to-bid as lowest-priority "Leaves"), not a feature spec.

---

## Suggested priority read

If picking up items in the order the business impact argues for:

1. ~~**B1 (Closed-Loop Kit Debrief)**~~ — done 2026-08-12.
2. ~~**D2 (Surprise & Delight)**~~ — done 2026-08-12, built on the same job-closeout foundation as B1.
3. ~~**C5/C6/A9 (scheduling ↔ materials ↔ Next-Day Rule)**~~ — done 2026-08-12.
4. ~~**A2 (Sabbath Lock)**~~ and ~~**A5 (Time & Energy Audit)**~~ — done 2026-08-12.
5. **Next up:** the remaining **PARTIAL** items, each a refinement of working code rather than a missing foundation — e.g. geofence radius/hysteresis (A1), PPE/JIT video gating (A3/A4), Mason's Mark (A7), the co-sign picker (B7), the daily cart/kit pull-list compiler (B4), the payroll export (D5), the QR/closing-packet compiler (D4). Also still open and not yet scheduled: B5 (100% material-free truck policy) and D1 (Script Vault's ~20 remaining scripts) — neither flagged as low-priority, just not picked up yet.
6. Still intentionally skipped/flagged rather than built: **C7** (Voice-to-Bid/Inventory dictation), **D6** (AI Voice Reception), **D7** (In-Project Value Drops) — the client's own dev-tree email ranks these lowest-priority "Leaves," and they need real infra (speech recognition, telephony, push) this static prototype doesn't have.
