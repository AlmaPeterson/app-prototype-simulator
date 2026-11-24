# 007 Users, companies and roles aligned with the real accounts model

Date: 2026-11-24

## Decision
- `users.status` (pending / approved / rejected) replaces the prototype's `approval_status`. Seeded users are `approved`, `user-pending` is `pending`. Rejecting an account sets `rejected` (row kept, cannot sign in, hidden from member lists) instead of soft-deleting it.
- `companies.invite_code`: 8 characters from A-Z2-7, shown with a Regenerate action on the manage-users page.
- `roles.permissions` is now a `map[string]bool` (`manageUsers`, `manageBids`, `manageInventory`, `financeNationwide`, `financeBranch`, `financeJob`). `userPermissions(userId)` returns the **union** across a user's active roles; `hasPermission(key)` / `canManageUsers()` use it. The prototype's per-member `overrides` is kept as a prototype extra (an override replaces that membership's map). Old snake_case keys in saved overrides are still read.
- Ids of existing rows stay readable (see note 001).

## Why
The owner decided "data first, then screens": the prototype's seeds must mirror the six shared libraries and the real database conventions before the screens are rewired, so the screens never carry business data of their own.

## Alternatives considered
Keep the string `finance` field; drop per-member overrides entirely.

## Who is affected
Manage Users screen, sign-in gate, header menu entries.

## When to revisit
When overrides are removed from the real model, drop them here.
