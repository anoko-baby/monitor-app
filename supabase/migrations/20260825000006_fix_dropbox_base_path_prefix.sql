-- Dropbox連携をApp folder方式から「モニターデータ」名前空間への直接アクセスに切り替えたため、
-- 既存案件が保持している旧プレフィックス(/anoko_monitor/...)付きのパスを、
-- 新しい名前空間のルートを基準にしたパス(先頭の/anoko_monitorを除いたもの)に揃える。
update campaigns
set dropbox_base_path = regexp_replace(dropbox_base_path, '^/anoko_monitor', '')
where dropbox_base_path like '/anoko_monitor/%';
