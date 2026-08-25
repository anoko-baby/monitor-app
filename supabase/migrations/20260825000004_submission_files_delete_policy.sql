-- 提出済み・アップロード失敗ファイルをモニター自身が削除できるようにする(実機フィードバック:
-- 「アップロードした画像や動画も、削除ができるようにしたい」)。submissionsと同じ
-- 「タスクがapproved/cancelledでなければ本人が操作できる」パターンに揃える。

create policy "monitor can delete own submission_files" on submission_files
  for delete using (
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
