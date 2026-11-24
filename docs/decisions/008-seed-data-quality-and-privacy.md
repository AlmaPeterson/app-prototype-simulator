# 008 Seed bids, library data quality and the privacy rule

Date: 2026-11-24

## Decision
- Privacy: no client name, address, phone or email from any sheet is in the repo (the sample bid workbook contains a real client; only its numbers and structure were used). Every seeded person is fictional. LIB_01 rows were never read.
- The three seeded bids were rebuilt on the library: Riverside (division 4 library tasks plus rough HVAC), Northview (rough plumbing), Summit (rough electrical); their old division numbers were remapped to the Kinetic Master Sequence (18, 19, 20). Divisions without a usable library grid use **custom** lines with realistic hours; totals are computed by the engine at seed time.
- Library data is a draft and was imported as found: tabs 1-27 only (divisions 28-58 have no task grid), tab 1 holds test rows and was skipped, several tabs (2, 19, 20) contain tasks copied from other trades (for example concrete tasks under rough electrical) and a few hours look like typos (1 h per SF). Taxonomy-only rows (names with no hours) are kept and show as needs pricing. LIB_02 kits are filled in only for Demolition and a few rows; the other pods import as names without fees (needs pricing).
- Specialist hours on the Demo sample tab (15.55) could not be reproduced (see note 003).

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Hand-clean the library while importing; drop unpriced rows.

## Who is affected
Estimators will see unpriced tasks everywhere outside Demolition until the sheets are filled.

## When to revisit
After the owner cleans the libraries, rerun the import (the scripts are described in CLAUDE.md).
