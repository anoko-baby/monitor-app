-- M2: profiles / children / invite_codes + RLS
-- 仕様書 v1.8 5章。モニター認証は招待コード+メール/パスワード(LINEなし)。

create extension if not exists "pgcrypto";

create type profile_role as enum ('admin', 'staff', 'monitor');
create type profile_status as enum ('invited', 'active', 'inactive');
create type child_sex as enum ('male', 'female');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  role profile_role not null,
  name text not null,
  nickname text,
  email text not null,
  push_token text,
  notify_push boolean not null default true,
  wifi_only_upload boolean not null default false,
  tos_agreed_at timestamptz,
  shopify_customer_id text,
  consent_ec boolean not null default false,
  consent_sns boolean not null default false,
  consent_ad boolean not null default false,
  status profile_status not null default 'invited',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table children (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references profiles (id) on delete cascade,
  call_name text not null,
  birth_month date,
  sex child_sex,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invite_codes (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references profiles (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_monitor_id_idx on children (monitor_id);
create index invite_codes_monitor_id_idx on invite_codes (monitor_id);

-- updated_at 自動更新
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger children_set_updated_at before update on children
  for each row execute function set_updated_at();
create trigger invite_codes_set_updated_at before update on invite_codes
  for each row execute function set_updated_at();

-- 現在ログイン中ユーザーのロールを返すヘルパー(RLSポリシーで使う)
create or replace function current_profile_role()
returns profile_role language sql stable security definer as $$
  select role from profiles where auth_user_id = auth.uid();
$$;

create or replace function current_profile_id()
returns uuid language sql stable security definer as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

alter table profiles enable row level security;
alter table children enable row level security;
alter table invite_codes enable row level security;

-- profiles
create policy "monitor can select own profile" on profiles
  for select using (auth_user_id = auth.uid());

create policy "staff/admin can select all profiles" on profiles
  for select using (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can insert monitor profiles" on profiles
  for insert with check (
    current_profile_role() in ('admin', 'staff') and role = 'monitor'
  );

create policy "admin can insert any profile" on profiles
  for insert with check (current_profile_role() = 'admin');

create policy "monitor can update own profile" on profiles
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create policy "staff/admin can update monitor profiles" on profiles
  for update using (current_profile_role() in ('admin', 'staff') and role = 'monitor')
  with check (role = 'monitor');

create policy "admin can update any profile" on profiles
  for update using (current_profile_role() = 'admin');

-- children
create policy "monitor can select own children" on children
  for select using (monitor_id = current_profile_id());

create policy "staff/admin can select all children" on children
  for select using (current_profile_role() in ('admin', 'staff'));

create policy "monitor can manage own children" on children
  for all using (monitor_id = current_profile_id())
  with check (monitor_id = current_profile_id());

create policy "staff/admin can manage all children" on children
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

-- invite_codes: モニターは自分の招待コードを見れない(登録前は auth_user_id が無いため)。
-- 招待コードの検証・消費は service role の Edge Function 経由のみで行う。
create policy "staff/admin can select invite codes" on invite_codes
  for select using (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can insert invite codes" on invite_codes
  for insert with check (current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can update invite codes" on invite_codes
  for update using (current_profile_role() in ('admin', 'staff'));
