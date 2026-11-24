# 002 Labor tiers and the 300/500/85/120/200 PHR rate columns

> **Superseded in part by note 009** (2026-11-24): 85/120/200 are setup/staging rates charged per trip, and 200 is Lead/Master staging (`staging_lead`), not a Certified Specialist.

Date: 2026-11-24

## Decision
The division tabs have five hours-per-unit columns headed `300 PHR`, `500 PHR`, `85 PHR`, `120 PHR`, `200 PHR` (in that order) but the Labor Tier Summary has four rows (Apprentice, Specialist, Lead, Master). Mapping used, stored in the `labor_rates` table so it is editable per company:
- 300 PHR = **Lead** (the sheet's "Lead Execution (pro rate)" column). Verified: bid 2608010 division 4 prices 7 posts x 0.4 h and 1 load x 1 h, all at $300, and the tab reports Lead hours 3.8 and Specialist/Apprentice/Master 0.
- 500 PHR = **Master** ("Master Consultation / High risk / Master certifications").
- 85 PHR = **Apprentice**, 120 PHR = **Specialist** (rate order and the position of the one-off apprentice-style tasks such as drywall patching).
- 200 PHR = **Certified Specialist**, a fifth code that the summary rolls up under Specialist hours. No sheet text names it, so this is the least certain mapping.
The hours-per-unit cells for a task are read positionally (first five numeric cells after the unit of measure; when six cells appear the fourth is a "days" helper and is dropped). Cells showing `$ -` are zero.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Treat 200 PHR as a second Lead rate; fold 85/120/200 into one Specialist rate; hard-code rates in JS.

## Who is affected
Pricing of every task, tier hour summaries, the internal summary view.

## When to revisit
Confirm 85/120/200 with the owner; any change is a one-row edit in `labor_rates.json`.
