-- variantsにShopifyのバリエーション名(variant.title、例: 「フリー」「S / ピンク」)を保存する列を追加。
-- 実機フィードバック: SKU(商品番号)がそのまま表示されて何のことかわからない。
-- サイズ・カラーのオプション名が「size」「color」等と一致しない商品(name/valueが独自名の商品)では
-- 従来のsize/color抽出ロジックが空になり、SKUだけが表示されていたのが原因。
-- Shopify側が自動生成する人間可読なバリエーション名をそのまま保存・表示する方式に変更する。

alter table variants add column title text;

comment on column variants.title is 'Shopifyのバリエーション名(variant.title)。「Default Title」の場合はnullとして保存する';
