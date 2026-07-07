---
name: verify
description: Build/launch/drive recipe for verifying changes to this static HTML prototype (App Simulator shell + Kinetic Flow app).
---

# Verifying kinetic-flow-html

Static site, no build step. `fetch()` of pages/db seeds requires http — don't open via `file://`.

## Launch

```bash
(python3 -m http.server 8931 >/dev/null 2>&1 &)   # from repo root
curl -s -o /dev/null -w "%{http_code}" http://localhost:8931/index.html   # expect 200
```

Node is NOT installed in this sandbox; Python 3 + Playwright (chromium) are available at `/home/alma/apps/venv/bin/python3`.

## Drive (Playwright, sync API)

- `page.goto("http://localhost:8931/index.html")`, then `wait_for_timeout(800)` for the OS boot animation.
- The phone home screen shows app icons: `page.click(".home-icon")` opens Kinetic Flow; first open fetches ~41 `db/*.json` seeds — allow ~1s.
- App content renders inside `#main`; assert with `page.locator("#main").inner_text()`.
- App state is inspectable: `page.evaluate("() => state.currentPage")` etc. (kinetic-flow's `activate()` puts `state`, `DB`, and page functions on `window`).
- Header controls (account type, role, "Sign in as…" switcher, Reset Data, size presets) live outside the phone and work before the app icon is ever tapped.
- Reset Data / other `confirm()` flows: register `page.once("dialog", lambda d: d.accept())` **before** clicking.
- Persistence is localStorage key `kineticFlow.state`; clear it (or click Reset Data) for a pristine run.
- Capture `pageerror` and console errors — the app has no error overlay, failures are silent.

## Flows worth driving

- Sign-in: focus `#signin-email` opens the account picker; seeded logins like `master@kineticflow.com` (see db/users.json).
- Header "Sign in as…" (`#header-account-switch`): instant account switch from any screen.
- Reset Data (`#btn-reset-data`): confirm → reload → sign-in page, storage cleared.

## Cleanup

```bash
pkill -f "http.server 8931"
```
