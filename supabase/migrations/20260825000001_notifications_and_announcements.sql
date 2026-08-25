-- M8: 通知+お知らせ配信。notification_templates / notification_logs / app_settings /
-- announcements / announcement_targets を追加し、日次バッチ通知(N2/N6/N7/N10/N12)用に
-- pg_cron + pg_net で Edge Function を毎朝9:00(JST)に起動するスケジュールを登録する。
-- 仕様書 v1.8 3.8, 3.9, 5章。

create type notification_channel as enum ('push');
create type notification_result as enum ('sent', 'failed', 'skipped_no_token', 'skipped_notify_off');
create type announcement_target_type as enum ('all', 'manual', 'segment');

create table notification_templates (
  key text primary key,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notification_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  template_key text not null references notification_templates (key),
  channel notification_channel not null default 'push',
  task_id uuid references tasks (id) on delete set null,
  sent_at timestamptz not null default now(),
  result notification_result not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notification_logs_profile_id_idx on notification_logs (profile_id);
create index notification_logs_task_template_sent_idx on notification_logs (task_id, template_key, sent_at);

create table app_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- target_type='segment' はPhase2(3.11 モニタータグ・グループ)実装後に有効化する。
-- segment_id は将来の segments テーブルへのFKを想定した予約列(Phase1では未使用)。
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_label text,
  link_url text,
  target_type announcement_target_type not null default 'all',
  segment_id uuid,
  created_by uuid not null references profiles (id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table announcement_targets (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements (id) on delete cascade,
  monitor_id uuid not null references profiles (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, monitor_id)
);

create index announcement_targets_monitor_id_idx on announcement_targets (monitor_id);

create trigger notification_templates_set_updated_at before update on notification_templates
  for each row execute function set_updated_at();
create trigger notification_logs_set_updated_at before update on notification_logs
  for each row execute function set_updated_at();
create trigger app_settings_set_updated_at before update on app_settings
  for each row execute function set_updated_at();
create trigger announcements_set_updated_at before update on announcements
  for each row execute function set_updated_at();
create trigger announcement_targets_set_updated_at before update on announcement_targets
  for each row execute function set_updated_at();

alter table notification_templates enable row level security;
alter table notification_logs enable row level security;
alter table app_settings enable row level security;
alter table announcements enable row level security;
alter table announcement_targets enable row level security;

-- notification_templates: Edge Functionはservice roleで読むためRLSの影響を受けない。
-- クライアントからの編集画面はPhase2(通知テンプレート管理画面)まで無いため、admin専用にしておく。
create policy "admin can manage notification_templates" on notification_templates
  for all using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');

-- notification_logs: 送信は常にservice role経由。クライアントからは監査目的のSELECTのみ許可する。
create policy "staff/admin can select notification_logs" on notification_logs
  for select using (current_profile_role() in ('admin', 'staff'));

-- app_settings: 5章の方針どおりadminのみ
create policy "admin can manage app_settings" on app_settings
  for all using (current_profile_role() = 'admin')
  with check (current_profile_role() = 'admin');

-- announcements
create policy "staff/admin can manage announcements" on announcements
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own announcements" on announcements
  for select using (
    exists (
      select 1 from announcement_targets t
      where t.announcement_id = announcements.id and t.monitor_id = current_profile_id()
    )
  );

-- announcement_targets
create policy "staff/admin can manage announcement_targets" on announcement_targets
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own announcement_targets" on announcement_targets
  for select using (monitor_id = current_profile_id());

-- モニターは自分宛ての既読(read_at)のみ更新できる
create policy "monitor can mark own announcement read" on announcement_targets
  for update using (monitor_id = current_profile_id())
  with check (monitor_id = current_profile_id());

-- 通知文面テンプレート(3.8 変数: モニター名/案件名/商品名/期限日/回次。{{var}}記法)
-- N9(お知らせ配信)はannouncements自体のtitle/bodyをそのまま使うため、ここにはテンプレートを置かない。
insert into notification_templates (key, title, body) values
  ('n1_campaign_assigned', '新しい案件のお知らせ', '「{{campaign_title}}」のモニターに登録されました。アプリで内容と提出期限をご確認ください。'),
  -- N9本体はannouncementsのtitle/bodyをそのまま送るため、ここは監査ログのFK用プレースホルダー
  ('n9_announcement_sent', '(お知らせ配信)', '(announcementsのtitle/bodyを都度使用)'),
  ('n2_reminder_7', '提出期限が近づいています', '「{{campaign_title}}」{{cycle_label}}の提出期限まであと7日です({{due_date}})。'),
  ('n2_reminder_1', '提出期限は明日です', '「{{campaign_title}}」{{cycle_label}}の提出期限は明日({{due_date}})です。'),
  ('n3_task_rejected', '差し戻しのお知らせ', '「{{campaign_title}}」{{cycle_label}}の提出が差し戻されました。理由をご確認のうえ、期限までに再提出してください。'),
  ('n4_task_approved', '確認完了のお知らせ', '「{{campaign_title}}」{{cycle_label}}の提出内容を確認しました。ありがとうございます。'),
  ('n5_task_submitted', '提出がありました', '{{monitor_name}}さんから「{{campaign_title}}」{{cycle_label}}の提出がありました。'),
  ('n6_overdue_monitor', '提出期限が過ぎています', '「{{campaign_title}}」{{cycle_label}}の提出期限({{due_date}})を過ぎています。至急ご提出をお願いします。'),
  ('n7_overdue_staff', '期限超過が発生しています', '{{monitor_name}}さんの「{{campaign_title}}」{{cycle_label}}が期限超過です(期限: {{due_date}})。'),
  ('n10_delivery_reminder_monitor', '到着確認のお願い', '「{{campaign_title}}」の商品が届いていましたら、アプリの「到着確認」ボタンを押してください。'),
  ('n10_delivery_reminder_staff', '到着未確認のお知らせ', '{{monitor_name}}さんの「{{campaign_title}}」が発送から日数が経過していますが、到着確認がまだ行われていません。'),
  ('n11_coupon_order', 'クーポン注文を検知しました', 'クーポン「{{coupon_code}}」を使用した注文がありました。「クーポン注文」タブから確認してください。'),
  ('n12_health_check', '外部連携の異常を検知しました', '{{issue}}');

-- app_settings(3.8, 6章の初期値。後から admin が値を変更できる)
insert into app_settings (key, value) values
  ('reminder_days_before', '[7, 1]'::jsonb),
  ('overdue_days_after', '2'::jsonb),
  ('delivery_reminder_days', '5'::jsonb),
  ('notify_send_hour_jst', '9'::jsonb),
  ('min_app_version', '"0.1.0"'::jsonb),
  ('upload_limits', '{"max_photos": 30, "max_video_count": 5, "max_photos_mb": 50, "max_video_gb": 2}'::jsonb);

-- 日次バッチ通知(N2/N6/N7/N10/N12)用のCronスケジュール。
-- pg_cron/pg_netはSupabaseの公式手順(Database Webhooks/Scheduling Edge Functionsと同じ方式)。
-- Edge Function側はサービスロールではなくCRON_SECRET(共有シークレット)で認証するため、
-- ここではシークレットの値そのものは書かない。適用後に一度だけ、ご自身のターミナル/SQL Editorから
-- 以下を実行してください(値は任意の文字列。dropbox-token等と同様、チャットには貼らないこと):
--   select vault.create_secret('<任意のランダム文字列>', 'cron_secret');
--   npx supabase secrets set CRON_SECRET="<vaultに保存したのと同じ値>"
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'notify-cron-daily',
  '0 0 * * *', -- 00:00 UTC = 09:00 JST
  $$
  select net.http_post(
    url := 'https://mxenfgoviwxnlhokfvwc.supabase.co/functions/v1/notify-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'notify-health-check-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://mxenfgoviwxnlhokfvwc.supabase.co/functions/v1/notify-health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
