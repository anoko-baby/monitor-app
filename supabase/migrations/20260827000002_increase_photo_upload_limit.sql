-- 写真の提出枚数上限を30枚→50枚に引き上げ(実機フィードバック: モニターから30枚の上限に
-- 達したという問い合わせが複数来ている)。実際の上限はapp/submission-form.tsxのMAX_PHOTOS
-- 定数で判定しており、app_settings.upload_limitsは現状コードから参照されていないが、
-- 将来の設定画面実装時に食い違わないよう値も合わせておく。

update app_settings
set value = jsonb_set(value, '{max_photos}', '50')
where key = 'upload_limits';
