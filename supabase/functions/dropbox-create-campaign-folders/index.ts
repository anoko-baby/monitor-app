// 案件登録時にDropboxへ規定のフォルダ構造を作成する(仕様書 v1.8 6.1)。
// DROPBOX_ROOT_NAMESPACE_ID設定時(「モニターデータ」名前空間直下): /{ブランド名}/{商品名}/{案件番号}_{Instagramアカウント名}/第{n}回_{提出期限YYYYMMDD}/
// 未設定時(従来のApp folder/ホーム名前空間運用): /anoko_monitor/{ブランド名}/{商品名}/{案件番号}_{Instagramアカウント名}/第{n}回_{提出期限YYYYMMDD}/
// DB読み書きは呼び出し元(admin/staff)のJWTをそのまま転送し、RLSに従う(service roleは使わない)。
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  createDropboxFolder,
  getDropboxAccessToken,
  getDropboxRootNamespaceId,
  sanitizeDropboxPathSegment,
} from '../_shared/dropbox.ts';
import { monitorDisplayName } from '../_shared/profiles.ts';

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

function formatCampaignNo(campaignNo: number): string {
  return `A-${String(campaignNo).padStart(4, '0')}`;
}

function formatDateYYYYMMDD(dateStr: string): string {
  return dateStr.replaceAll('-', '');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'authorization header is required' }, 401);
  }

  let payload: { campaignId?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'リクエストの形式が正しくありません' }, 400);
  }

  const campaignId = payload.campaignId;
  if (!campaignId) {
    return jsonResponse({ error: 'campaignId is required' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: campaign, error: campaignError } = await db
    .from('campaigns')
    .select('id, campaign_no, monitor_id')
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return jsonResponse({ error: '案件が見つかりませんでした' }, 404);
  }

  const { data: monitor } = await db
    .from('profiles')
    .select('name, instagram_handle')
    .eq('id', campaign.monitor_id)
    .maybeSingle();

  const { data: firstVariantLink } = await db
    .from('campaign_variants')
    .select('variant_id, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstVariantLink) {
    return jsonResponse({ error: '案件に商品が紐付いていません' }, 400);
  }

  const { data: variant } = await db
    .from('variants')
    .select('sku, product_id')
    .eq('id', firstVariantLink.variant_id)
    .maybeSingle();

  const { data: product } = await db
    .from('products')
    .select('title, brand')
    .eq('id', variant?.product_id)
    .maybeSingle();

  const { data: cycles } = await db
    .from('cycles')
    .select('id, cycle_no')
    .eq('campaign_id', campaignId)
    .order('cycle_no', { ascending: true });

  if (!cycles || cycles.length === 0) {
    return jsonResponse({ error: '案件に回次がありません' }, 400);
  }

  const { data: mediaTasks } = await db
    .from('tasks')
    .select('cycle_id, due_date')
    .eq('type', 'media')
    .in('cycle_id', cycles.map((c) => c.id));

  const dueDateByCycleId = new Map((mediaTasks ?? []).map((t) => [t.cycle_id, t.due_date as string]));

  // 商品フォルダはSKU単位ではなく商品単位(同じ商品の別バリアントは同じフォルダに集約)。
  // 案件フォルダは「案件番号_モニター名」ではなく「案件番号_Instagramアカウント名」にする
  // (Instagramアカウント名の方がモニターを特定しやすいため。未設定の場合は氏名等にフォールバック)。
  const brandSegment = sanitizeDropboxPathSegment(product?.brand || '未分類ブランド');
  const productSegment = sanitizeDropboxPathSegment(product?.title || '商品名未設定');
  const monitorFolderName = monitor?.instagram_handle || monitorDisplayName(monitor);
  const monitorSegment = sanitizeDropboxPathSegment(
    `${formatCampaignNo(campaign.campaign_no)}_${monitorFolderName}`
  );

  // DROPBOX_ROOT_NAMESPACE_ID未設定時(従来のApp folder/ホーム名前空間運用)との後方互換のため、
  // 名前空間を明示的に切り替える場合のみ/anoko_monitorのプレフィックスを省略する(「モニターデータ」
  // 名前空間自体がこのアプリ専用フォルダとして機能するため、その中で二重にフォルダを作る必要が無い)。
  const rootNamespaceId = getDropboxRootNamespaceId();
  const basePath = rootNamespaceId
    ? `/${brandSegment}/${productSegment}/${monitorSegment}`
    : `/anoko_monitor/${brandSegment}/${productSegment}/${monitorSegment}`;

  const tokenResult = await getDropboxAccessToken();
  if ('error' in tokenResult) {
    return jsonResponse({ error: tokenResult.error }, 502);
  }
  const { accessToken } = tokenResult;

  const baseResult = await createDropboxFolder(accessToken, basePath, rootNamespaceId);
  if (!baseResult.ok) {
    return jsonResponse({ error: `Dropboxフォルダ作成に失敗しました: ${baseResult.error}` }, 502);
  }

  for (const cycle of cycles) {
    const dueDate = dueDateByCycleId.get(cycle.id);
    if (!dueDate) continue;
    const cycleSegment = sanitizeDropboxPathSegment(
      `第${cycle.cycle_no}回_${formatDateYYYYMMDD(dueDate)}`
    );
    const cycleResult = await createDropboxFolder(accessToken, `${basePath}/${cycleSegment}`, rootNamespaceId);
    if (!cycleResult.ok) {
      return jsonResponse(
        { error: `回次フォルダ作成に失敗しました(第${cycle.cycle_no}回): ${cycleResult.error}` },
        502
      );
    }
  }

  const { error: updateError } = await db
    .from('campaigns')
    .update({ dropbox_base_path: basePath })
    .eq('id', campaignId);

  if (updateError) {
    return jsonResponse({ error: '案件のDropboxパス保存に失敗しました' }, 500);
  }

  return jsonResponse({ dropboxBasePath: basePath });
});
