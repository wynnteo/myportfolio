'use server';

import { createClient } from '@supabase/supabase-js';

import { env } from '../env';
import { Database } from './types';

let serviceClient: ReturnType<typeof createClient<Database>> | null = null;

export const getSupabaseServiceRoleClient = () => {
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
