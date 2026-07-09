// 監視対象クーポン登録時の実在チェック(仕様書 v1.8 3.12)。
const SHOPIFY_API_VERSION = '2025-10';

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

  const { code } = await req.json();
  if (!code) {
    return new Response(JSON.stringify({ error: 'code is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const storeDomain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
  const accessToken = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
  if (!storeDomain || !accessToken) {
    return new Response(JSON.stringify({ error: 'Shopify secrets are not configured' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const gqlQuery = `
    query CheckDiscountCode($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        id
        codeDiscount {
          ... on DiscountCodeBasic { title }
          ... on DiscountCodeBxgy { title }
          ... on DiscountCodeFreeShipping { title }
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
      body: JSON.stringify({ query: gqlQuery, variables: { code } }),
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
  const node = json.data?.codeDiscountNodeByCode;

  if (!node) {
    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ exists: true, title: node.codeDiscount?.title ?? null }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
