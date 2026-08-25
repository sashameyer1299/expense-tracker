-- Run this once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Four tables, no auth/login tables — this project is dedicated to one household's data, so RLS
-- policies are permissive (anyone holding the publishable key can read/write); the publishable
-- key itself is meant to be exposed client-side, per Supabase's model.

create table if not exists expenses (
  id uuid primary key,
  date date not null,
  category text not null,
  urgency int not null,
  amount numeric not null,
  note text default '',
  unexpected boolean default false,
  debt_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists income (
  id uuid primary key,
  date date not null,
  source text not null,
  amount numeric not null,
  note text default '',
  updated_at timestamptz not null default now()
);

create table if not exists debts (
  id uuid primary key,
  name text not null,
  balance numeric not null,
  monthly_payment numeric default 0,
  note text default '',
  updated_at timestamptz not null default now()
);

-- Single-row table for everything that used to be localStorage-only (categories, budget
-- targets, net income, owner name, the quit-smoking log). The check constraint enforces
-- exactly one row.
create table if not exists settings (
  id boolean primary key default true check (id),
  owner_name text default '',
  net_income numeric default 0,
  categories jsonb default '[]',
  budget_targets jsonb default '{}',
  smoke_daily_cost numeric default 0,
  smoke_log jsonb default '{}',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (true) on conflict (id) do nothing;

alter table expenses enable row level security;
alter table income enable row level security;
alter table debts enable row level security;
alter table settings enable row level security;

create policy "allow all" on expenses for all using (true) with check (true);
create policy "allow all" on income for all using (true) with check (true);
create policy "allow all" on debts for all using (true) with check (true);
create policy "allow all" on settings for all using (true) with check (true);
