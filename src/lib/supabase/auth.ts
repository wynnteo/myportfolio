'use client';

import { Provider } from '@supabase/supabase-js';

import { getSupabaseBrowserClient } from './browserClient';

export const signUpWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseBrowserClient();

  return supabase.auth.signUp({ email, password });
};

export const signInWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseBrowserClient();

  return supabase.auth.signInWithPassword({ email, password });
};

export const signInWithOAuth = async (provider: Provider) => {
  const supabase = getSupabaseBrowserClient();

  return supabase.auth.signInWithOAuth({ provider });
};

export const signOut = async () => {
  const supabase = getSupabaseBrowserClient();

  return supabase.auth.signOut();
};
