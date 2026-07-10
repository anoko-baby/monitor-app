-- M7: 検収・差し戻し+全提出一覧。review_logs テーブル、案件完了への自動遷移、
-- 全提出一覧を1クエリで取得するための submission_list_view を追加する(仕様書 v1.8 3.5, 3.6.2, 4.2, 5章)。

create type review_action as enum ('approved', 'rejected');

create table review_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks (id) on delete cascade,
  action review_action not null,
  comment text,
  new_due_date date,
  actor_id uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_logs_task_id_idx on review_logs (task_id);

create trigger review_logs_set_updated_at before update on review_logs
  for each row execute function set_updated_at();

alter table review_logs enable row level security;

create policy "staff/admin can manage review_logs" on review_logs
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

-- モニターにも差し戻し理由を提出画面で見せるため、自分のタスク分はSELECTを許可する。
create policy "monitor can select own review_logs" on review_logs
  for select using (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = review_logs.task_id and c.monitor_id = current_profile_id()
    )
  );

-- 案件ステータスの自動遷移(仕様書 v1.8 4.2): 案件配下の全タスク(cancelled除く)がapprovedになったら
-- 案件を completed にする。M5では検収操作自体が無かったため保留していたロジック。
create or replace function check_campaign_completion()
returns trigger language plpgsql as $$
declare
  v_campaign_id uuid;
  v_remaining int;
begin
  if new.status <> 'approved' then
    return new;
  end if;

  select cy.campaign_id into v_campaign_id from cycles cy where cy.id = new.cycle_id;

  select count(*) into v_remaining
  from tasks t
  join cycles cy on cy.id = t.cycle_id
  where cy.campaign_id = v_campaign_id
    and t.status not in ('cancelled', 'approved');

  if v_remaining = 0 then
    update campaigns set status = 'completed' where id = v_campaign_id and status = 'active';
  end if;

  return new;
end;
$$;

create trigger tasks_check_campaign_completion after update on tasks
  for each row
  when (new.status = 'approved' and old.status is distinct from new.status)
  execute function check_campaign_completion();

-- 全提出一覧(仕様書 v1.8 3.6.2)。回次単位の1行に集約し、将来のCSV出力にも使い回せるようにする。
-- security_invoker=true で、呼び出したユーザーのRLSがそのまま効くようにする(必須。無いと閲覧範囲が壊れる)。
create view submission_list_view
with (security_invoker = true)
as
select
  cy.id as cycle_id,
  c.id as campaign_id,
  c.campaign_no,
  c.title as campaign_title,
  c.status as campaign_status,
  c.monitor_id,
  p_monitor.name as monitor_name,
  prod.title as product_title,
  prod.brand as product_brand,
  v.sku as product_sku,
  cy.cycle_no,
  c.cycles_count,
  media.id as media_task_id,
  media.status as media_status,
  media.due_date as media_due_date,
  media.submitted_at as media_submitted_at,
  sns.id as sns_task_id,
  sns.status as sns_status,
  sns.due_date as sns_due_date,
  sns.submitted_at as sns_submitted_at,
  thumb.thumbnail_url as thumbnail_path,
  coalesce(star.has_starred, false) as has_starred
from cycles cy
join campaigns c on c.id = cy.campaign_id
join profiles p_monitor on p_monitor.id = c.monitor_id
left join lateral (
  select cv.variant_id
  from campaign_variants cv
  where cv.campaign_id = c.id
  order by cv.created_at asc
  limit 1
) first_variant on true
left join variants v on v.id = first_variant.variant_id
left join products prod on prod.id = v.product_id
left join tasks media on media.cycle_id = cy.id and media.type = 'media'
left join tasks sns on sns.cycle_id = cy.id and sns.type = 'sns'
left join lateral (
  select sf.thumbnail_url
  from submissions s
  join submission_files sf on sf.submission_id = s.id
  where s.task_id = media.id
  order by sf.created_at asc
  limit 1
) thumb on true
left join lateral (
  select bool_or(sf.is_starred) as has_starred
  from submissions s
  join submission_files sf on sf.submission_id = s.id
  where s.task_id = media.id
) star on true;
