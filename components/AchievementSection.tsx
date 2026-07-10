import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { formatCampaignNo } from '../lib/campaigns';
import { supabase } from '../lib/supabase';

type PastCampaign = {
  campaignNo: number;
  productLabel: string;
  status: string;
};

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  active: '進行中',
  completed: '完了',
  cancelled: '中止',
};

// 3.10 モニター実績(管理者/スタッフのみ表示)。
// 提出率 = (approved+submitted)/対象タスク(cancelled除く)、期限内提出率 = first_submitted_at<=due_date の割合。
export function AchievementSection({ monitorId }: { monitorId: string }) {
  const [loading, setLoading] = useState(true);
  const [submissionRate, setSubmissionRate] = useState<number | null>(null);
  const [onTimeRate, setOnTimeRate] = useState<number | null>(null);
  const [pastCampaigns, setPastCampaigns] = useState<PastCampaign[]>([]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorId]);

  async function load() {
    setLoading(true);

    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, campaign_no, status')
      .eq('monitor_id', monitorId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const campaignIds = (campaigns ?? []).map((c) => c.id);

    const { data: cycles } = campaignIds.length
      ? await supabase.from('cycles').select('id, campaign_id').in('campaign_id', campaignIds)
      : { data: [] as any[] };
    const cycleIds = (cycles ?? []).map((c) => c.id);

    const { data: tasks } = cycleIds.length
      ? await supabase
          .from('tasks')
          .select('status, due_date, first_submitted_at')
          .in('cycle_id', cycleIds)
          .neq('status', 'cancelled')
      : { data: [] as any[] };

    const total = (tasks ?? []).length;
    if (total > 0) {
      const completed = (tasks ?? []).filter((t) => t.status === 'approved' || t.status === 'submitted').length;
      const onTime = (tasks ?? []).filter(
        (t) => t.first_submitted_at && t.first_submitted_at.slice(0, 10) <= t.due_date
      ).length;
      setSubmissionRate(completed / total);
      setOnTimeRate(onTime / total);
    } else {
      setSubmissionRate(null);
      setOnTimeRate(null);
    }

    const { data: variantLinks } = campaignIds.length
      ? await supabase
          .from('campaign_variants')
          .select('campaign_id, variant_id, created_at')
          .in('campaign_id', campaignIds)
          .order('created_at', { ascending: true })
      : { data: [] as any[] };
    const variantIds = Array.from(new Set((variantLinks ?? []).map((v) => v.variant_id)));
    const { data: variantsData } = variantIds.length
      ? await supabase.from('variants').select('id, product_id').in('id', variantIds)
      : { data: [] as any[] };
    const productIds = Array.from(new Set((variantsData ?? []).map((v) => v.product_id)));
    const { data: productsData } = productIds.length
      ? await supabase.from('products').select('id, title').in('id', productIds)
      : { data: [] as any[] };
    const productById = new Map((productsData ?? []).map((p) => [p.id, p]));
    const variantProductId = new Map((variantsData ?? []).map((v) => [v.id, v.product_id]));

    const productLabelByCampaign = new Map<string, string>();
    for (const link of variantLinks ?? []) {
      if (productLabelByCampaign.has(link.campaign_id)) continue;
      const productId = variantProductId.get(link.variant_id);
      productLabelByCampaign.set(link.campaign_id, productId ? productById.get(productId)?.title ?? '' : '');
    }

    setPastCampaigns(
      (campaigns ?? []).map((c) => ({
        campaignNo: c.campaign_no,
        productLabel: productLabelByCampaign.get(c.id) || '(商品情報なし)',
        status: c.status,
      }))
    );

    setLoading(false);
  }

  return (
    <View>
      <Text className="font-body-medium text-body text-ink mb-3">モニター実績</Text>
      <View className="bg-surface rounded-card border-hairline border-line p-4">
        <View className="flex-row justify-between mb-2">
          <Text className="font-body text-caption text-ink-soft">提出率</Text>
          <Text className="font-body text-caption text-ink-soft">
            {loading || submissionRate === null ? '-' : `${Math.round(submissionRate * 100)}%`}
          </Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="font-body text-caption text-ink-soft">期限内提出率</Text>
          <Text className="font-body text-caption text-ink-soft">
            {loading || onTimeRate === null ? '-' : `${Math.round(onTimeRate * 100)}%`}
          </Text>
        </View>

        {pastCampaigns.length === 0 ? (
          <Text className="font-body text-caption text-ink-soft mt-2">過去案件はまだありません</Text>
        ) : (
          pastCampaigns.map((c) => (
            <View key={c.campaignNo} className="flex-row justify-between mt-2">
              <Text className="font-body text-caption text-ink" numberOfLines={1} style={{ flex: 1 }}>
                {formatCampaignNo(c.campaignNo)} {c.productLabel}
              </Text>
              <Text className="font-body text-caption text-ink-soft">{CAMPAIGN_STATUS_LABEL[c.status]}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
