# Perudo

An online multiplayer version of a house-rule Perudo / Liar's Dice.

Real-time, hidden information, server-authoritative rules. The dice live in the
database and the browser is never trusted with anyone's cup but its own.

## Status

Under construction. See [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md)
for where things stand.

Working today: the database foundation (schema + RLS), the rule engine for the
defined rules, and anonymous sign-in with a player name. Not yet: rooms, rounds,
dice, or play — several house rules are still undecided and are deliberately not
implemented. See [`docs/GAME_RULES.md`](docs/GAME_RULES.md) §12.

## Running it

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

The Supabase project needs the migrations in `supabase/migrations/` applied, and
**anonymous sign-ins enabled** under Authentication → Sign In / Providers.

## Checks

| Command | What it does |
|---|---|
| `npm test` | Rule engine and validation (Vitest) |
| `npm run test:db` | Applies the migrations to a throwaway PostgreSQL instance and asserts the RLS behaviour |
| `npm run build` | Typecheck and production build |
| `npm run lint` | Lint |

`test:db` needs the PostgreSQL 16 server binaries, not just `psql`.

## Documentation

| File | Contents |
|---|---|
| [`docs/GAME_RULES.md`](docs/GAME_RULES.md) | **The authoritative rules.** If code disagrees, this wins |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Security model, data model, concurrency, risks |
| [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md) | Phases, current state, what is blocked |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Why things are the way they are |
| [`docs/TODO.md`](docs/TODO.md) | Backlog and known debt |
