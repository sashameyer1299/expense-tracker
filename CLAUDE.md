# expense-tracker — project notes

Phone-first, offline expense tracker. Static site, installable PWA. No backend, no build step,
no dependencies. Deliberately deviates from the operator's default TS+Node stack because there
is no server component at all — plain HTML/CSS/JS is the smallest thing that works here.

## Architecture

- `index.html` / `style.css` / `app.js` — the whole app. One file per responsibility, no
  framework, no bundler.
- Data lives in the browser: **IndexedDB** for expense records, **localStorage** for the
  editable category list. Nothing is sent over the network at runtime — keep it that way.
- `sw.js` is a plain cache-first service worker for the app shell. Bump `CACHE_NAME` when
  changing any cached file so clients pick up the update.
- `manifest.json` makes it installable to a phone home screen.

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
