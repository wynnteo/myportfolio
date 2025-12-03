# Personal Portfolio Tracker

A simple Next.js (Pages Router) dashboard for tracking portfolio transactions with Turso (Vercel Storage) via `@libsql/client`.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Provide database credentials in `.env.local` or your Vercel project settings:
   ```bash
   LIBSQL_URL="..."
   LIBSQL_AUTH_TOKEN="..."
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```

The app uses a demo user id (`demo-user`) for all API requests. Swap this for real authentication later.
