# expense-tracker — project notes

Phone-first, offline expense tracker. Static site, installable PWA. No backend, no build step,
no dependencies. Deliberately deviates from the operator's default TS+Node stack because there
is no server component at all — plain HTML/CSS/JS is the smallest thing that works here.

## Architecture

Four pages, each a self-contained HTML+JS pair, no shared modules (no build step, so small
duplication across files — e.g. `openDB()` — is intentional, not an oversight):

- **Expenses** (`index.html`/`app.js`) — the expense log, including the "unexpected" flag.
- **Budget** (`budget.html`/`budget.js`) — editable per-category targets + actual income read.
- **Health** (`health.html`/`health.js`) — quit-smoking log + actual health-category spend.
- **Income** (`income.html`/`income.js`) — the income log.

Data lives in the browser only, nothing sent over the network at runtime — keep it that way:
- **IndexedDB** (`expenseTrackerDB`, currently version 2) with two object stores: `expenses` and
  `income`. Every page that opens the DB runs the same `onupgradeneeded` block that creates both
  stores if missing, because a visitor can land on any page first — don't let one page assume
  another has already initialized the schema. Bump `DB_VERSION` (in all four files that open the
  DB) if the schema changes again.
- **localStorage** for the editable category list, budget targets, net income figure, and the
  quit-smoking daily log.

`sw.js` is a plain cache-first service worker for the app shell — bump `CACHE_NAME` and add any
new file to `APP_SHELL` when changing what's cached, so installed clients pick up the update.
`manifest.json` makes it installable to a phone home screen.

## Hard constraints — do not violate

- No backend, no server, no API calls. If a feature seems to need one, it's out of scope for
  this repo (see the operator's local-only privacy stance — financial data does not leave the
  device without an explicit, manual export).
- No build step. Don't introduce TypeScript, bundlers, or npm dependencies unless the operator
  explicitly asks — this must stay editable and deployable by pushing static files as-is.
- No third-party scripts, fonts, or CDNs. Everything self-contained.

## Categories

The default category list in `app.js` (`DEFAULT_CATEGORIES`) mirrors the household budget's
priority order — see `BUDGET.md`. If the budget structure changes, update both in sync.
