// 注文検索(GraphQL)。案件登録時のShopify注文取込に使う(仕様書 v1.8 3.3.1)。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getShopifyAccessToken, SHOPIFY_API_VERSION } from '../_shared/shopify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  const { orderNumber } = await req.json();
  if (!orderNumber) {
    return new Response(JSON.stringify({ error: 'orderNumber is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const tokenResult = await getShopifyAccessToken();
  if ('error' in tokenResult) {
    return new Response(JSON.stringify({ error: tokenResult.error }), {
      status: 500,
      headers: corsHeaders,
    });
  }
  const { token: accessToken, storeDomain } = tokenResult;

  const gqlQuery = `
    query FindOrder($query: String!) {
      orders(first: 1, query: $query) {
        edges {
          node {
            id
            name
            createdAt
            customer { id firstName lastName email }
            lineItems(first: 50) {
              edges {
                node {
                  sku
                  quantity
                  variant {
                    id
                    selectedOptions { name value }
                    product { title vendor featuredImage { url } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Shopifyの注文検索クエリ(name:)は、注文名に含まれる「#」を検索語にも含めないと
  // 一致しない(name:1001ではヒットせず、name:#1001でないとヒットしない仕様)。
  // 入力欄には「#」ありなし両方で入力される可能性があるため、一旦取り除いてから
  // 検索クエリ構築時に必ず付け直す。
  const normalizedOrderNumber = String(orderNumber).replace(/^#/, '');

  // status指定が無いと、Shopifyの注文検索はデフォルトで「未処理(open)」の注文しか対象にせず、
  // 発送済み・クローズ済みの古い注文がヒットしなかった(実機で確認: 今日の未発送注文は見つかるが、
  // 発送済みの古い注文は見つからなかった)。status:anyを付けて全ステータスを対象にする。
  const response = await fetch(
    `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: gqlQuery,
        variables: { query: `name:#${normalizedOrderNumber} status:any` },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    return new Response(JSON.stringify({ error: 'Shopify APIエラー', detail }), {
      status: 502,
      headers: corsHeaders,
    });
  }

  const json = await response.json();

  // GraphQL自体は200 OKで返るが、権限不足(read_ordersスコープ無し等)や検索構文の問題は
  // レスポンスボディのerrorsに入る。「注文が見つかりませんでした」という誤解を招く404を
  // 返す前に、まずこちらを確認して本当の理由を返す。
  if (json.errors?.length) {
    return new Response(
      JSON.stringify({ error: `Shopify APIエラー: ${json.errors.map((e: any) => e.message).join(' / ')}` }),
      { status: 502, headers: corsHeaders }
    );
  }

  const order = json.data?.orders?.edges?.[0]?.node;

  if (!order) {
    // 原因調査用: Shopifyから実際に返ってきた内容をそのまま含める(不具合の切り分け後に削除予定)。
    return new Response(
      JSON.stringify({
        error: `注文が見つかりませんでした(検索語: name:#${normalizedOrderNumber} status:any)。デバッグ情報: ${JSON.stringify(json)}`,
      }),
      { status: 404, headers: corsHeaders }
    );
  }

  // 注文の顧客IDから、既に紐付け済みのモニターを検索する(仕様書 v1.8 3.3.1: 自動紐付け)。
  // 呼び出し元(admin/staff)のJWTをそのまま転送し、RLSに従う(service roleは使わない)。
  let matchedMonitor: { id: string; name: string } | null = null;
  const authHeader = req.headers.get('Authorization');
  if (order.customer?.id && authHeader) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: monitor } = await db
      .from('profiles')
      .select('id, name')
      .eq('shopify_customer_id', order.customer.id)
      .maybeSingle();
    matchedMonitor = monitor;
  }

  return new Response(
    JSON.stringify({
      shopifyOrderId: order.id,
      orderName: order.name,
      orderedAt: order.createdAt,
      customer: order.customer
        ? {
            shopifyCustomerId: order.customer.id,
            name: `${order.customer.lastName ?? ''} ${order.customer.firstName ?? ''}`.trim(),
            email: order.customer.email,
          }
        : null,
      matchedMonitor,
      lineItems: (order.lineItems?.edges ?? []).map((e: any) => ({
        shopifyProductId: e.node.variant?.product?.id ?? null,
        shopifyVariantId: e.node.variant?.id ?? null,
        sku: e.node.sku,
        quantity: e.node.quantity,
        productTitle: e.node.variant?.product?.title,
        brand: e.node.variant?.product?.vendor,
        imageUrl: e.node.variant?.product?.featuredImage?.url ?? null,
        selectedOptions: e.node.variant?.selectedOptions,
      })),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
