export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          base_currency: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          base_currency?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          base_currency?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_id_fkey';
            columns: ['id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      brokers: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          user_id: string;
          broker_id: string | null;
          currency: string;
          nickname: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          broker_id?: string | null;
          currency: string;
          nickname?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          broker_id?: string | null;
          currency?: string;
          nickname?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'accounts_broker_id_fkey';
            columns: ['broker_id'];
            referencedRelation: 'brokers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'accounts_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      holdings: {
        Row: {
          id: string;
          account_id: string;
          symbol: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          account_id: string;
          symbol: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          account_id?: string;
          symbol?: string;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'holdings_account_id_fkey';
            columns: ['account_id'];
            referencedRelation: 'accounts';
            referencedColumns: ['id'];
          }
        ];
      };
      transactions: {
        Row: {
          id: string;
          holding_id: string;
          type:
            | 'buy'
            | 'sell'
            | 'deposit'
            | 'withdrawal'
            | 'dividend'
            | 'fee';
          quantity: number | null;
          gross_amount: number | null;
          fee: number | null;
          fx_rate: number | null;
          trade_date: string;
          settle_date: string | null;
          notes: string | null;
          tags: string[] | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          holding_id: string;
          type:
            | 'buy'
            | 'sell'
            | 'deposit'
            | 'withdrawal'
            | 'dividend'
            | 'fee';
          quantity?: number | null;
          gross_amount?: number | null;
          fee?: number | null;
          fx_rate?: number | null;
          trade_date?: string;
          settle_date?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          holding_id?: string;
          type?:
            | 'buy'
            | 'sell'
            | 'deposit'
            | 'withdrawal'
            | 'dividend'
            | 'fee';
          quantity?: number | null;
          gross_amount?: number | null;
          fee?: number | null;
          fx_rate?: number | null;
          trade_date?: string;
          settle_date?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_holding_id_fkey';
            columns: ['holding_id'];
            referencedRelation: 'holdings';
            referencedColumns: ['id'];
          }
        ];
      };
      prices_cache: {
        Row: {
          symbol: string;
          as_of: string;
          currency: string;
          price: number;
          source: string | null;
          created_at: string | null;
        };
        Insert: {
          symbol: string;
          as_of?: string;
          currency: string;
          price: number;
          source?: string | null;
          created_at?: string | null;
        };
        Update: {
          symbol?: string;
          as_of?: string;
          currency?: string;
          price?: number;
          source?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      holding_costs: {
        Row: {
          holding_id: string | null;
          account_id: string | null;
          account_currency: string | null;
          total_quantity: number | null;
          net_cost: number | null;
          average_cost_per_unit: number | null;
        };
      };
      base_currency_positions: {
        Row: {
          holding_id: string | null;
          account_id: string | null;
          account_currency: string | null;
          base_currency: string | null;
          total_quantity: number | null;
          net_cost_account_currency: number | null;
          average_cost_per_unit: number | null;
          cost_in_base_currency: number | null;
          average_cost_in_base_currency: number | null;
        };
      };
    };
    Functions: {};
    Enums: {
      transaction_type:
        | 'buy'
        | 'sell'
        | 'deposit'
        | 'withdrawal'
        | 'dividend'
        | 'fee';
    };
  };
};
