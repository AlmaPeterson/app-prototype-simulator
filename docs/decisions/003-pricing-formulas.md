# 003 Pricing formulas decoded from the sheets, and the guesses

Date: 2026-11-24

## Decision
`apps/kinetic-flow/pricing.js` (pure functions, tested in `tests/pricing.html`). Recovered from sheet values:
- Task labor = quantity x hours-per-unit x tier rate x (1 + 0.10 x number of friction toggles). Friction is **additive** (three toggles = x1.3): 12 SF x 0.1 h x $300 x 1.3 = $468, two toggles on 1 h = $360. Tier hours reported on the summary are raw (before friction); days use friction-adjusted hours.
- Library material = (price x (1 + waste) + freight) x (1 + markup). $100 dump fee at 24% = $124; staples $80.68 = $100.0432.
- Tax multiplier 1.0745 is applied **once to a division's material subtotal** (372 x 1.0745 = 399.71; per-line rounding would give 399.72).
- Kit deployment fee: charged once per kit per division (the same PK kit on two lines is one deployment). Not taxed.
- Division "Material Cost" on the sheet = taxed materials + kit fees + mileage.
- Client price per division = exact total rounded **up to the next $5** (1596.51 -> 1600, 642.50 -> 645, 2279.57 -> 2280; nearest-$5 would give 1595, so ceiling it is). The proposal grand total is the sum of those, $2,245 for bid 2608010 while the DPS sheet shows the exact $2,239.01.
- Contingency = 10% of labor, shown beside the total, **not** added (the sheet's totals exclude it). `includeContingency` in `system_state` turns it on.
- Mileage (guess): the sheet shows $44.80 for 8 miles away (16 round-trip miles x $2.80) plus a flat $12.00 "Executing The Plan" fuel line, charged once on the first division with lines (DPS shows it only on division 4). I could not recover the formula for the $12.00 or why deployments show 0, so both are settings (`mileage_rate_per_mile`, `execution_fuel_allowance`).
- Days = ceil(friction-adjusted hours / (8 x guys on site)).
Settings live in `system_state` rows (real table) so they are editable data, not code.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Round to the nearest $5 or $10; apply tax per line; fold contingency into totals.

## Who is affected
All bid and change-order totals, invoices cut from bid totals.

## When to revisit
Specialist hours on the Demo sample tab (15.55) cannot be derived from the visible grid; ask the owner what feeds that cell. Revisit the mileage guess with a second filled bid.
