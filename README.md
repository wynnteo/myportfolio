# My Portfolio

A Next.js + TypeScript starter configured with Tailwind CSS, ESLint, absolute import aliases, and environment validation for Yahoo Finance (RapidAPI) and Supabase.

## Getting Started

1. Copy `.env.local.example` to `.env.local` and fill in your keys.
 - `NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY`
  - `FINNHUB_API_KEY` (optional fallback for quote/dividend lookups)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `QUOTE_REVALIDATE_SECONDS` (optional cache duration for quote fetches)
2. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

## Vercel Environment Setup

Create the same variables in your Vercel project settings. Mark public keys with the `NEXT_PUBLIC_` prefix so they are available to the client. Keep the `SUPABASE_SERVICE_ROLE_KEY` server-only.

## Scripts

- `npm run dev` - Start the Next.js dev server
- `npm run build` - Create a production build
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript without emitting output
- `npm run test` - Run Vitest (add tests under `__tests__` or alongside source files)

## Supabase Auth & Data Model

- `src/lib/supabase` exposes browser and service-role clients plus small auth helpers for email/password and OAuth flows.
- `supabase/schema.sql` provisions portfolio tables (`users`, `brokers`, `accounts`, `holdings`, `transactions`, `prices_cache`), row-level security policies, and derived views:
  - `holding_costs` calculates share count, net cost, and average cost per holding in the account currency.
  - `base_currency_positions` rolls those costs into each user's base currency (default `SGD`) using the latest FX rate from `prices_cache`.
- The `brokers` seed includes SG-first platforms (MooMoo, Tiger Brokers, CMC Invest, IBKR, FSMOne, LongBridge, POEMS); extend this list by editing the insert block in `supabase/schema.sql`.
- Apply the schema with the Supabase SQL editor or `psql` after creating your project.

## Quote Fetchers

- `src/lib/quotes` provides normalized quote metadata, price snapshots, and dividend data.
- Yahoo Finance via RapidAPI is used when `NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY` is available; Finnhub (`FINNHUB_API_KEY`) acts as a fallback.
- Dividends are merged from remote sources with any manual entries you provide to `fetchQuote`.
- Caching uses Next.js incremental revalidation; override the default with `QUOTE_REVALIDATE_SECONDS` or per-call options.

## Absolute Imports

Import using `@/` from `src` (e.g., `@/components`, `@/lib`, `@/types`).

## Layout & Styling

- Base layout includes navbar and footer placeholders.
- Tailwind primary palette is defined in `tailwind.config.ts` for quick brand customization.
