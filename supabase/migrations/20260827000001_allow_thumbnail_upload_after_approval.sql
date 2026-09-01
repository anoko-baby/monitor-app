-- 20260826000004で「確認済み(approved)後も追加提出できるように」RLSを緩和した際、
-- サムネイル用Storage(thumbnailsバケット)のINSERTポリシーの更新を漏らしていた。
-- 確認済みタスクへの追加提出で、本体ファイルはアップロードできてもサムネイルだけ
-- アップロードに失敗し(Web版はこの失敗を無視して続行する作りのため気付かれなかった)、
-- サムネイルが表示されない不具合につながっていた(実機フィードバック: 「提出した動画も
-- 画像も全然サムネイルが表示されない」)。他のテーブルと同様、cancelledのみブロックする条件に揃える。

drop policy if exists "monitor can insert own thumbnails" on storage.objects;
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
        and t.status <> 'cancelled'
    )
  );

-- サムネイルアップロードは upsert:true で呼んでおり、同名パスへの再アップロードは内部的に
-- UPDATE扱いになる(例: 同じファイル名の写真を複数回提出した場合)。UPDATE用のポリシーが
-- 元々無かったため、こちらも合わせて用意する。
drop policy if exists "monitor can update own thumbnails" on storage.objects;
create policy "monitor can update own thumbnails" on storage.objects
  for update using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id::text = (storage.foldername(name))[1]
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  )
  with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from submissions s
      join tasks t on t.id = s.task_id
      join cycles cy on cy.id = t.cycle_id
      join campaigns c on c.id = cy.campaign_id
      where s.id::text = (storage.foldername(name))[1]
        and c.monitor_id = current_profile_id()
        and t.status <> 'cancelled'
    )
  );
