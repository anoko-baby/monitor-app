// Dropboxのリフレッシュトークンから短命アクセストークンを発行する。
// App Key/Secret/リフレッシュトークンはSupabase Secretsにのみ置き、クライアントには渡さない(仕様書 v1.8 2.2 / 6.2)。
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const appKey = Deno.env.get('DROPBOX_APP_KEY');
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET');
  const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN');

  if (!appKey || !appSecret || !refreshToken) {
    return new Response(
      JSON.stringify({ error: 'Dropbox secrets are not configured on this project' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const basicAuth = btoa(`${appKey}:${appSecret}`);

  const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text();
    return new Response(JSON.stringify({ error: 'failed to refresh dropbox token', detail }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = await tokenResponse.json();

  return new Response(
    JSON.stringify({ accessToken: data.access_token, expiresIn: data.expires_in }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
