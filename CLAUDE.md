# expense-tracker — project notes

Phone-first, offline-first expense tracker. Static site, installable PWA, no build step, no
npm/CDN dependencies. Deliberately deviates from the operator's default TS+Node stack because
there's no application server — plain HTML/CSS/JS is the smallest thing that works here.

**Sync (as of the Supabase build):** local IndexedDB/localStorage is still the fast offline
cache and the app works fully with no network at all — but it now also syncs, best-effort, to a
Supabase project (two-device household sync) via `supabase-sync.js`, using plain `fetch()`
against Supabase's REST API, not the `supabase-js` library (that would violate the no-CDN/no-npm
rule below). Every sync call is wrapped to no-op silently when offline or unreachable. See
"Sync architecture" further down before touching any sync code.

## Architecture

Six pages, each a self-contained HTML+JS pair, no shared modules (no build step, so small
duplication across files — e.g. `openDB()`, the pay-cycle `monthKey`/`monthLabel` — is
intentional, not an oversight):

- **Overview** (`overview.html`/`overview.js`) — the landing page (`manifest.json` start_url).
  Read-only summary of the current pay period: income vs. assumed, spend vs. budgeted, real
  cash position, total debt. Pulls from all three IndexedDB stores plus localStorage; doesn't
  own any data itself.
- **Expenses** (`index.html`/`app.js`) — the expense log, including the "unexpected" flag.
- **Budget** (`budget.html`/`budget.js`) — editable per-category targets + actual income read.
- **Health** (`health.html`/`health.js`) — quit-smoking log + actual health-category spend.
- **Income** (`income.html`/`income.js`) — the income log.
- **Debts** (`debts.html`/`debts.js`) — debt definitions (name, balance, typical payment).
  Balances are normally reduced from `app.js` when an expense is linked to a debt via
  `debtId` — see `adjustDebtBalance()` there. Don't add a second, competing place that mutates
  debt balances without going through the same reversal logic on edit/delete.

Every page's "this month" (`monthKey`/`monthLabel`) actually means the pay cycle, 25th to 24th
— `PAYDAY = 25`, duplicated in `app.js`, `budget.js`, `health.js`, `income.js`, `overview.js`.
Keep the constant and the function names in sync across those five if payday ever changes;
don't let one page silently drift back to calendar-month semantics.

`nav-swipe.js` is shared across all six pages (one file, not duplicated per page) — it's
generic page-order navigation, not page-specific logic, so it doesn't follow the
per-page-duplication convention the DB helpers do. Swipe left/right moves between pages in
`PAGE_ORDER`. It ignores touches starting inside `.categoryList`, which has its own touch
handling for long-press-drag reordering (in `app.js`) — don't remove that guard, the two
gesture handlers would otherwise fight over the same touch events.

Data lives in the browser only, nothing sent over the network at runtime — keep it that way:
- **IndexedDB** (`expenseTrackerDB`, currently version 3) with three object stores: `expenses`,
  `income`, and `debts`. Every page that opens the DB runs the same `onupgradeneeded` block that
  creates all three if missing, because a visitor can land on any page first — don't let one
  page assume another has already initialized the schema. Bump `DB_VERSION` (in all six files
  that open the DB: `app.js`, `budget.js`, `health.js`, `income.js`, `debts.js`, `overview.js`)
  if the schema changes again.
- **localStorage** for the editable category list, budget targets, net income figure, and the
  quit-smoking daily log.

`sw.js` is a plain cache-first service worker for the app shell — bump `CACHE_NAME` and add any
new file to `APP_SHELL` when changing what's cached, so installed clients pick up the update.
`manifest.json` makes it installable to a phone home screen.

## Sync architecture

`supabase-sync.js` (shared across all six pages, like `nav-swipe.js`) holds `SUPABASE_URL`,
`SUPABASE_KEY` (the publishable/anon key — safe to expose client-side by design, security comes
from RLS policies, not secrecy of this key), and the generic transport: `supabasePull`,
`supabasePush` (upsert via `Prefer: resolution=merge-duplicates`), `supabaseDelete`,
`supabasePullSettings`/`supabasePushSettings` (the single-row `settings` table), and
`syncStore(table, { getAllLocal, putLocal, toRemote })` — a last-write-wins merge by
`updated_at` (remote wins when newer; local-only records get pushed up). No realtime/websocket
client — `scheduleFocusSync()` re-syncs on tab focus/visibility instead, which is simpler and
dependency-free.

Every record needs a **client-generated UUID** (`crypto.randomUUID()`) as its `id`, not
IndexedDB's `autoIncrement` — two independently-writing devices would collide on integers.
Local objects stay **camelCase** (`debtId`, `updatedAt`); Postgres columns are **snake_case**
(`debt_id`, `updated_at`) — each page that talks to a given table defines its own
`toSupabaseX`/`fromSupabaseX` mapper pair (duplicated per file, same convention as the DB
helpers). `supabase/schema.sql` is the schema to run in Supabase's SQL Editor if the database
is ever recreated — keep it in sync with any column changes.

Every add/edit must stamp `updatedAt = new Date().toISOString()` before writing locally, or
sync's last-write-wins comparison silently breaks for that record (comparing against an
`Invalid Date` never wins). `migrateExpenses()`/`migrateDebts()`/`migrateIncome()` are one-time
passes that convert any pre-sync numeric-id records to UUIDs (delete old, add new — an
IndexedDB record's key can't be changed via `put()`) and backfill missing `updatedAt`; they're
idempotent and safe to leave running on every load.

## Hard constraints — do not violate

- No build step. Don't introduce TypeScript, bundlers, or npm dependencies unless the operator
  explicitly asks — this must stay editable and deployable by pushing static files as-is.
- No third-party scripts, fonts, or CDNs, and no `supabase-js` — sync goes through plain
  `fetch()` against Supabase's REST API only (see "Sync architecture"). Everything else
  self-contained.
- Local IndexedDB/localStorage remains the source of truth for "does this app work offline" —
  every sync call must degrade to a silent no-op when offline, never block or break local
  reads/writes.

## Categories and urgency

Category and urgency (1-5, matching `BUDGET.md`'s priority order) are separate fields, not one
combined string. `DEFAULT_CATEGORIES` in `app.js`/`budget.js` is an array of `{ name, urgency }`.
The Expenses page's category input is a free-text `<input>` with a `<datalist>` for known names
(typable, not locked to a picklist) plus a required urgency `<select>`; typing a new category
name auto-registers it in the categories list at the chosen urgency. Every expense record stores
`urgency` directly — Health and Budget filter/group on `e.urgency`, not by re-parsing the
category name, so don't reintroduce a text-prefix convention for priority.
