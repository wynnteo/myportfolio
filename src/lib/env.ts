import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Supabase URL must be a valid URL.').optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Missing Supabase anon key.').optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Missing Supabase service role key.').optional(),
});

const parsedEnv = envSchema.safeParse({
  NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY: process.env.NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

if (!parsedEnv.success) {
  console.warn('⚠️ Environment variables are missing or invalid:', parsedEnv.error.flatten().fieldErrors);
}

export const env = parsedEnv.success
  ? parsedEnv.data
  : {
      NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY: process.env.NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
