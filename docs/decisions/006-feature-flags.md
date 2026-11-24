# 006 Feature flags and what OFF does

Date: 2026-11-24

## Decision
`FLAGS` in app.js, persisted in the state snapshot, toggled from the header menu (Feature Flags). Both default ON.
- `libraryBids` OFF: the add panel offers only **Custom task** (free-typed name, unit, lead hours, price) and hides library tasks and materials. Existing library lines keep working; nothing is deleted.
- `bidGates` OFF: no 4-Day Sprint / payment-terms / needs-pricing panels on bid.html, and the payment schedule falls back to the legacy fixed 50/20/20/10 draws (with milestone text fields) in the page, the PDF and the invoices. The needs-pricing send block is not a gate flag; it always applies.
The pricing engine, tables and the client/internal split are not flagged (they are the data foundation). Persisted data written under either mode is compatible with the other.

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
One flag per screen; a flag around the pricing engine.

## Who is affected
Anyone demoing the prototype; testers can compare against the old behaviour.

## When to revisit
Remove the flags once the owner signs off on the library flow.
