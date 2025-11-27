'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '../env';
import { Database } from './types';

let serviceClient: SupabaseClient<Database> | null = null;

export const getSupabaseServiceRoleClient = (): SupabaseClient<Database> => {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role credentials are not configured.');
  }

  if (!serviceClient) {
    serviceClient = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          'x-client-info': 'service-role',
        },
      },
    });
  }

  return serviceClient;
};
