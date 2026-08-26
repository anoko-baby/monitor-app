-- 確認済み(approved)後もモニターが追加提出を何度でもできるようにする(実機フィードバック:
-- 「提出済みの案件について、追加提出が何度でもできるようにもしたい」)。
-- これまでtasks/submissions/submission_filesへのモニターからのINSERT/UPDATEは
-- status='approved'の場合にRLSで一律ブロックしていたため、アプリ側の画面を編集可能にしても
-- 実際の保存はRLS違反で失敗する。approvedを許可対象に含め、cancelledのみ引き続きブロックする。
-- 追加提出するとtasksのstatusは'submitted'に戻り、admin側の再確認対象になる。

drop policy if exists "monitor can insert own submissions" on submissions;
create policy "monitor can insert own submissions" on submissions
  for insert with check (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can update own submissions" on submissions;
create policy "monitor can update own submissions" on submissions
  for update using (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  )
  with check (
    exists (
      select 1 from tasks t
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where t.id = submissions.task_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can insert own submission_files" on submission_files;
create policy "monitor can insert own submission_files" on submission_files
  for insert with check (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_files.submission_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can submit own tasks" on tasks;
create policy "monitor can submit own tasks" on tasks
  for update using (
    status <> 'cancelled'
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

-- submission_children / submission_child_variants も同様(提出フォームの子ども情報・着用バリエーション)
drop policy if exists "monitor can insert own submission_children" on submission_children;
create policy "monitor can insert own submission_children" on submission_children
  for insert with check (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can update own submission_children" on submission_children;
create policy "monitor can update own submission_children" on submission_children
  for update using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
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
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can delete own submission_children" on submission_children;
create policy "monitor can delete own submission_children" on submission_children
  for delete using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_children.submission_id
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can insert own submission_child_variants" on submission_child_variants;
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
        and t.status <> 'cancelled'
    )
  );

drop policy if exists "monitor can delete own submission_child_variants" on submission_child_variants;
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
        and t.status <> 'cancelled'
    )
  );
