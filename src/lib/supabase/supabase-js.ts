/* eslint-disable no-unused-vars */

export type Provider = string;

export interface SupabaseAuthClient {
  signUp: (..._args: any[]) => Promise<any>;
  signInWithPassword: (..._args: any[]) => Promise<any>;
  signInWithOAuth: (..._args: any[]) => Promise<any>;
  signOut: (..._args: any[]) => Promise<any>;
}

export interface SupabaseClient<Database = any> {
  auth: SupabaseAuthClient;
  _database?: Database;
}

const unsupported = (...args: any[]) => {
  void args;

  return Promise.reject(
    new Error('Supabase client stub invoked: install @supabase/supabase-js to enable functionality.'),
  );
};

export function createClient<Database = any>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: Record<string, any>,
): SupabaseClient<Database> {
  void supabaseUrl;
  void supabaseKey;
  void options;

  return {
    auth: {
      signUp: unsupported,
      signInWithPassword: unsupported,
      signInWithOAuth: unsupported,
      signOut: unsupported,
    },
  };
}
