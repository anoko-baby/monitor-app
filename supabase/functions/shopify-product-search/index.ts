// 商品検索(GraphQL)。案件登録時の商品検索に使う(仕様書 v1.8 3.2)。
// 検索結果のキャッシュ(products/variantsへの保存)は、実際に案件へ選択された時点でM5側が行う。
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

  const { query } = await req.json();
  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'query is required' }), {
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
    query SearchProducts($query: String!) {
      products(first: 20, query: $query) {
        edges {
          node {
            id
            title
            vendor
            featuredImage { url }
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  selectedOptions { name value }
                  image { url }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: gqlQuery, variables: { query } }),
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
  if (json.errors) {
    return new Response(JSON.stringify({ error: 'Shopify GraphQLエラー', detail: json.errors }), {
      status: 502,
      headers: corsHeaders,
    });
  }

  const products = (json.data?.products?.edges ?? []).map((edge: any) => {
    const node = edge.node;
    return {
      shopifyProductId: node.id,
      title: node.title,
      brand: node.vendor,
      imageUrl: node.featuredImage?.url ?? null,
      variants: (node.variants?.edges ?? []).map((vEdge: any) => {
        const vNode = vEdge.node;
        const options: { name: string; value: string }[] = vNode.selectedOptions ?? [];
        const size = options.find((o) => /size|サイズ/i.test(o.name))?.value ?? null;
        const color = options.find((o) => /colou?r|カラー|色/i.test(o.name))?.value ?? null;
        return {
          shopifyVariantId: vNode.id,
          sku: vNode.sku,
          size,
          color,
          imageUrl: vNode.image?.url ?? null,
        };
      }),
    };
  });

  return new Response(JSON.stringify({ products }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
