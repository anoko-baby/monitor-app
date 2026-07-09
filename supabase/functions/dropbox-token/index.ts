// Dropboxのリフレッシュトークンから短命アクセストークンを発行する。
// App Key/Secret/リフレッシュトークンはSupabase Secretsにのみ置き、クライアントには渡さない(仕様書 v1.8 2.2 / 6.2)。
import { getDropboxAccessToken } from '../_shared/dropbox.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await getDropboxAccessToken();

  if ('error' in result) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
