import { createClient } from 'jsr:@supabase/supabase-js@2';

// モニターの本登録: 招待コードを検証し、Supabase Authユーザーを作成して
// 仮登録済みの profiles 行に紐付ける(仕様書 v1.8 3.1.1)。
// service role が必要な操作(auth.admin.createUser・RLSを跨いだ更新)のため Edge Function 化している。

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

  let payload: { code?: string; email?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'リクエストの形式が正しくありません' }, 400);
  }

  const code = payload.code?.trim().toUpperCase();
  const email = payload.email?.trim().toLowerCase();
  const password = payload.password;

  if (!code || !email || !password) {
    return jsonResponse({ error: '招待コード・メールアドレス・パスワードを入力してください' }, 400);
  }
  if (password.length < 8) {
    return jsonResponse({ error: 'パスワードは8文字以上で入力してください' }, 400);
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
    .select('id, role, auth_user_id')
    .eq('id', invite.monitor_id)
    .maybeSingle();

  if (profileError || !profile) {
    return jsonResponse({ error: '招待コードに対応するモニターが見つかりませんでした' }, 400);
  }
  if (profile.auth_user_id) {
    return jsonResponse({ error: 'このモニターは既に本登録済みです' }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    const message = createError?.message?.includes('already been registered')
      ? 'このメールアドレスは既に登録されています'
      : 'アカウントの作成に失敗しました';
    return jsonResponse({ error: message }, 400);
  }

  const { error: updateError } = await admin
    .from('profiles')
    .update({ auth_user_id: created.user.id, email })
    .eq('id', profile.id);

  if (updateError) {
    // ロールバック: 作成済みのAuthユーザーを削除して不整合を防ぐ
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: 'モニター情報の更新に失敗しました' }, 500);
  }

  await admin.from('invite_codes').update({ used_at: new Date().toISOString() }).eq('id', invite.id);

  return jsonResponse({ success: true });
});
