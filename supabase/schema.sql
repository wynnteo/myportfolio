-- Schema and RLS configuration for portfolio tracking

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create type public.transaction_type as enum (
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'dividend',
  'fee'
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  base_currency text not null default 'SGD',
  created_at timestamptz default now()
);

enable row level security on public.users;

create policy "Users can manage their profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz default now()
);

enable row level security on public.brokers;
create policy "Everyone can read brokers" on public.brokers
  for select using (true);
create policy "Service role can manage brokers" on public.brokers
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

insert into public.brokers (slug, name)
values
  ('moomoo', 'MooMoo'),
  ('tiger-brokers', 'Tiger Brokers'),
  ('cmc-invest', 'CMC Invest'),
  ('poems', 'POEMS'),
  ('ibkr', 'IBKR'),
  ('fsmone', 'FSMOne'),
  ('longbridge', 'LongBridge')
on conflict (slug) do nothing;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  broker_id uuid references public.brokers (id),
  currency text not null,
  nickname text,
  created_at timestamptz default now()
);

enable row level security on public.accounts;
create policy "Users can manage their accounts" on public.accounts
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  symbol text not null,
  created_at timestamptz default now()
);

enable row level security on public.holdings;
create policy "Users can manage holdings in their accounts" on public.holdings
  using (
    exists (
      select 1
      from public.accounts a
      where a.id = account_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.accounts a
      where a.id = account_id
        and a.user_id = auth.uid()
    )
  );

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  holding_id uuid not null references public.holdings (id) on delete cascade,
  type public.transaction_type not null,
  quantity numeric,
  gross_amount numeric,
  fee numeric,
  fx_rate numeric default 1,
  trade_date date not null default current_date,
  settle_date date,
  notes text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

enable row level security on public.transactions;
create policy "Users can manage transactions on their holdings" on public.transactions
  using (
    exists (
      select 1
      from public.holdings h
      join public.accounts a on a.id = h.account_id
      where h.id = holding_id
        and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.holdings h
      join public.accounts a on a.id = h.account_id
      where h.id = holding_id
        and a.user_id = auth.uid()
    )
  );

create table if not exists public.prices_cache (
  symbol text not null,
  as_of timestamptz not null default now(),
  currency text not null,
  price numeric not null,
  source text,
  created_at timestamptz default now(),
  primary key (symbol, as_of)
);

enable row level security on public.prices_cache;
create policy "Everyone can read cached prices" on public.prices_cache
  for select using (true);
create policy "Service role can manage cached prices" on public.prices_cache
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace view public.holding_costs as
with txn_agg as (
  select
    h.id as holding_id,
    h.account_id,
    a.currency as account_currency,
    coalesce(
      sum(
        case
          when t.type in ('buy', 'sell') then
            t.quantity * case when t.type = 'buy' then 1 else -1 end
          else 0
        end
      ),
      0
    ) as total_quantity,
    coalesce(
      sum(
        case
          when t.type in ('buy', 'sell') then
            (t.gross_amount + coalesce(t.fee, 0)) * coalesce(t.fx_rate, 1)
            * case when t.type = 'buy' then 1 else -1 end
          else 0
        end
      ),
      0
    ) as net_cost
  from public.holdings h
  join public.accounts a on a.id = h.account_id
  left join public.transactions t on t.holding_id = h.id
  group by h.id, h.account_id, a.currency
)
select
  holding_id,
  account_id,
  account_currency,
  nullif(total_quantity, 0) as total_quantity,
  net_cost,
  case
    when total_quantity > 0 then net_cost / total_quantity
    else null
  end as average_cost_per_unit
from txn_agg;

create or replace view public.base_currency_positions as
select
  hc.holding_id,
  hc.account_id,
  hc.account_currency,
  u.base_currency,
  hc.total_quantity,
  hc.net_cost as net_cost_account_currency,
  hc.average_cost_per_unit,
  (hc.net_cost * coalesce(fx.price, 1)) as cost_in_base_currency,
  case
    when hc.total_quantity is not null and hc.total_quantity > 0 then
      (hc.net_cost * coalesce(fx.price, 1)) / hc.total_quantity
    else null
  end as average_cost_in_base_currency
from public.holding_costs hc
join public.accounts a on a.id = hc.account_id
join public.users u on u.id = a.user_id
left join lateral (
  select price
  from public.prices_cache pc
  where pc.symbol = concat(hc.account_currency, '/', u.base_currency)
  order by pc.as_of desc
  limit 1
) fx on true;
