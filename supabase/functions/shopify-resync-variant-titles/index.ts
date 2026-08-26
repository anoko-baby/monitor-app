// バリエーション名(variants.title)が未取得のまま登録済みの商品を、Shopifyから一括で取得し直す
// 一度きりの管理者用ツール(実機フィードバック: 「SKUが表示されても何のことかわからない、
// バリエーション名を表示してほしい」→ variants.titleを新設したが、既に登録済みの商品には
// 反映されないため、Shopify連携済みの既存商品をまとめて再取得できるようにした)。
// DB読み書きは呼び出し元(admin/staff)のJWTをそのまま転送し、RLSに従う(service roleは使わない)。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getShopifyAccessToken, SHOPIFY_API_VERSION } from '../_shared/shopify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'authorization header is required' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: targets, error: selectError } = await db
    .from('variants')
    .select('id, shopify_variant_id')
    .is('title', null)
    .not('shopify_variant_id', 'is', null)
    .limit(250);

  if (selectError) {
    return jsonResponse({ error: `対象バリエーションの取得に失敗しました: ${selectError.message}` }, 500);
  }
  if (!targets || targets.length === 0) {
    return jsonResponse({ updated: 0, skipped: 0, total: 0 });
  }

  const tokenResult = await getShopifyAccessToken();
  if ('error' in tokenResult) {
    return jsonResponse({ error: tokenResult.error }, 500);
  }
  const { token: accessToken, storeDomain } = tokenResult;

  const gqlQuery = `
    query GetVariantTitles($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant { id title }
      }
    }
  `;
  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
    body: JSON.stringify({ query: gqlQuery, variables: { ids: targets.map((t) => t.shopify_variant_id) } }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse({ error: 'Shopify APIエラー', detail }, 502);
  }
  const json = await response.json();
  if (json.errors) {
    return jsonResponse({ error: 'Shopify GraphQLエラー', detail: json.errors }, 502);
  }

  const titleByShopifyId = new Map<string, string | null>();
  for (const node of json.data?.nodes ?? []) {
    if (!node?.id) continue;
    titleByShopifyId.set(node.id, node.title && node.title !== 'Default Title' ? node.title : null);
  }

  let updated = 0;
  let skipped = 0;
  for (const t of targets) {
    const title = titleByShopifyId.get(t.shopify_variant_id);
    if (!title) {
      skipped++;
      continue;
    }
    const { error: updateError } = await db.from('variants').update({ title }).eq('id', t.id);
    if (updateError) {
      skipped++;
      continue;
    }
    updated++;
  }

  return jsonResponse({ updated, skipped, total: targets.length });
});
