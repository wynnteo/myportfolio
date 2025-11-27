import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY: z
    .string()
    .min(1, 'Missing Yahoo Finance RapidAPI key.'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Supabase URL must be a valid URL.'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Missing Supabase anon key.'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Missing Supabase service role key.'),
});

const parsedEnv = envSchema.safeParse({
  NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY: process.env.NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsedEnv.data;
