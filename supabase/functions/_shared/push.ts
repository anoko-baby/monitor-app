// 通知テンプレートの描画・Expo Push送信・notification_logs記録の共通処理(仕様書 v1.8 3.8)。
// 呼び出し側は必ずservice roleクライアントを渡すこと(push_token/notify_pushはRLS越しに見えないため)。
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

async function logResult(
  admin: SupabaseClient,
  profileId: string,
  templateKey: string,
  taskId: string | null,
  result: 'sent' | 'failed' | 'skipped_no_token' | 'skipped_notify_off'
) {
  await admin.from('notification_logs').insert({
    profile_id: profileId,
    template_key: templateKey,
    channel: 'push',
    task_id: taskId,
    result,
  });
}

type SendPushParams = {
  profileId: string;
  templateKey: string;
  vars?: Record<string, string>;
  taskId?: string | null;
  // announcements(N9)のようにテンプレートを使わず、都度の本文をそのまま送りたい場合に指定する。
  overrideTitle?: string;
  overrideBody?: string;
};

export async function sendPushToProfile(admin: SupabaseClient, params: SendPushParams): Promise<void> {
  const { profileId, templateKey, vars = {}, taskId = null, overrideTitle, overrideBody } = params;

  const { data: profile } = await admin
    .from('profiles')
    .select('push_token, notify_push')
    .eq('id', profileId)
    .maybeSingle();

  if (!profile?.push_token) {
    await logResult(admin, profileId, templateKey, taskId, 'skipped_no_token');
    return;
  }
  if (!profile.notify_push) {
    await logResult(admin, profileId, templateKey, taskId, 'skipped_notify_off');
    return;
  }

  let title = overrideTitle;
  let body = overrideBody;
  if (title === undefined || body === undefined) {
    const { data: template } = await admin
      .from('notification_templates')
      .select('title, body')
      .eq('key', templateKey)
      .maybeSingle();
    if (!template) {
      await logResult(admin, profileId, templateKey, taskId, 'failed');
      return;
    }
    title = title ?? renderTemplate(template.title, vars);
    body = body ?? renderTemplate(template.body, vars);
  }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: profile.push_token, title, body, sound: 'default' }),
    });
    const json = await res.json().catch(() => null);
    const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
    const ok = res.ok && ticket?.status !== 'error';
    await logResult(admin, profileId, templateKey, taskId, ok ? 'sent' : 'failed');
  } catch {
    await logResult(admin, profileId, templateKey, taskId, 'failed');
  }
}

export async function sendPushToProfiles(
  admin: SupabaseClient,
  profileIds: string[],
  params: Omit<SendPushParams, 'profileId'>
): Promise<void> {
  await Promise.all(profileIds.map((profileId) => sendPushToProfile(admin, { ...params, profileId })));
}

export async function getStaffAdminProfileIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'staff'])
    .eq('status', 'active');
  return (data ?? []).map((p: { id: string }) => p.id);
}

export async function getAdminProfileIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('profiles').select('id').eq('role', 'admin').eq('status', 'active');
  return (data ?? []).map((p: { id: string }) => p.id);
}

// 同じタスク×テンプレートに対して同日中に既に送信済みなら再送しない(cronの重複実行対策)。
export async function alreadySentToday(
  admin: SupabaseClient,
  taskId: string,
  templateKey: string
): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId)
    .eq('template_key', templateKey)
    .gte('sent_at', todayStart.toISOString());
  return (count ?? 0) > 0;
}
