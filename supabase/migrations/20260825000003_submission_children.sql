-- 提出時の複数子ども対応。1件の提出(submissions)に対して複数のchildren(登録済みの子ども)を
-- 紐づけられるようにし、それぞれの子どもごとに「着用したバリエーション(色/サイズ、複数可)」と
-- 「身長・体重等、案件ごとに設定した追加項目の値」「撮影日時点の月齢/年齢」を個別に記録する。
-- 撮影日(shot_date)は提出全体で共通のため、引き続き submissions.form_data 側に残す。

create table submission_children (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  child_id uuid not null references children (id),
  age_months int,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, child_id)
);

-- 1人の子どもが同じ提出内で複数バリエーション(色/サイズ)を着用しているケースがあるため多対多にする
create table submission_child_variants (
  id uuid primary key default gen_random_uuid(),
  submission_child_id uuid not null references submission_children (id) on delete cascade,
  variant_id uuid not null references variants (id),
  created_at timestamptz not null default now(),
  unique (submission_child_id, variant_id)
);

create index submission_children_submission_id_idx on submission_children (submission_id);
create index submission_children_child_id_idx on submission_children (child_id);
create index submission_child_variants_submission_child_id_idx on submission_child_variants (submission_child_id);
create index submission_child_variants_variant_id_idx on submission_child_variants (variant_id);

create trigger submission_children_set_updated_at before update on submission_children
  for each row execute function set_updated_at();

alter table submission_children enable row level security;
alter table submission_child_variants enable row level security;

-- submission_children: submissions と同じ「タスクのステータスがapproved/cancelledでなければ
-- モニター本人が読み書きできる」パターンに揃える
create policy "staff/admin can manage submission_children" on submission_children
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own submission_children" on submission_children
  for select using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can insert own submission_children" on submission_children
  for insert with check (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

create policy "monitor can update own submission_children" on submission_children
  for update using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  )
  with check (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

create policy "monitor can delete own submission_children" on submission_children
  for delete using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

-- submission_child_variants: 親のsubmission_childrenと同じ提出に対するRLSに揃える
create policy "staff/admin can manage submission_child_variants" on submission_child_variants
  for all using (current_profile_role() in ('admin', 'staff'))
  with check (current_profile_role() in ('admin', 'staff'));

create policy "monitor can select own submission_child_variants" on submission_child_variants
  for select using (
    exists (
      select 1 from submission_children sc
      join submissions s on s.id = sc.submission_id
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where sc.id = submission_child_variants.submission_child_id and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can insert own submission_child_variants" on submission_child_variants
  for insert with check (
    exists (
      select 1 from submission_children sc
      join submissions s on s.id = sc.submission_id
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where sc.id = submission_child_variants.submission_child_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );

create policy "monitor can delete own submission_child_variants" on submission_child_variants
  for delete using (
    exists (
      select 1 from submission_children sc
      join submissions s on s.id = sc.submission_id
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where sc.id = submission_child_variants.submission_child_id
        and c.monitor_id = current_profile_id()
        and t.status not in ('approved', 'cancelled')
    )
  );
