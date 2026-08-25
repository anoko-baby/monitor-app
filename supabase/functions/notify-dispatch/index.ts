// クライアントの操作(案件作成/検収/提出/お知らせ配信)直後に呼ばれる即時通知(仕様書 v1.8 3.8)。
// N1(案件アサイン) / N3(差し戻し) / N4(確認済み) / N5(モニター提出) / N9(お知らせ配信)。
// DBの読み取りは呼び出し元のJWT(RLS)で行い「本人か・権限があるか」を確認したうえで、
// push_token取得・送信・notification_logs記録のみservice roleで行う(モニターが提出した際に
// 宛先であるstaff/adminのpush_tokenを読む必要があり、これはモニターのRLSでは読めないため)。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getStaffAdminProfileIds, sendPushToProfile, sendPushToProfiles } from '../_shared/push.ts';

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

type Payload =
  | { event: 'campaign_assigned'; campaignId: string }
  | { event: 'task_reviewed'; taskId: string; action: 'approved' | 'rejected' }
  | { event: 'task_submitted'; taskId: string }
  | { event: 'announcement_sent'; announcementId: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'authorization header is required' }, 401);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'リクエストの形式が正しくありません' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 呼び出し元のJWTで作ったクライアント。RLSがそのまま効くので「見えるものだけ」読む。
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
  } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return jsonResponse({ error: 'invalid token' }, 401);

  const { data: caller } = await db
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!caller) return jsonResponse({ error: 'profile not found' }, 401);

  // push送信・notification_logs記録専用(他人のpush_tokenを読む必要があるためservice role)。
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const isStaffOrAdmin = caller.role === 'admin' || caller.role === 'staff';

  if (payload.event === 'campaign_assigned') {
    if (!isStaffOrAdmin) return jsonResponse({ error: 'forbidden' }, 403);
    const { data: campaign } = await db
      .from('campaigns')
      .select('title, monitor_id')
      .eq('id', payload.campaignId)
      .maybeSingle();
    if (!campaign) return jsonResponse({ error: 'campaign not found' }, 404);
    await sendPushToProfile(admin, {
      profileId: campaign.monitor_id,
      templateKey: 'n1_campaign_assigned',
      vars: { campaign_title: campaign.title },
    });
    return jsonResponse({ ok: true });
  }

  if (payload.event === 'task_reviewed') {
    if (!isStaffOrAdmin) return jsonResponse({ error: 'forbidden' }, 403);
    const { data: task } = await db
      .from('tasks')
      .select('id, due_date, cycle_id')
      .eq('id', payload.taskId)
      .maybeSingle();
    if (!task) return jsonResponse({ error: 'task not found' }, 404);
    const { data: cycle } = await db
      .from('cycles')
      .select('label, campaign_id')
      .eq('id', task.cycle_id)
      .maybeSingle();
    if (!cycle) return jsonResponse({ error: 'cycle not found' }, 404);
    const { data: campaign } = await db
      .from('campaigns')
      .select('title, monitor_id')
      .eq('id', cycle.campaign_id)
      .maybeSingle();
    if (!campaign) return jsonResponse({ error: 'campaign not found' }, 404);

    await sendPushToProfile(admin, {
      profileId: campaign.monitor_id,
      templateKey: payload.action === 'approved' ? 'n4_task_approved' : 'n3_task_rejected',
      vars: { campaign_title: campaign.title, cycle_label: cycle.label, due_date: task.due_date },
      taskId: task.id,
    });
    return jsonResponse({ ok: true });
  }

  if (payload.event === 'task_submitted') {
    const { data: task } = await db
      .from('tasks')
      .select('id, cycle_id')
      .eq('id', payload.taskId)
      .maybeSingle();
    if (!task) return jsonResponse({ error: 'task not found' }, 404);
    const { data: cycle } = await db
      .from('cycles')
      .select('label, campaign_id')
      .eq('id', task.cycle_id)
      .maybeSingle();
    if (!cycle) return jsonResponse({ error: 'cycle not found' }, 404);
    const { data: campaign } = await db
      .from('campaigns')
      .select('title, monitor_id')
      .eq('id', cycle.campaign_id)
      .maybeSingle();
    if (!campaign) return jsonResponse({ error: 'campaign not found' }, 404);
    // 本人(提出したモニター)のみ呼び出せる。他人の提出を騙って通知を飛ばせないようにする。
    if (caller.id !== campaign.monitor_id) return jsonResponse({ error: 'forbidden' }, 403);

    const { data: monitor } = await admin.from('profiles').select('name').eq('id', campaign.monitor_id).maybeSingle();
    const staffAdminIds = await getStaffAdminProfileIds(admin);
    await sendPushToProfiles(admin, staffAdminIds, {
      templateKey: 'n5_task_submitted',
      vars: { monitor_name: monitor?.name ?? '', campaign_title: campaign.title, cycle_label: cycle.label },
      taskId: task.id,
    });
    return jsonResponse({ ok: true });
  }

  if (payload.event === 'announcement_sent') {
    if (!isStaffOrAdmin) return jsonResponse({ error: 'forbidden' }, 403);
    const { data: announcement } = await db
      .from('announcements')
      .select('id, title, body')
      .eq('id', payload.announcementId)
      .maybeSingle();
    if (!announcement) return jsonResponse({ error: 'announcement not found' }, 404);
    const { data: targets } = await db
      .from('announcement_targets')
      .select('monitor_id')
      .eq('announcement_id', announcement.id);
    await sendPushToProfiles(
      admin,
      (targets ?? []).map((t) => t.monitor_id),
      { templateKey: 'n9_announcement_sent', overrideTitle: announcement.title, overrideBody: announcement.body }
    );
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'unknown event' }, 400);
});
