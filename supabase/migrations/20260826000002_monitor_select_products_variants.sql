-- products/variantsにモニター向けのSELECTポリシーが無く、自分の案件の商品情報・画像が
-- 一切見えていなかった不具合の修正(実機フィードバック: 案件一覧/案件詳細で商品情報なし・画像なし)。
-- 自分にアサインされた案件(campaign_variants経由)に紐づく商品/バリアントのみ閲覧可能にする。

create policy "monitor can select own variants" on variants
  for select using (
    exists (
      select 1 from campaign_variants cv
      join campaigns c on c.id = cv.campaign_id
      where cv.variant_id = variants.id and c.monitor_id = current_profile_id()
    )
  );

create policy "monitor can select own products" on products
  for select using (
    exists (
      select 1 from variants v
      join campaign_variants cv on cv.variant_id = v.id
      join campaigns c on c.id = cv.campaign_id
      where v.product_id = products.id and c.monitor_id = current_profile_id()
    )
  );
