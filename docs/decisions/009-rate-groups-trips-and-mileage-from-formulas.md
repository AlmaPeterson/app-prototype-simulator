# 009 Rate groups, trips and per-division mileage, read from the sheet formulas

Date: 2026-11-24

Supersedes the 85/120/200 mapping in note 002 and the mileage and Specialist-hours guesses in note 003.

## Decision
Notes 002 and 003 were worked out from cell *values*. This note uses the *formulas* in an `.xlsx` export of the
blank "Under Construction AIBP" workbook and of LIB-06 (identical on all 58 division tabs):
- **Task performance** (columns W, Y; $300 Lead, $500 Master): `AA = Q x (W x 300 + Y x 500) x (1 + 0.1 per friction box)`.
- **Setup, staging and cleanup** (columns AE, AG, AI; $85 Apprentice prep/support, $120 Specialist trained on the strike
  pod, $200 "driving, setup, staging, tear down performed by Lead/Master"):
  `AK = (AI x 200 + AG x 120 + AE x 85) x AD`, where AD is "Number of Mobilization Cycles / Return Trips".
  These are hours per trip, **not** per unit, and friction does not apply. The labor rate code `certified` is renamed
  `staging_lead` (the old code is still read as an alias).
- **Labor Tier Summary** (E6:E9) is `quantity x hours` for Apprentice/Specialist/Lead/Master and ignores the 200 column.
  This explains the Demo tab's 15.55 Specialist hours (12x1 + 1x1 + 1x1 + 12x0.1 + 1x0.1 + 1x0.25), which add $0
  there because AD is blank. The engine reports the summary the same way.
- **Mileage block, per division tab:** planning `AD4 = miles from base (CI!G5) x 2 x 2.8`; execution `AD5 = AC5 x 2`
  with AC5 typed in as 6 (the $12.00); planning labor `AA4 = hours x 90`. Mileage lines are added to the division's
  Material Cost and planning labor to its Labor, **only when that division's "# of Deployments" (V4) is set**.
  The engine now does this per division (`form_data.deployments`, `form_data.planning_hours` on `bid_divisions`)
  instead of once per bid. New setting `planning_rate_per_hour` (90) replaces `planning_trips`.
- Lines get a `trips` field (null = the library task's `default_trips`, from LIB-06 column AD). A task whose only hours
  are staging hours and has 0 trips is flagged **needs trips** (counted as needs pricing) instead of silently $0.
- `scope_tasks` hours were re-read from the xlsx: the earlier positional read of the text preview had shifted
  columns (for example, it read the trip count as Apprentice hours). 311 of 335 tasks matched a LIB-06 row and were
  replaced (176 changed); the other 24 are mostly continuation lines with no hours and were kept.
- Seeded demo bid lines that became "needs trips" were given 1 trip, and seeded rollups were recomputed. The seeded
  bids are cheaper now (Riverside $7,610 -> $5,490, Northview $2,135 -> $410, Summit $9,880 -> $8,200) because staging is
  no longer multiplied by quantity.

## Why
The formulas are the source of truth for how Kinetic Builders prices a bid; values alone left three questions open.

## Alternatives considered
Keep staging x quantity (matches the hours summary but not the price); default every line to 1 trip (hides the
sheet's $0 behaviour); keep mileage once per bid.

## Who is affected
Every bid and change-order total, the division page (new Trips, Deployments and Planning-hours inputs), seeded bids.

## When to revisit
Ask the owner: (1) should staging hours in the summary be x quantity (sheet E6:E9) or x trips (sheet AK)? The two
disagree; (2) what the typed-in 6 in the "Executing The Plan" line means (gallons? miles?); (3) the "# of Deployments"
formula on tab 4 shows an error (`sum(AC13:AC324) if`), so deployments may be meant to be counted, not ticked;
(4) whether 337 LIB-06 tasks with staging hours and no trips are drafts or expect trips per bid.
