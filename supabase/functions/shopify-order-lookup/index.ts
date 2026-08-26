// 注文検索(GraphQL)。案件登録時のShopify注文取込に使う(仕様書 v1.8 3.3.1)。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getShopifyAccessToken, SHOPIFY_API_VERSION } from '../_shared/shopify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORDER_FIELDS = `
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
          title
          selectedOptions { name value }
          product { title vendor featuredImage { url } }
        }
      }
    }
  }
`;

type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  customer: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  lineItems: { edges: { node: any }[] };
};

async function callShopifyGraphQL(
  storeDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
): Promise<{ ok: true; json: any } | { ok: false; response: Response }> {
  const response = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) return { ok: false, response };
  return { ok: true, json: await response.json() };
}

// 検索インデックス(query:引数)経由の高速パス。ただし実機検証の結果、アーカイブ済みの古い注文は
// status:open/closed/cancelledをORで並べても検索インデックスから見つからないケースがあることが
// 判明した(Shopifyの検索インデックス自体の既知の制約とみられる)。
async function searchOrderByQuery(
  storeDomain: string,
  accessToken: string,
  normalizedOrderNumber: string
): Promise<{ order: ShopifyOrderNode | null; errors?: any[] }> {
  const gqlQuery = `
    query FindOrder($query: String!) {
      orders(first: 1, query: $query) {
        edges { node { ${ORDER_FIELDS} } }
      }
    }
  `;
  const result = await callShopifyGraphQL(storeDomain, accessToken, gqlQuery, {
    query: `name:#${normalizedOrderNumber} (status:open OR status:closed OR status:cancelled)`,
  });
  if (!result.ok) return { order: null };
  if (result.json.errors?.length) return { order: null, errors: result.json.errors };
  return { order: result.json.data?.orders?.edges?.[0]?.node ?? null };
}

// 検索インデックスで見つからない場合のフォールバック。query:引数を使わない素の一覧取得
// (検索インデックスを経由しないため、アーカイブ済みの古い注文も含まれる)を新しい順にページ送り
// しながら、注文名が完全一致するものを探す。最大20ページ(5000件)まで。ページ送り中はid/nameのみ
// の軽量クエリにして、一致した注文の詳細(lineItems等)は見つかった後に1回だけ別途取得する。
// 原因調査用にdebugも返す(不具合の切り分け後に削除予定)。
async function findOrderByPagination(
  storeDomain: string,
  accessToken: string,
  targetName: string
): Promise<{ order: ShopifyOrderNode | null; debug: any }> {
  const listQuery = `
    query ListOrders($cursor: String) {
      orders(first: 250, after: $cursor, sortKey: ID, reverse: true) {
        edges { cursor node { id name } }
        pageInfo { hasNextPage }
      }
    }
  `;
  let cursor: string | null = null;
  let matchedId: string | null = null;
  const debug: any = { pages: [] };
  for (let page = 0; page < 20 && !matchedId; page++) {
    const result = await callShopifyGraphQL(storeDomain, accessToken, listQuery, { cursor });
    if (!result.ok) {
      debug.fetchError = await result.response.text();
      return { order: null, debug };
    }
    if (result.json.errors?.length) {
      debug.graphqlErrors = result.json.errors;
      return { order: null, debug };
    }
    const edges = result.json.data?.orders?.edges ?? [];
    debug.pages.push({
      count: edges.length,
      firstName: edges[0]?.node.name ?? null,
      lastName: edges[edges.length - 1]?.node.name ?? null,
    });
    const match = edges.find((e: any) => e.node.name === targetName);
    if (match) {
      matchedId = match.node.id;
      break;
    }
    if (!result.json.data?.orders?.pageInfo?.hasNextPage || edges.length === 0) {
      debug.exhausted = true;
      return { order: null, debug };
    }
    cursor = edges[edges.length - 1].cursor;
  }
  if (!matchedId) {
    debug.pageLimitReached = true;
    return { order: null, debug };
  }

  const detailQuery = `
    query GetOrder($id: ID!) {
      order(id: $id) { ${ORDER_FIELDS} }
    }
  `;
  const detailResult = await callShopifyGraphQL(storeDomain, accessToken, detailQuery, { id: matchedId });
  if (!detailResult.ok || detailResult.json.errors?.length) {
    debug.detailError = detailResult.ok ? detailResult.json.errors : await detailResult.response.text();
    return { order: null, debug };
  }
  return { order: detailResult.json.data?.order ?? null, debug };
}

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

  // Shopifyの注文検索クエリ(name:)は、注文名に含まれる「#」を検索語にも含めないと
  // 一致しない(name:1001ではヒットせず、name:#1001でないとヒットしない仕様)。
  // 入力欄には「#」ありなし両方で入力される可能性があるため、一旦取り除いてから使う。
  const normalizedOrderNumber = String(orderNumber).replace(/^#/, '');
  const targetName = `#${normalizedOrderNumber}`;

  const searchResult = await searchOrderByQuery(storeDomain, accessToken, normalizedOrderNumber);
  if (searchResult.errors?.length) {
    return new Response(
      JSON.stringify({ error: `Shopify APIエラー: ${searchResult.errors.map((e: any) => e.message).join(' / ')}` }),
      { status: 502, headers: corsHeaders }
    );
  }

  let order = searchResult.order;
  let paginationDebug: any = null;
  if (!order) {
    const paginationResult = await findOrderByPagination(storeDomain, accessToken, targetName);
    order = paginationResult.order;
    paginationDebug = paginationResult.debug;
  }

  if (!order) {
    // ページ送りが「もう古い注文は無い」(exhausted)で終わった場合、実際にはまだ古い注文が
    // 存在するはずなのに打ち切られているため、Shopifyの標準権限(read_orders)による
    // 「直近60日分の注文しかAPI経由で見えない」という制限に当たっている可能性が高い
    // (要read_all_ordersスコープ)。確認できた最も古い注文番号をヒントとして伝える。
    const oldestSeen = paginationDebug?.exhausted
      ? paginationDebug.pages?.[paginationDebug.pages.length - 1]?.lastName
      : null;
    const scopeHint = oldestSeen
      ? `Shopifyの標準権限(read_orders)では直近60日分の注文しかAPI経由で取得できません(現在API経由で確認できる最も古い注文: ${oldestSeen})。これより古い注文を取り込むには、Shopify側でアプリに「read_all_orders」権限を追加していただくか、商品を手動で選択してください。`
      : 'Shopify管理画面でこの注文の「注文番号」の表記をご確認ください。';
    return new Response(
      JSON.stringify({ error: `注文が見つかりませんでした(注文番号: ${targetName})。${scopeHint}` }),
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
        variantTitle:
          e.node.variant?.title && e.node.variant.title !== 'Default Title' ? e.node.variant.title : null,
        selectedOptions: e.node.variant?.selectedOptions,
      })),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
