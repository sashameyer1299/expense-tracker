# Budget — category structure

Priority order, per the master plan: household floor → health → Track 1 (freelance CAD, USD
income) setup → gated homelab/tooling spend → everything else. Net income: N$15,100/month.
Capital available: under N$2,000 for the next 3 months — treat as near-zero.

**The live, editable numbers now live in the app, not this file** — open `budget.html` (linked
from the Expenses page header). It's a per-category input table that saves as you type, backed
by the same localStorage-only model as the rest of the app: no git commits needed to update a
figure, nothing leaves the phone. This file stays as the priority-order reference and rationale;
treat the app as the source of truth for actual amounts.

The tables below are placeholders only, kept for context on the structure — do not treat them
as current figures.

## 1. Household floor (wife + 2 daughters) — highest priority

| Category | Monthly N$ | Notes |
|---|---|---|
| Rent | — | |
| Food & Groceries | — | |
| Utilities | — | water, electricity, etc. |
| Transport | — | |
| Family & Kids | — | school, clothing, etc. |
| Medical | — | |

**Subtotal:** —

## 2. Health (jog + quit-smoking)

| Category | Monthly N$ | Notes |
|---|---|---|
| Health & Fitness | — | running shoes/gear, etc. |
| Quit-Smoking | — | nicotine replacement, etc. |

**Subtotal:** —

## 3. Track 1 setup (near-zero cost: Payoneer/Wise, portfolio pieces)

| Category | Monthly N$ | Notes |
|---|---|---|
| Track 1 Setup (Freelance) | — | Payoneer/Wise fees, portfolio material, USD-income tooling |

**Subtotal:** —

## 4. Gated homelab/tooling spend — only after specific income milestones (masterplan Part 6)

| Category | Monthly N$ | Notes |
|---|---|---|
| Homelab / Tooling (gated) | — | do not spend here until the relevant milestone is hit |

**Subtotal:** —

## 5. Everything else

| Category | Monthly N$ | Notes |
|---|---|---|
| Other | — | |

**Subtotal:** —

---

**Total budgeted:** — vs **Net income: N$15,100/month**
**Remaining / shortfall:** —

## How this maps to the app

Category and priority are separate fields in the app now, not one combined string. Each
expense has a free-typed **category** name (e.g. "Rent") and a selected **urgency** (1–5,
matching the sections above). The category input suggests known names as you type but accepts
anything; typing a new one adds it to the list automatically at whatever urgency you picked. The
five sections above correspond to urgency 1 through 5 — that mapping is what groups the Budget
page's targets and what the Health page uses to isolate urgency-2 (Health) spend.

## Next step

Send over real monthly numbers (rent, food, transport, family costs, etc.) for section 1
first — household floor is highest priority and everything else is sized against what's left
over after it.
