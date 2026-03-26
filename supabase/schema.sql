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
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.app_config config
    join auth.users users_table on users_table.id = auth.uid()
    where config.singleton = true
      and lower(trim(coalesce(users_table.email, ''))) = lower(trim(coalesce(config.allowed_email, '')))
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

create or replace function public.protect_sync_row()
returns trigger
language plpgsql
as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    return old;
  end if;

  if new.updated_at is null then
    new.updated_at := now();
  end if;

  if old.updated_at is not null and new.updated_at < old.updated_at then
    return old;
  end if;

  return new;
end;
$$;

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null default '',
  description text not null default '',
  kind text not null default 'custom',
  source_key text,
  color text not null default '',
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint decks_owner_id_id_unique unique (owner_id, id)
);

alter table public.decks add column if not exists slug text not null default '';
alter table public.decks add column if not exists description text not null default '';
alter table public.decks add column if not exists kind text not null default 'custom';
alter table public.decks add column if not exists source_key text;
alter table public.decks add column if not exists color text not null default '';
alter table public.decks add column if not exists sort_order integer not null default 1000;

alter table public.decks drop constraint if exists decks_kind_check;
alter table public.decks
  add constraint decks_kind_check
  check (kind in ('custom', 'prebuilt', 'smart'));

create index if not exists decks_owner_id_slug_idx on public.decks (owner_id, slug);
create index if not exists decks_owner_id_kind_idx on public.decks (owner_id, kind);

drop trigger if exists decks_protect_sync_row on public.decks;
create trigger decks_protect_sync_row
before update on public.decks
for each row
execute function public.protect_sync_row();

update public.decks
set
  slug = case
    when coalesce(trim(slug), '') <> '' then slug
    when name = 'HSK 5' then 'hsk-5'
    else regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')
  end,
  description = case
    when coalesce(trim(description), '') <> '' then description
    when name = 'HSK 5' then '1,300 words - Upper Intermediate'
    else ''
  end,
  kind = case
    when name = 'HSK 5' then 'prebuilt'
    when coalesce(trim(kind), '') = '' then 'custom'
    else kind
  end,
  source_key = case
    when name = 'HSK 5' then coalesce(nullif(source_key, ''), 'hsk5')
    else nullif(source_key, '')
  end,
  color = case
    when coalesce(trim(color), '') <> '' then color
    when name = 'HSK 5' then '#fb7185'
    else ''
  end,
  sort_order = case
    when name = 'HSK 5' then 10
    when sort_order is null or sort_order = 0 then 1000
    else sort_order
  end;

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

drop trigger if exists cards_protect_sync_row on public.cards;
create trigger cards_protect_sync_row
before update on public.cards
for each row
execute function public.protect_sync_row();

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
