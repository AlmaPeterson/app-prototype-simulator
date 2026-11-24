# 001 Library seed tables: names, ids and reconciliation with existing tables

Date: 2026-11-24

## Decision
Add one seed table per shared Google Sheets library and keep the existing tables working:
- `divisions` is replaced by the 58-division Kinetic Master Sequence (LIB-06 tab CI) with `scope_inclusions` / `scope_exclusions` text split at the sheet's "Excludes:".
- `scope_tasks` (LIB-06 division tabs), `kits` (LIB_02), `rooms` (LIB-04), `scope_statuses` (LIB-05, CO-001..CO-020 only), `labor_rates` are new tables.
- `materials` (LIB_03) is the **existing** materials table extended in place: every row gains `supplier`, `part_number`, `spec`, `lead_time_days`, `waste_pct`, `freight`, `markup_pct`, `price_per_unit`, `division_number`, `library_source`. LIB_03 rows are appended with `library_source: 'LIB_03'`, `stock_qty: 0`. Existing 251 stock items keep their ids and `unit_cost`, and are priceable in bids with the default 24% markup.
- `rooms` is a new table. `locations` keeps its meaning (shop / truck / trailer storage places).
- `kits` (priceable library definitions: pod id, deployment fee, rental, burn, rig, replacement value, chassis) is separate from `inventory_kits` (physical kits that get checked out and debriefed). `inventory_kits.library_kit_id` and `kits.inventory_kit_id` are nullable links; no seeded match exists because the names do not correspond. Kit checkout, audits and debriefs are untouched.
- `customers` gains the LIB_01 column shape (`client_name`, `site_address`, `phone_1`, `phone_2`, `billing_address`); all rows are fictional (example.com, 555 numbers). No LIB_01 rows were read.
- New tables use deterministic UUIDv5 ids (real DB convention). Existing rows keep their readable ids (`company-kineticflow`, `user-master`, `biddiv-1`) because 50 seed tables reference them; rewriting them would risk the kit/schedule/invoice features for no user-visible gain.
- Money in JSON is exact to cents (library prices like 208.3333333 are stored as 208.33); rounding happens only for display and for the sheet's own client-price rounding.
- Standard columns on every new row: `company_id`, `created_at`, `updated_at` (UTC), `deleted_at`, `sync_status`.
- `DB_VERSION` bumped 20 to 21 so old localStorage snapshots reset.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Merge rooms into `locations` (name clash with storage places); a second `library_materials` table (two sources of truth for prices); re-keying all existing ids to UUIDs.

## Who is affected
Estimators (new pickers), crew (kit checkout unchanged), anyone reading `divisions` (company-divisions page, material-orders dropdown).

## When to revisit
When the real backend defines `scope_tasks` / `kits` tables, or when the owner wants LIB_01 rows imported (needs a privacy decision).
