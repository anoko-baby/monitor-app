// 外部連携の異常検知(仕様書 v1.8 3.8 N12): Dropboxトークン失効 / Shopify APIエラー /
// Dropbox容量80%超過を日次で検査し、管理者(role=admin)へPush通知する。
// pg_cron(migration参照)から毎朝9:00(JST)にx-cron-secret付きで呼ばれる想定。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getDropboxAccessToken } from '../_shared/dropbox.ts';
import { getShopifyAccessToken } from '../_shared/shopify.ts';
import { getAdminProfileIds, sendPushToProfiles } from '../_shared/push.ts';

// n12_health_check はこの関数自体が1日1回のcronでしか起動されない前提のため、
// 「今日すでに送信済みか」だけを見る単純な二重送信防止(手動での再実行時の保険)。
async function alreadyNotifiedToday(admin: ReturnType<typeof createClient>): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .eq('template_key', 'n12_health_check')
    .gte('sent_at', todayStart.toISOString());
  return (count ?? 0) > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const issues: string[] = [];

  const dropboxToken = await getDropboxAccessToken();
  if ('error' in dropboxToken) {
    issues.push(`Dropboxのアクセストークン取得に失敗しています。App Key/Secret/リフレッシュトークンをご確認ください。(${dropboxToken.error})`);
  } else {
    try {
      const usageRes = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${dropboxToken.accessToken}` },
      });
      if (usageRes.ok) {
        const usage = await usageRes.json();
        const used = usage.used as number;
        const allocated = usage.allocation?.allocated as number | undefined;
        if (allocated && used / allocated >= 0.8) {
          const percent = Math.round((used / allocated) * 100);
          issues.push(`Dropboxの使用容量が${percent}%に達しています。プランの見直しをご検討ください。`);
        }
      }
    } catch {
      // 容量チェック自体の失敗はトークン失効ほど致命的ではないため通知は見送る
    }
  }

  const shopifyToken = await getShopifyAccessToken();
  if ('error' in shopifyToken) {
    issues.push(`Shopify APIのアクセストークン取得に失敗しています。Client ID/Secretをご確認ください。(${shopifyToken.error})`);
  }

  if (issues.length === 0) {
    return new Response(JSON.stringify({ ok: true, issues: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (await alreadyNotifiedToday(admin)) {
    return new Response(JSON.stringify({ ok: true, issues: issues.length, sent: 0, skipped: 'already sent today' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminIds = await getAdminProfileIds(admin);
  await sendPushToProfiles(admin, adminIds, {
    templateKey: 'n12_health_check',
    overrideTitle: '外部連携の異常を検知しました',
    overrideBody: issues.join('\n'),
  });

  return new Response(JSON.stringify({ ok: true, issues: issues.length, sent: adminIds.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
