# Pulse

Pulse is a local-first budgeting app: plan your month, track what you actually spend, and see where your savings go.
Your data is stored only in your browser (IndexedDB). There is no server and no account.

It grew out of a personal budgeting spreadsheet and keeps its ideas:

- **Three main blocks**: Income, Expenses and Savings. Inside each, categories with unlimited subcategories.
- **Tags** (`#football`) to see everything about one topic across categories.
- **Budget vs. actual** per month and per year.
- **Main Pot**: whatever is left after expenses and savings is saved automatically, and it can cover months where
  expenses are bigger than income.
- **Savings that you spend later**: put money aside for a trip, spend it when you go, and still see that you saved it,
  without the trip wrecking that month's expenses.

## Status

Early development. Done so far: categories, tags, settings, the budget planner, tracking (manual entry, Revolut
statement import, search and filters, expected monthly payments, planned vs tracked per category) and backup/restore.
Coming next: category balances and goals, then the dashboard.

## Using it

Pulse is published at https://irenencina.github.io/pulse/ every time `main` changes (see
`.github/workflows/pages.yml`). Your data stays in the browser you use it in; use **Settings → Backup** to keep a copy.

## Running it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run dev      # opens on http://localhost:5173
```

Other scripts:

```sh
npm test         # unit tests (Vitest)
npm run typecheck
npm run build    # production build in dist/
```

## How it's built

React + TypeScript + Vite. Data lives in IndexedDB through [Dexie](https://dexie.org/). Amounts are stored as integer
cents. Business rules live in `src/domain/` as plain functions with tests next to them; `src/db/` reads and writes the
database; `src/pages/` is the UI.

## License

[MIT](LICENSE)
