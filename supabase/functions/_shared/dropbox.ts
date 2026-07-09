// Dropboxのリフレッシュトークンから短命アクセストークンを発行する処理の共有化。
// App Key/Secret/リフレッシュトークンはSupabase Secretsにのみ置き、クライアントには渡さない(仕様書 v1.8 2.2 / 6.2)。

type TokenResult = { accessToken: string; expiresIn: number; error?: undefined } | { error: string };

export async function getDropboxAccessToken(): Promise<TokenResult> {
  const appKey = Deno.env.get('DROPBOX_APP_KEY');
  const appSecret = Deno.env.get('DROPBOX_APP_SECRET');
  const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN');

  if (!appKey || !appSecret || !refreshToken) {
    return { error: 'Dropbox secrets are not configured on this project' };
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
    return { error: `failed to refresh dropbox token: ${detail}` };
  }

  const data = await tokenResponse.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// パス使用不可文字(/ \ : * ? " < > |)を「-」に置換する(仕様書 v1.8 6.1)。
export function sanitizeDropboxPathSegment(segment: string): string {
  return segment.replace(/[/\\:*?"<>|]/g, '-').trim();
}

export async function createDropboxFolder(
  accessToken: string,
  path: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, autorename: false }),
  });

  if (response.ok) {
    return { ok: true };
  }

  const detail = await response.text();
  // 既に同名フォルダが存在する場合(再実行・回次の重複作成防止)は成功扱いにする
  if (detail.includes('path/conflict')) {
    return { ok: true };
  }

  return { ok: false, error: detail };
}
