# Modular Carts & Specialized Kit Tracking

Written 2026-07-14, implemented same day. Read
[kinetic-flow-materials-kit-unification-plan.md](kinetic-flow-materials-kit-unification-plan.md)
first — this builds directly on that plan's `kit_id`/`item_type` model on
`materials`, and doesn't repeat that reasoning here.

## Why this came up

Contractor (Josh) sent a spec for a "100% material-free truck" operating
model: trucks carry nothing, trade divisions get **Modular Carts**
(consumable stock, billed to jobs as it's used, restocked daily) instead of
truck-stocked materials, and the company's own **Specialized Kits** (fixed
tool packages — Dryer Vent Cleaning Kit, PEX Crimping Kit, etc.) must come
back 100% complete every night via a shop-hand daily audit: flag any
missing/damaged tool, auto-generate a replacement ticket, get the kit back
to "ready" before the next morning. His email included a mocked-up "Shop
Logistics" dashboard (Active Audits / History / Reorder tabs, kit select
list with status, Pass/Fail + missing-item checklist, Submit Audit button)
and a "closed-loop" workflow built around QR-scanning carts/kits out to a
trailer in the morning and back in at night.

## Decisions

**A cart is just an `inventory_kits` row with `kind: 'cart'`.** No new table
for cart contents. The materials-kit-unification plan already made "a kit
owns a set of `materials` rows via `kit_id` + `item_type`" the data model
for kits — a cart is the exact same shape, just with every owned row being
`item_type: 'material'` (consumables) instead of a mix with `item_type:
'tool'`. Existing rows got `kind: 'kit'` via a straight seed-data edit (no
runtime migration needed — this codebase's precedent, per the unification
plan, is to bake new fields into the seed JSON directly and bump
`DB_VERSION` so stale localStorage snapshots get discarded).

**No real QR scanning — taps instead, per existing precedent.** The
materials-kit-unification plan already explicitly decided against real
scan-to-page routing (this is a backend-less static prototype with no URL
scheme for it). The contractor's "scan out in the morning / scan slot to
bill to job / scan back in at night" workflow becomes three tap actions:
**Check Out to Job** and **Check In** buttons on a kit's detail view in
`kits.html`, and the existing Field Clock **Material Log** modal for
"bill to job" (see below — this one turned out to already exist).

**"Bill to Job" was already built — it just didn't deplete stock.**
`getCheckedOutKits()`/`saveMaterialLog()` in `app.js` already scope Field
Clock's Material Log picker to whatever kits are checked out for the
current job (via `kit_checkouts`) and log a `task_materials` row per
quantity entered. Once carts are `inventory_kits` rows, that mechanism
already **is** the bill-to-job ledger. The one real gap: it never touched
`stock_qty`. Fixed with a single line — `saveMaterialLog()` now also
decrements the logged material's `stock_qty`, which makes the existing
`stock_qty < reorder_qty` low-stock check (already used by
`inventory.html`) drive the cart side of the Reorder tab for free.

**Kit status is derived, never stored.** `getKitStatus(kit)` in `app.js`
computes Ready / In-Transit / Needs Audit / Out of Service live from
`kit_checkouts` (open checkout → in-transit), `replacement_tickets` (any
open ticket → out of service), and `kit_audits` (no row dated today → needs
audit). This avoids a stored-status-vs-reality drift bug and matches how
low-stock is already computed live elsewhere. Only meaningful for `kind:
'kit'` rows — carts don't have a pass/fail daily state, just stock levels.

**`kit_checkouts` was read-only before this — now it's live.** The table
existed with seeded rows but nothing in the app ever inserted or closed
one. `checkOutKitToJob()` / `checkInKit()` (app.js) are the first writers;
checking in is what flips a kit's derived status to `needs_audit`.

**Restocking stays "checklist only," extended consistently.** The
unification plan's restocking section (F) explicitly deferred real
stocked/short tracking for kits — this pass doesn't relitigate that for
kit *tools* (still a pass/fail audit + replacement ticket, no quantity
math). Carts get one small step further, since depleting/restocking
consumables is the entire point of the cart model: `stock_qty` decrements
on Material Log, and "Mark Restocked" on the Reorder tab resets it to
`reorder_qty * 2` — a simple par level, not a real receiving workflow.

**No new taxonomy for carts.** Josh's spec talks about carts "for every
division we do," but this codebase already has three independent, unlinked
taxonomies (40 CSI `divisions`, free-text kit `category` strings, and
inventory.html's SKU-prefix category tabs — see the unification plan).
Carts use the same free-text `inventory_kits.category` field kits already
use, with a Kit/Cart segmented filter added to `kits.html` on top. Mapping
carts onto all 40 CSI divisions literally was judged out of scope for a
prototype where the category system is already informal.

**Permission: new `manage_inventory` flag, not reusing `manage_users`.**
Added to `roles.json.permissions` (true for admin/manager, false for
employee/supplier), checked via `canManageInventory()` — same shape as the
existing `canManageUsers()`. A shop hand running daily audits isn't
necessarily someone who manages team accounts, so it's a separate flag.
"Shop Logistics" was added to the ⋯ header menu's Management section
(`showHeaderMenu()`), next to "Manage Users," rather than a bottom-nav tab
or a button buried in `kits.html` — matches how this app already surfaces
admin-only pages.

## What was built

- **Schema**: `inventory_kits.kind: 'kit'|'cart'`; new tables `kit_audits`
  (`kit_id, job_id, audited_by, audit_date, status, issues[]`) and
  `replacement_tickets` (`kit_audit_id, kit_id, material_id, item_name,
  issue_type, status`), one ticket per flagged audit issue. `DB_VERSION`
  13 → 14.
- **`app.js`**: `getOpenCheckout`, `getKitStatus`, `KIT_STATUS_LABELS`,
  `checkOutKitToJob`, `checkInKit`, `submitKitAudit`,
  `fulfillReplacementTicket`, `canManageInventory`, `openShopLogistics`;
  `saveMaterialLog()` now depletes `stock_qty`.
- **`kits.html`**: Kit/Cart segmented filter (`setKitKindFilter`), a Kind
  selector on create/edit, a plain-text status line for kit rows (no
  colored pills — matches the app's neutral-styling rule), and Check
  Out/Check In controls.
- **New page `shop-logistics.html`**: Active Audits (select a kit needing
  attention → Pass/Fail → flag tool rows Missing/Damaged/Needs Replacement
  → submit), History (past audits), Reorder (open replacement tickets +
  low-stock cart materials, each with a one-tap resolve action).
- **Seed data**: existing kits got `kind: 'kit'`; added a demo kit
  ("Dryer Duct Cleaning Kit 01") reusing Josh's own mockup example, seeded
  already `out_of_service` with one open ticket (Flexible Rotary Rod,
  damaged) so Shop Logistics has real content on first load; added three
  carts (Plumbing/Electrical/Sprinkler Cart 01) with consumable materials,
  a few seeded already below `reorder_qty` so the Reorder tab isn't empty
  either.

## Explicitly out of scope for this pass

- Real QR-code scan-to-action routing (see the unification plan's identical
  decision — still applies).
- Any allocation/inventory-accounting logic beyond `stock_qty <
  reorder_qty` and the `reorder_qty * 2` restock par level.
- Mapping carts onto the 40 CSI divisions as a real taxonomy.

## For the actual Google Doc

The user's "Kinetic Flow — Master Blueprint v1.0" Google Doc's Section 5
(Inventory & Training) and Section 9 (Database Schema Overview) should get
a short addition pointing at this file, plus `kit_audits` and
`replacement_tickets` added to Section 9's Inventory Tables list — no tool
exists in this environment that can edit that Google Doc in place, so
that's left for the user to paste in by hand.
