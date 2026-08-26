// 招待コード入力画面で、本登録に進む前にコードの有効性を確認し、招待時に登録した
// Instagramアカウント名を返す(実機フィードバック: 本登録画面でInstagramアカウント名を
// 表示して間違いがないか確認できるようにしたい)。本登録前(未ログイン)からの呼び出しのため
// service roleで処理する。有効性チェックはinvite-registerと同じ内容(要同期)。
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  let payload: { code?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'リクエストの形式が正しくありません' }, 400);
  }

  const code = payload.code?.trim().toUpperCase();
  if (!code) {
    return jsonResponse({ error: '招待コードを入力してください' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: invite, error: inviteError } = await admin
    .from('invite_codes')
    .select('id, monitor_id, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();

  if (inviteError) {
    return jsonResponse({ error: '招待コードの確認に失敗しました' }, 500);
  }
  if (!invite) {
    return jsonResponse({ error: '招待コードが正しくありません' }, 400);
  }
  if (invite.used_at) {
    return jsonResponse({ error: 'この招待コードは既に使用されています' }, 400);
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: '招待コードの有効期限が切れています' }, 400);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('instagram_handle')
    .eq('id', invite.monitor_id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: '招待情報の確認に失敗しました' }, 500);
  }

  return jsonResponse({ instagramHandle: profile?.instagram_handle ?? null });
});
