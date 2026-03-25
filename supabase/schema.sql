create extension if not exists pgcrypto;

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid references public.decks(id) on delete set null,
  character text not null,
  pinyin text not null default '',
  meaning text not null default '',
  examples jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  notes text not null default '',
  interval integer not null default 0,
  repetitions integer not null default 0,
  ease_factor double precision not null default 2.5,
  next_review timestamptz not null default now(),
  last_review timestamptz,
  writing_score double precision,
  writing_count integer not null default 0,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  reviewed_at timestamptz not null,
  rating integer not null,
  interval_days integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.writing_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  practiced_at timestamptz not null,
  score double precision,
  stroke_count integer not null,
  updated_at timestamptz not null default now()
);

alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.writing_logs enable row level security;

drop policy if exists "decks_select_own" on public.decks;
create policy "decks_select_own" on public.decks
for select using (auth.uid() = owner_id);

drop policy if exists "decks_insert_own" on public.decks;
create policy "decks_insert_own" on public.decks
for insert with check (auth.uid() = owner_id);

drop policy if exists "decks_update_own" on public.decks;
create policy "decks_update_own" on public.decks
for update using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
for select using (auth.uid() = owner_id);

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
for insert with check (auth.uid() = owner_id);

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
for update using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "review_logs_select_own" on public.review_logs;
create policy "review_logs_select_own" on public.review_logs
for select using (auth.uid() = owner_id);

drop policy if exists "review_logs_insert_own" on public.review_logs;
create policy "review_logs_insert_own" on public.review_logs
for insert with check (auth.uid() = owner_id);

drop policy if exists "review_logs_update_own" on public.review_logs;
create policy "review_logs_update_own" on public.review_logs
for update using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "writing_logs_select_own" on public.writing_logs;
create policy "writing_logs_select_own" on public.writing_logs
for select using (auth.uid() = owner_id);

drop policy if exists "writing_logs_insert_own" on public.writing_logs;
create policy "writing_logs_insert_own" on public.writing_logs
for insert with check (auth.uid() = owner_id);

drop policy if exists "writing_logs_update_own" on public.writing_logs;
create policy "writing_logs_update_own" on public.writing_logs
for update using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
