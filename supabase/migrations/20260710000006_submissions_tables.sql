-- M6: データ提出。submissions / submission_files テーブル、モニターのtasks/submissions/submission_filesへの
-- INSERT/UPDATE権限、到着確認専用RPC、サムネイル用Storageバケットを追加する。仕様書 v1.8 3.4, 5章, 6.3。

create type submission_file_kind as enum ('photo', 'video');

create table submissions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks (id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb,
  sns_urls jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  kind submission_file_kind not null,
  dropbox_path text not null,
  dropbox_shared_url text,
  thumbnail_url text,
  file_size bigint,
  duration_sec numeric,
  original_filename text,
  is_starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index submission_files_submission_id_idx on submission_files (submission_id);

create trigger submissions_set_updated_at before update on submissions
  for each row execute function set_updated_at();
create trigger submission_files_set_updated_at before update on submission_files
  for each row execute function set_updated_at();

alter table submissions enable row level security;
alter table submission_files enable row level security;

-- submissions
create policy "staff/admin can manage submissions" on submissions
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own submissions" on submissions
  for select using (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can insert own submissions" on submissions
  for insert with check (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

create policy "monitor can update own submissions" on submissions
  for update using (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

-- submission_files(モニターはINSERT/SELECTのみ。is_starredの更新はstaff/adminのみ=M7)
create policy "staff/admin can manage submission_files" on submission_files
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own submission_files" on submission_files
  for select using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_files.submission_id and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can insert own submission_files" on submission_files
  for insert with check (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_files.submission_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

-- tasks: モニターは自分の案件のタスクを「提出済」にできる(approved/cancelledでない場合のみ)
create policy "monitor can submit own tasks" on tasks
  for update using (
    status not in ('approved', 'cancelled')
    and exists (
      select 1 from cycles cy
      join campaigns c on c.id = cy.campaign_id
      where cy.id = tasks.cycle_id and c.monitor_id = current_profile_id()
    )
  )
  with check (
    status = 'submitted'
    and exists (
      select 1 from cycles cy
      join campaigns c on c.id = cy.campaign_id
      where cy.id = tasks.cycle_id and c.monitor_id = current_profile_id()
    )
  );

-- 到着確認専用RPC。仕様書のRLS方針上campaignsはモニターSELECTのみのため、
-- 「受け取りました」だけを安全に許可する関数をSECURITY DEFINERで用意する。
create or replace function mark_campaign_delivered(p_campaign_id uuid)
returns void language plpgsql security definer as $$
begin
  update campaigns
  set delivered_at = now()
  where id = p_campaign_id
    and monitor_id = current_profile_id()
    and delivered_at is null;
end;
$$;

-- サムネイル用Storageバケット(子どもの写真を含むため非公開)
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

create policy "staff/admin can read all thumbnails" on storage.objects
  for select using (bucket_id = 'thumbnails' and current_profile_role() in ('admin', 'staff'));

create policy "staff/admin can manage all thumbnails" on storage.objects
  for all using (bucket_id = 'thumbnails' and current_profile_role() in ('admin', 'staff'))
  with check (bucket_id = 'thumbnails' and current_profile_role() in ('admin', 'staff'));

-- モニターは自分の提出物のサムネイルのみ読み書きできる(パス規則: {submission_id}/{filename})
create policy "monitor can select own thumbnails" on storage.objects
  for select using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id::text = (storage.foldername(name))[1] and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can insert own thumbnails" on storage.objects
  for insert with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id::text = (storage.foldername(name))[1]
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );
