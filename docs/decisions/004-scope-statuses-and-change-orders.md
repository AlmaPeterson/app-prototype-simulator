# 004 Change orders are scope-status-driven lines

Date: 2026-11-24

## Decision
Every bid and change-order line has a `scope_status_id` (LIB-05). Totals count a line only if its status is billable and not VOID: BASE, FIELD-TM, ALLOW-RECON and CO-nnn are billable; PCO (pending proposal), PUNCH-INT, WAR-RPR and VOID are not. A change order is numbered with the library code (CO-001 for the first on a bid). Its lines start at **PCO** (priced and shown as "pending", not billed); on **sign** every PCO line flips to the change order's own code and becomes billable. VOID and non-billable lines stay visible in the editor but are excluded from totals and from the client proposal. The change-orders page shows a ledger: original contract (BASE) + signed change orders = contract sum, with pending PCO shown separately. The old ids `CO-<year>-<seq>` are replaced. CO-021 and above are created on demand; only CO-001..CO-020 are seeded.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
A free-text title/amount per change order; inline Original/Change columns per division (rejected earlier for the same reason).

## Who is affected
Change-order screens, invoices (amount = proposed total), finance.

## When to revisit
If signature capture becomes real, `signChangeOrder()` is the single place to hook it.
