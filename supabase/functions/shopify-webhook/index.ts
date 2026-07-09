import { createClient } from 'jsr:@supabase/supabase-js@2';

// Shopify Webhook `orders/create` 受信(仕様書 v1.8 3.12)。
// Shopify自体はSupabaseの認証ヘッダーを送れないため、HMAC署名検証を認証として使う
// (--no-verify-jwt でデプロイする。検証前提でservice roleを使うのはこの関数のみ)。

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

async function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return timingSafeEqual(new TextEncoder().encode(computedBase64), new TextEncoder().encode(hmacHeader));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // WebhookのHMAC検証にはアプリのクライアントシークレット(SHOPIFY_API_SECRET)を使う。
  const webhookSecret = Deno.env.get('SHOPIFY_API_SECRET');
  if (!webhookSecret) {
    return new Response('webhook secret not configured', { status: 500 });
  }

  const hmacHeader = req.headers.get('X-Shopify-Hmac-Sha256');
  const rawBody = await req.text();

  if (!hmacHeader || !(await verifyShopifyHmac(rawBody, hmacHeader, webhookSecret))) {
    return new Response('invalid signature', { status: 401 });
  }

  const order = JSON.parse(rawBody);
  const couponCode: string | undefined = order.discount_codes?.[0]?.code;

  if (!couponCode) {
    return new Response('no discount code, ignored', { status: 200 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: watched } = await admin
    .from('watched_coupons')
    .select('code')
    .eq('code', couponCode)
    .eq('active', true)
    .maybeSingle();

  if (!watched) {
    return new Response('coupon not watched, ignored', { status: 200 });
  }

  const shopifyCustomerId = order.customer?.id ? String(order.customer.id) : null;

  let monitorId: string | null = null;
  if (shopifyCustomerId) {
    const { data: monitor } = await admin
      .from('profiles')
      .select('id')
      .eq('shopify_customer_id', shopifyCustomerId)
      .maybeSingle();
    monitorId = monitor?.id ?? null;
  }

  await admin.from('coupon_orders').upsert(
    {
      shopify_order_id: String(order.id),
      order_no: order.name,
      ordered_at: order.created_at,
      coupon_code: couponCode,
      customer_name: order.customer
        ? `${order.customer.last_name ?? ''} ${order.customer.first_name ?? ''}`.trim()
        : null,
      customer_email: order.email ?? order.contact_email ?? null,
      shopify_customer_id: shopifyCustomerId,
      line_items: order.line_items ?? [],
      monitor_id: monitorId,
      status: 'pending',
    },
    { onConflict: 'shopify_order_id' }
  );

  return new Response('ok', { status: 200 });
});
