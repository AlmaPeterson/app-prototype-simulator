# Plan: Unify Materials & Kits, Kit Video Pages, Supplier Scoping

Written 2026-07-08, from a design discussion (not yet implemented). Handing this off
so a fresh session can pick it up without re-deriving the reasoning. Read
[kinetic-flow-app.md](kinetic-flow-app.md) first for general app/architecture context —
note it predates several of the changes referenced below (image/video uploads,
trailer tools, standalone-tools view), so don't trust it over the actual code for
current state.

## Why this came up

Kits (`inventory_kits`) currently store their tools/materials in two separate,
disconnected tables:

- `kit_tools` — name-only rows (`id, company_id, kit_id, name, sort_order`, plus
  `image_asset_id` added recently). No link to `materials`.
- `kit_items` — similar, plus an optional `material_id` link and a `quantity`.

Meanwhile `materials` (the Inventory table) is where photo/video/brand/stock/location
live — the stuff we built out over the last few sessions (image uploads, video
uploads + a dedicated watch page, brand/reference_url fields for the 62 trailer
tools). A tool sitting inside a kit today doesn't have any of that: it's just a name
string, disconnected from its "real" counterpart (if one even exists) in Inventory.

## Decisions made in discussion (confirmed with the user)

1. **Duplicates across kits are correct, not a bug.** A tape measure in the
   electrical kit and a tape measure in the plumbing kit are two different physical
   objects — they should be two different rows, each with its own photo/condition/
   stock, not one shared "Tape Measure" record referenced twice. This ruled out an
   earlier idea of a single shared catalog row + join table.

2. **`kit_tools` and `kit_items` go away, folded directly into `materials`.** Every
   kit-owned tool/material becomes its own full `materials` row. A new field,
   `kit_id` (nullable), marks which kit a row physically lives in. `kit_id: null`
   means the row is standalone and uses the existing `location` field (shop /
   truck_1 / truck_2 / trailer) instead.

3. **No new "quantity" concept** — a kit-owned row's `stock_qty` *is* how many of
   that item are in the kit (reusing the field materials already has). This also
   means the existing low-stock logic (`stock_qty < reorder_qty`) works per-kit-item
   for free.

4. **`inventory_kits` stays a separate table.** Kit-level metadata (category,
   description, cover image, training videos) doesn't belong on a tool's row — a kit
   isn't itself a tool, it's a bundle/location that owns rows.

5. **Migration needs no deduplication.** Since duplicates are the correct model,
   every existing `kit_tools`/`kit_items` row unconditionally becomes one new
   `materials` row (with `kit_id` set) — no matching/merging logic required. Low
   risk, mechanical transform.

6. **Suppliers only see shop inventory.** `location === 'shop'` (not trucks, not
   trailer, not kit-owned rows). Suppliers restock the shop; they don't touch kits
   directly. Use the existing `userIsSupplier()` helper to gate this.

7. **Kit videos become a dedicated page**, matching what already exists for
   materials (`pages/material-video.html`). Currently kit videos open in a modal
   (`openKitVideo` in `pages/kits.html`) — convert that to a real page for
   consistency (and because a real page is a smaller step toward eventual QR-code
   linking, see below).

8. **QR-code scanning is explicitly NOT being prototyped.** The original idea was
   "print a QR code on a tool/kit label that opens its video page." Two relevant
   findings from investigation:
   - Label Designer (`apps/label-designer`) already has real, scannable QR code
     support bound to per-row data (`js/lib/qrcode-loader.js`, `qrValueBinding` in
     `js/types.js`) — this is how the trailer tools' YouTube reference links were
     wired into their label CSV. No new work needed there if/when this is revisited.
   - This app has **no real URL-based routing today** — the existing "customer QR
     link" (`customer-links` picker) is fully simulated (an in-app fake list, not a
     real distinct URL). Building actual scan-to-page routing would require a new
     URL scheme (e.g. `index.html?tool=<id>`) and figuring out sign-in-required vs.
     public no-auth pages — real, non-trivial work.
   - **Decision: skip all of that for now.** The requirement collapses to "tapping
     the item in the app opens its video page" (already true for materials; item 7
     above makes it true for kits too). "Works without being signed in" is real-world
     scope for the eventual production app, not this prototype — explicitly out of
     scope here.

## Decisions made 2026-07-08 (resolving prior open questions)

1. **Restocking model: checklist only.** A kit just lists required items/quantities;
   no stocked/short tracking and no real allocation for this pass. (Rejected the
   "stocked/short flag" recommendation from the original discussion — keeping this
   pass mechanical.)

2. **Tools vs. Materials grouping: add `item_type` field.** `materials` rows get
   `item_type: 'tool' | 'material'`, replacing the old `kit_tools`/`kit_items`
   table split as the signal for which section of the kit detail page a row
   belongs in.

3. **Kit-owned row location: `location` = the kit's id.** Not left `null`, and not
   copied from `inventory_kits.location` — instead `location` is set to the kit's
   own id (i.e. the same value as the new `kit_id` field), so every `materials` row
   always has a populated `location` and kit-owned rows are identifiable via that
   field without a join. Note this means `location` is no longer a closed enum of
   `shop | truck_1 | truck_2 | trailer` — anywhere that renders/filters on
   `location` as that enum (dropdowns, filter chips, supplier scoping) needs to
   handle kit ids showing up in that field too. Supplier scoping (section E) already
   filters on `location === 'shop'` specifically so it's unaffected, but any
   generic "location" dropdown UI needs a look during implementation.

4. **Inventory list UX for kit-owned rows: still unresolved, solve during
   implementation.** `materials` goes from ~80 rows to 200+ once every kit's
   contents are folded in. `pages/inventory.html`'s flat list + category tabs need
   *some* way to separate "standalone stock" from "what's inside kit X" — not
   designed yet, flagged as a real gap to solve during implementation, not before.

5. **Photo/brand inheritance: yes, backfill.** When migrating a `kit_items` row
   that has a `material_id` link to a real standalone `materials` row (e.g. "200A
   Panel" in the Basic Electrical Kit linking to `matl-200a-panel`), copy that
   row's `image_url`/`brand` as the starting point for the new kit-owned duplicate
   rather than leaving it blank.

## Concrete work breakdown (for whoever implements this)

### A. Schema / migration
- Add `kit_id: null` to every existing `materials` row (all 80, including the 62
  trailer tools — they'll stay `kit_id: null`, `location` unchanged).
- Add `item_type: 'tool' | 'material'` field to every `materials` row (standalone
  rows: infer from existing category, or default sensibly — worth a quick pass to
  assign, not left blank).
- Write a one-time migration script: for each `kit_tools` row, create a new
  `materials` row (`kit_id` = that row's `kit_id`, `location` = that same kit id,
  `item_type: 'tool'`, `stock_qty` = its quantity if present else 1, default
  `unit: 'each'`, `unit_cost: 0`, blank photo/video/brand/reference_url unless a
  linked material exists to backfill from). Same for `kit_items` (`item_type:
  'material'`, `stock_qty` = quantity, backfill `image_url`/`brand` from
  `material_id`'s row if present).
- Delete `db/kit_tools.json` and `db/kit_items.json`. Remove both from the `TABLES`
  array in `apps/kinetic-flow/app.js`.
- Note: `location` stops being a closed `shop | truck_1 | truck_2 | trailer` enum
  once kit ids can appear there — audit any dropdown/filter that assumes the fixed
  enum (see section E).
- Bump `DB_VERSION` in `apps/kinetic-flow/app.js` (currently 8) so the migrated seed
  data actually loads for existing users instead of being masked by their
  localStorage snapshot.

### B. `apps/kinetic-flow/pages/kits.html`
- `kitDetailHtml()`: replace the `kit_tools`/`kit_items` queries with
  `DB.find('materials', m => m.kit_id === kit.id && !m.deleted_at)`, split into
  Tools/Materials sections via `item_type`.
- `openKitItemEditor` / `saveKitItemEdit` / `addKitEntry` / `saveKitEntry` /
  `removeKitItem`: currently operate on `kindTable(kind)` = `'kit_tools' |
  'kit_items'` — rewrite to operate on `'materials'` with `kit_id` set. These
  should probably gain the same photo/video upload UI Inventory's item panel has
  (a kit-owned row is a full materials row now, so it deserves the same editing
  capability) — worth factoring the shared upload/preview logic (currently
  duplicated between `inventory.html` and `kits.html`) into `app.js` so both pages
  call the same helpers instead of maintaining two copies.
- Convert `openKitVideo` (modal) into navigation to a new dedicated page — see
  section C.
- `loadStandaloneMaterials()` (used by the "Standalone Tools" view) simplifies to
  `DB.find('materials', m => !m.kit_id && ...)` — no more cross-referencing
  `kit_items.material_id`.

### C. New page: kit video (dedicated, replacing the modal)
- Model on `pages/material-video.html`. Kits can have *multiple* videos
  (`inventory_kits.videos` is an array), unlike materials (`video_asset_id` is
  singular) — so this page needs a video identifier, not just a kit id. Recommend
  giving each entry in `kit.videos` its own generated `id` (instead of relying on
  array index, which breaks under reordering/deletion) — e.g.
  `{id, title, video_asset_id}`. Set `state.kitVideoId` + `state.kitVideoEntryId`
  before `loadPage('kit-video')`, same handoff pattern `material-video.html` uses
  for `state.materialVideoId`.

### D. `apps/kinetic-flow/pages/label-generator.html`
- `loadCategories()`: switch from `kit_tools`/`kit_items` queries to
  `materials.filter(m => m.kit_id === k.id)`.
- `loadStandaloneGroups()`: simplifies the same way as kits.html's standalone view.

### E. `apps/kinetic-flow/pages/inventory.html`
- Add supplier scoping: when `userIsSupplier()`, filter `loadMaterials()` to
  `location === 'shop'` only (confirmed: not trucks, not trailer, not kit-owned;
  `location === 'shop'` still works fine as a filter even though the field is no
  longer a closed enum, since kit ids never equal `'shop'`).
- Still unresolved (open question #4): list UX once kit-owned rows are included —
  needs actual design, not just a query change. Solve during implementation.
- Any other UI that renders `location` as one of the four fixed enum values (e.g.
  a location filter dropdown) needs to either exclude kit-owned rows or render the
  kit's name for kit-id locations — check `inventory.html` and `label-generator.html`
  for these.

### F. Restocking — checklist only, no new build
- Decided: checklist tier only for this pass (kit lists required items/quantities,
  no stocked/short tracking, no allocation/audit trail). No new schema or UI work
  needed beyond what sections A–D already produce.

## Explicitly out of scope for this pass
- Real QR-code scan-to-page URL routing (query params, public/unauthenticated
  pages). Revisit only if the prototype needs to demo the actual scan flow later.
- "Works without being signed in" for any page — production-app concern, not this
  prototype.
