// 日次バッチ通知(仕様書 v1.8 3.8): N2(期限7日前/前日リマインド)・N6(期限超過督促)・
// N7(期限超過の発生報告)・N10(到着確認リマインド)。pg_cron(migration参照)から毎朝9:00(JST)に
// x-cron-secret付きで呼ばれる想定。CRON_SECRETはEdge Function Secretsに設定しておくこと。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { alreadySentToday, getStaffAdminProfileIds, sendPushToProfile, sendPushToProfiles } from '../_shared/push.ts';

function addDaysToISODate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 起動は00:00 UTC(=09:00 JST)固定のため、当時点のUTC日付=JST日付として扱う。
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
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

  const { data: settingsRows } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['reminder_days_before', 'overdue_days_after', 'delivery_reminder_days']);
  const settings = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const reminderDaysBefore = (settings.get('reminder_days_before') as number[]) ?? [7, 1];
  const overdueDaysAfter = (settings.get('overdue_days_after') as number) ?? 2;
  const deliveryReminderDays = (settings.get('delivery_reminder_days') as number) ?? 5;

  const today = todayISODate();
  let sentCount = 0;

  // N2: 未提出(pending)タスクの期限がreminder_days_before日後にあたる場合、案件のreminder_enabled=trueのみ
  for (const daysBefore of reminderDaysBefore) {
    const targetDate = addDaysToISODate(today, daysBefore);
    const templateKey = daysBefore === 7 ? 'n2_reminder_7' : 'n2_reminder_1';

    const { data: tasks } = await admin
      .from('tasks')
      .select('id, due_date, cycle_id, cycles!inner(label, campaign_id, campaigns!inner(title, monitor_id, reminder_enabled, status))')
      .eq('status', 'pending')
      .eq('due_date', targetDate);

    for (const t of (tasks ?? []) as any[]) {
      const campaign = t.cycles.campaigns;
      if (!campaign.reminder_enabled || campaign.status !== 'active') continue;
      if (await alreadySentToday(admin, t.id, templateKey)) continue;
      await sendPushToProfile(admin, {
        profileId: campaign.monitor_id,
        templateKey,
        vars: { campaign_title: campaign.title, cycle_label: t.cycles.label, due_date: t.due_date },
        taskId: t.id,
      });
      sentCount++;
    }
  }

  // N6/N7: 期限のoverdue_days_after日後になっても未提出(pending/rejected)のタスク
  {
    const overdueDate = addDaysToISODate(today, -overdueDaysAfter);
    const { data: tasks } = await admin
      .from('tasks')
      .select('id, due_date, cycle_id, cycles!inner(label, campaign_id, campaigns!inner(title, monitor_id, status))')
      .in('status', ['pending', 'rejected'])
      .eq('due_date', overdueDate);

    const staffAdminIds = await getStaffAdminProfileIds(admin);

    for (const t of (tasks ?? []) as any[]) {
      const campaign = t.cycles.campaigns;
      if (campaign.status !== 'active') continue;
      if (await alreadySentToday(admin, t.id, 'n6_overdue_monitor')) continue;

      const { data: monitor } = await admin.from('profiles').select('name').eq('id', campaign.monitor_id).maybeSingle();
      const vars = { campaign_title: campaign.title, cycle_label: t.cycles.label, due_date: t.due_date, monitor_name: monitor?.name ?? '' };

      await sendPushToProfile(admin, { profileId: campaign.monitor_id, templateKey: 'n6_overdue_monitor', vars, taskId: t.id });
      await sendPushToProfiles(admin, staffAdminIds, { templateKey: 'n7_overdue_staff', vars, taskId: t.id });
      sentCount++;
    }
  }

  // N10: 発送からdelivery_reminder_days日経過しても到着確認(delivered_at)が押されていない案件
  {
    const shippedTargetDate = addDaysToISODate(today, -deliveryReminderDays);
    const { data: campaigns } = await admin
      .from('campaigns')
      .select('id, title, monitor_id')
      .eq('shipped_at', shippedTargetDate)
      .eq('status', 'active')
      .is('delivered_at', null);

    const staffAdminIds = await getStaffAdminProfileIds(admin);

    for (const c of campaigns ?? []) {
      const alreadyLogged = await alreadySentTodayForCampaign(admin, c.id, 'n10_delivery_reminder_monitor');
      if (alreadyLogged) continue;

      const { data: monitor } = await admin.from('profiles').select('name').eq('id', c.monitor_id).maybeSingle();
      await sendPushToProfile(admin, {
        profileId: c.monitor_id,
        templateKey: 'n10_delivery_reminder_monitor',
        vars: { campaign_title: c.title },
      });
      await sendPushToProfiles(admin, staffAdminIds, {
        templateKey: 'n10_delivery_reminder_staff',
        vars: { campaign_title: c.title, monitor_name: monitor?.name ?? '' },
      });
      sentCount++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sentCount }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

// N10はtask_idを持たないため、profile_id×template_keyの組み合わせで当日分の重複を判定する。
async function alreadySentTodayForCampaign(
  admin: ReturnType<typeof createClient>,
  campaignId: string,
  templateKey: string
): Promise<boolean> {
  const { data: campaign } = await admin.from('campaigns').select('monitor_id').eq('id', campaignId).maybeSingle();
  if (!campaign) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', campaign.monitor_id)
    .eq('template_key', templateKey)
    .gte('sent_at', todayStart.toISOString());
  return (count ?? 0) > 0;
}
