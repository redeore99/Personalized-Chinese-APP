create extension if not exists pgcrypto;

create table if not exists public.app_config (
  singleton boolean primary key default true check (singleton),
  allowed_email text not null
);

insert into public.app_config (singleton, allowed_email)
values (true, 'your-email@example.com')
on conflict (singleton) do update
set allowed_email = excluded.allowed_email;

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower(
    coalesce((select allowed_email from public.app_config where singleton = true), '')
  );
$$;

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint decks_owner_id_id_unique unique (owner_id, id)
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid,
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
  deleted_at timestamptz,
  constraint cards_owner_id_id_unique unique (owner_id, id),
  constraint cards_owner_deck_fk foreign key (owner_id, deck_id)
    references public.decks (owner_id, id)
    on delete set null
);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  reviewed_at timestamptz not null,
  rating integer not null,
  interval_days integer not null,
  updated_at timestamptz not null default now(),
  constraint review_logs_owner_card_fk foreign key (owner_id, card_id)
    references public.cards (owner_id, id)
    on delete cascade
);

create table if not exists public.writing_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  practiced_at timestamptz not null,
  score double precision,
  stroke_count integer not null,
  updated_at timestamptz not null default now(),
  constraint writing_logs_owner_card_fk foreign key (owner_id, card_id)
    references public.cards (owner_id, id)
    on delete cascade
);

alter table public.app_config enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.writing_logs enable row level security;

drop policy if exists "app_config_select_allowed" on public.app_config;
create policy "app_config_select_allowed" on public.app_config
for select using (public.is_allowed_user());

drop policy if exists "app_config_update_allowed" on public.app_config;
create policy "app_config_update_allowed" on public.app_config
for update using (public.is_allowed_user())
with check (public.is_allowed_user());

drop policy if exists "decks_select_allowed" on public.decks;
create policy "decks_select_allowed" on public.decks
for select using (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "decks_insert_allowed" on public.decks;
create policy "decks_insert_allowed" on public.decks
for insert with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "decks_update_allowed" on public.decks;
create policy "decks_update_allowed" on public.decks
for update using (public.is_allowed_user() and auth.uid() = owner_id)
with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "cards_select_allowed" on public.cards;
create policy "cards_select_allowed" on public.cards
for select using (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "cards_insert_allowed" on public.cards;
create policy "cards_insert_allowed" on public.cards
for insert with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "cards_update_allowed" on public.cards;
create policy "cards_update_allowed" on public.cards
for update using (public.is_allowed_user() and auth.uid() = owner_id)
with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "review_logs_select_allowed" on public.review_logs;
create policy "review_logs_select_allowed" on public.review_logs
for select using (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "review_logs_insert_allowed" on public.review_logs;
create policy "review_logs_insert_allowed" on public.review_logs
for insert with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "review_logs_update_allowed" on public.review_logs;
create policy "review_logs_update_allowed" on public.review_logs
for update using (public.is_allowed_user() and auth.uid() = owner_id)
with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "writing_logs_select_allowed" on public.writing_logs;
create policy "writing_logs_select_allowed" on public.writing_logs
for select using (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "writing_logs_insert_allowed" on public.writing_logs;
create policy "writing_logs_insert_allowed" on public.writing_logs
for insert with check (public.is_allowed_user() and auth.uid() = owner_id);

drop policy if exists "writing_logs_update_allowed" on public.writing_logs;
create policy "writing_logs_update_allowed" on public.writing_logs
for update using (public.is_allowed_user() and auth.uid() = owner_id)
with check (public.is_allowed_user() and auth.uid() = owner_id);
