# Expense Tracker

Phone-first expense tracker. Installable as an app on your phone's home screen, works fully
offline, and every number you enter stays on that phone — nothing is sent anywhere, ever.

## Install on your phone

1. Visit the GitHub Pages URL for this repo (Settings → Pages → enable, branch `main`, folder `/root` —
   one-time setup, see below).
2. In Chrome (Android) or Safari (iOS), open the menu → **Add to Home Screen**.
3. Open it from the home screen icon from then on. It works with the phone offline.

### Enabling GitHub Pages (one-time, ~10 seconds)

This repo has no server component to deploy — Pages just serves the static files as-is.
Go to **Settings → Pages** on this repo, set **Source: Deploy from a branch**, **Branch: main**,
folder **/ (root)**, save. GitHub gives you a URL like
`https://sashameyer1299.github.io/expense-tracker/`.

Nothing sensitive lives in this repo or on that URL — it's app code only. Your expense data
never leaves your phone; see **Data & privacy** below.

## Data & privacy

- All expenses are stored in the phone browser's **IndexedDB** — local to that device only.
- Categories are stored in **localStorage**, same device-only scope.
- No network requests happen at runtime. No accounts, no login, no analytics.
- **Backup:** use the **Export JSON** or **Export CSV** button in the footer to download a
  snapshot. There is no automatic sync — back up manually whenever you want a copy elsewhere
  (email it to yourself, save to a cloud drive, whatever you choose).
- **Restore:** use **Import JSON** with a previously exported file. This replaces all data
  currently on the device — it asks for confirmation first.
- Clearing the browser's site data for this app (or uninstalling it) deletes the data with it.
  Export before doing that if you want to keep it.

## Categories

Default categories mirror the household budget priority order (see `BUDGET.md`):
household floor → health → Track 1 (freelance) setup → gated homelab/tooling spend → everything
else. Add, remove, or rename categories any time under **Manage categories** in the app —
they're not hardcoded.

## Local development

No build step, no dependencies, no `npm install`. To run it locally:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. A service worker won't register over a plain `file://` URL,
so use a local server (or `npx serve`) rather than double-clicking `index.html` when testing
the offline/install behaviour.

## Files

| File | Responsibility |
|---|---|
| `index.html` | Markup / app shell — expense tracker |
| `budget.html` | Live-editable monthly budget targets per category |
| `health.html` | Quit-smoking daily log + money saved + actual Health/Quit-Smoking spend |
| `style.css` | Styling (shared by all pages) |
| `app.js` | Expense tracker logic: IndexedDB CRUD, categories, rendering, export/import |
| `budget.js` | Budget page logic: per-category targets + net income, saved to localStorage as you type |
| `health.js` | Health page logic: manual smoke-free log, streak/savings maths, reads expense DB for actual spend |
| `manifest.json` | PWA metadata (name, icon, install behaviour) |
| `sw.js` | Service worker — caches the app shell for offline use |
| `icon.svg` / `icon-192.png` / `icon-512.png` | App icon |
| `BUDGET.md` | Category structure reference and priority rationale — actual figures live in `budget.html` |

## Income and unexpected expenses

Not tracked yet. The app only logs money going out; "Net income" on the Budget page is a
number you type in, not a live ledger of income events. Ask for an Income log if you want
actual side-income entries tracked over time instead. Unexpected expenses currently have no
special handling — log them under whichever category fits, or add an "Unexpected" category
yourself under Manage Categories.
