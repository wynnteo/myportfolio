# My Portfolio

A Next.js + TypeScript starter configured with Tailwind CSS, ESLint, absolute import aliases, and environment validation for Yahoo Finance (RapidAPI) and Supabase.

## Getting Started

1. Copy `.env.local.example` to `.env.local` and fill in your keys.
   - `NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
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

## Absolute Imports

Import using `@/` from `src` (e.g., `@/components`, `@/lib`, `@/types`).

## Layout & Styling

- Base layout includes navbar and footer placeholders.
- Tailwind primary palette is defined in `tailwind.config.ts` for quick brand customization.
