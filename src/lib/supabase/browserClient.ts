'use client';

import { createClient } from '@supabase/supabase-js';

import { env } from '../env';
import { Database } from './types';

let client: ReturnType<typeof createClient<Database>> | null = null;

export const getSupabaseBrowserClient = () => {
  if (!client) {
    client = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }

  return client;
};
