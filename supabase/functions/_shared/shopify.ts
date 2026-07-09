// Dev Dashboardで作成したカスタムアプリは client_credentials グラントで
// 24時間有効のアクセストークンをその都度取得する方式になった(2026年1月〜)。
// SHOPIFY_API_SECRET はWebhookのHMAC検証にも使う同じ値(クライアントシークレット)。
export const SHOPIFY_API_VERSION = '2025-10';

type TokenResult = { token: string; storeDomain: string; error?: undefined } | { error: string };

export async function getShopifyAccessToken(): Promise<TokenResult> {
  const storeDomain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
  const clientId = Deno.env.get('SHOPIFY_API_KEY');
  const clientSecret = Deno.env.get('SHOPIFY_API_SECRET');

  if (!storeDomain || !clientId || !clientSecret) {
    return { error: 'Shopify secrets are not configured' };
  }

  const response = await fetch(`https://${storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { error: `Shopifyトークンの取得に失敗しました: ${detail}` };
  }

  const data = await response.json();
  return { token: data.access_token, storeDomain };
}
