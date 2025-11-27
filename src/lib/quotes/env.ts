import { z } from 'zod';

const quoteEnvSchema = z.object({
  YAHOO_FINANCE_RAPIDAPI_KEY: z.string().min(1).optional(),
  FINNHUB_API_KEY: z.string().min(1).optional(),
  QUOTE_REVALIDATE_SECONDS: z.coerce.number().positive().optional(),
});

const parsedQuoteEnv = quoteEnvSchema.safeParse({
  YAHOO_FINANCE_RAPIDAPI_KEY:
    process.env.NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY ??
    process.env.YAHOO_FINANCE_RAPIDAPI_KEY,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  QUOTE_REVALIDATE_SECONDS: process.env.QUOTE_REVALIDATE_SECONDS,
});

if (!parsedQuoteEnv.success) {
  console.error('❌ Invalid quote environment variables:', parsedQuoteEnv.error.flatten().fieldErrors);
  throw new Error('Invalid quote environment variables');
}

export const quoteEnv = parsedQuoteEnv.data;
