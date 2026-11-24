# 005 Two-sided firewall and "needs pricing"

Date: 2026-11-24

## Decision
Internal side (editor, division stats, Internal Summary on bid.html, change-order stats) shows hours, tiers, kits, bill of materials, exact totals and contingency. Client side (bid-proposal, change-order-proposal, the generated PDFs) is built only from `bidProposalModel()` / `changeOrderProposalModel()`: library scope text (division inclusions / exclusions), each task's scope-of-work with quantity and unit, ONE fixed total per division and a grand total. A test drives both and asserts the proposal text has no hours, tiers, kit fees, contingency or pod ids.
A task with no production hours, or a material/kit with no price, is flagged NEEDS PRICING on the line, counted in the division and bid headers, excluded from totals (never silently $0), and **blocks Send to Customer** until fixed.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Treat unpriced as $0 with a warning; allow sending with an unpriced disclaimer.

## Who is affected
Estimators and customers; the PDF is generated from the client model.

## When to revisit
If the client wants a line-item view, add it to the client model only.
