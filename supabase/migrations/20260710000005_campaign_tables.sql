-- M5: 案件管理。form_fields(シード) / campaigns / campaign_variants / campaign_form_fields / cycles / tasks
-- 仕様書 v1.8 3.3〜3.4, 4.2, 5章。

create type form_field_input_type as enum ('date', 'number', 'select', 'text');
create type campaign_recurrence_type as enum ('once', 'monthly');
create type campaign_sns_frequency as enum ('every_cycle', 'once');
create type campaign_status as enum ('active', 'completed', 'cancelled');
create type task_type as enum ('media', 'sns');
create type task_status as enum ('pending', 'submitted', 'approved', 'rejected', 'cancelled');

-- 項目マスタ(仕様書 v1.8 3.4.2)。将来管理者が項目を追加できる拡張性を持たせる。
create table form_fields (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  input_type form_field_input_type not null,
  unit text,
  options jsonb,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into form_fields (key, label, input_type, unit, sort_order, is_system) values
  ('shot_date', '撮影日', 'date', null, 0, true),
  ('height', '身長', 'number', 'cm', 1, false),
  ('weight', '体重', 'number', 'kg', 2, false),
  ('age_months', '月齢/年齢', 'number', 'ヶ月', 3, false),
  ('foot_size', '足の実寸', 'number', 'cm', 4, false),
  ('memo', 'ひとことメモ', 'text', null, 6, false);

insert into form_fields (key, label, input_type, options, sort_order, is_system) values
  ('fit', 'フィット感', 'select', '["小さい", "ぴったり", "やや大きい", "大きい"]'::jsonb, 5, false);

-- 案件(キャンペーン)
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_no int generated always as identity unique,
  title text not null,
  monitor_id uuid not null references profiles (id),
  child_id uuid references children (id),
  shipped_at date,
  delivered_at timestamptz,
  recurrence_type campaign_recurrence_type not null,
  media_deadline_day int,
  cycles_count int not null default 1,
  start_month date,
  sns_required boolean not null default false,
  sns_frequency campaign_sns_frequency,
  sns_deadline_day int,
  sns_once_due_date date,
  reminder_enabled boolean not null default true,
  internal_memo text,
  shooting_guideline text,
  source_order_id uuid references coupon_orders (id),
  shipment_order_no text,
  dropbox_base_path text,
  status campaign_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  variant_id uuid not null references variants (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaign_form_fields (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  form_field_key text not null references form_fields (key),
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, form_field_key)
);

create table cycles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  cycle_no int not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, cycle_no)
);

-- 提出タスク(データ提出/SNS投稿共通)⭐中核テーブル
create table tasks (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles (id) on delete cascade,
  type task_type not null,
  due_date date not null,
  status task_status not null default 'pending',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  first_submitted_at timestamptz,
  reviewer_id uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, type)
);

alter table coupon_orders add constraint coupon_orders_campaign_id_fkey
  foreign key (campaign_id) references campaigns (id) on delete set null;

create index campaigns_monitor_id_idx on campaigns (monitor_id);
create index campaigns_status_idx on campaigns (status);
create index campaign_variants_campaign_id_idx on campaign_variants (campaign_id);
create index campaign_variants_variant_id_idx on campaign_variants (variant_id);
create index campaign_form_fields_campaign_id_idx on campaign_form_fields (campaign_id);
create index cycles_campaign_id_idx on cycles (campaign_id);
create index tasks_cycle_id_idx on tasks (cycle_id);
create index tasks_status_idx on tasks (status);
create index tasks_due_date_idx on tasks (due_date);

create trigger form_fields_set_updated_at before update on form_fields
  for each row execute function set_updated_at();
create trigger campaigns_set_updated_at before update on campaigns
  for each row execute function set_updated_at();
create trigger campaign_variants_set_updated_at before update on campaign_variants
  for each row execute function set_updated_at();
create trigger campaign_form_fields_set_updated_at before update on campaign_form_fields
  for each row execute function set_updated_at();
create trigger cycles_set_updated_at before update on cycles
  for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();

alter table form_fields enable row level security;
alter table campaigns enable row level security;
alter table campaign_variants enable row level security;
alter table campaign_form_fields enable row level security;
alter table cycles enable row level security;
alter table tasks enable row level security;

-- form_fields: 提出フォーム描画にモニターも必要なので閲覧は全ロール、管理は admin/staff のみ
create policy "authenticated can select form_fields" on form_fields
  for select using (auth.uid() is not null);

create policy "staff/admin can manage form_fields" on form_fields
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

-- campaigns
create policy "staff/admin can manage campaigns" on campaigns
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own campaigns" on campaigns
  for select using (monitor_id = current_profile_id() and deleted_at is null);

-- campaign_variants
create policy "staff/admin can manage campaign_variants" on campaign_variants
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own campaign_variants" on campaign_variants
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_variants.campaign_id and c.monitor_id = current_profile_id()
    )
  );

-- campaign_form_fields
create policy "staff/admin can manage campaign_form_fields" on campaign_form_fields
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own campaign_form_fields" on campaign_form_fields
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_form_fields.campaign_id and c.monitor_id = current_profile_id()
    )
  );

-- cycles
create policy "staff/admin can manage cycles" on cycles
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own cycles" on cycles
  for select using (
    exists (
      select 1 from campaigns c
      where c.id = cycles.campaign_id and c.monitor_id = current_profile_id()
    )
  );

-- tasks(モニターからのINSERT/UPDATEはM6のデータ提出実装時に追加する)
create policy "staff/admin can manage tasks" on tasks
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own tasks" on tasks
  for select using (
    exists (
      select 1 from cycles cy
      join campaigns c on c.id = cy.campaign_id
      where cy.id = tasks.cycle_id and c.monitor_id = current_profile_id()
    )
  );
