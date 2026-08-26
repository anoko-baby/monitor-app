-- 「一度提出したものの画像の削除はできないようにしたい」との実機フィードバックへの対応。
-- 従来はtaskがapproved/cancelled以外なら削除できたため、submitted(提出済み・確認待ち)の
-- 状態でも本人が削除できてしまっていた。pending(未提出の下書き中)とrejected(差し戻し・再提出中)
-- の時だけ削除できるように絞り込む。

drop policy "monitor can delete own submission_files" on submission_files;

create policy "monitor can delete own submission_files" on submission_files
  for delete using (
    exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id = submission_files.submission_id
        and c.monitor_id = current_profile_id()
        and t.status in ('pending', 'rejected')
    )
  );
