import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { CycleDots } from '../components/CycleDots';
import { Screen } from '../components/Screen';
import { CycleDotStatus, deriveCycleStatus } from '../lib/campaigns';
import { supabase } from '../lib/supabase';

type CampaignRow = {
  id: string;
  title: string;
  productLabel: string;
  nextDueDate: string | null;
  pendingCount: number;
  cycleStatuses: CycleDotStatus[];
};

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニターのホーム(仕様書 v1.8 画面一覧4)。以前のwelcome.tsxのスタブをここで本実装に差し替えた。
export default function MonitorHome() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (!profile) {
      setLoading(false);
      return;
    }

    const { data: campaignsData } = await supabase
      .from('campaigns')
      .select('id, title')
      .eq('monitor_id', profile.id)
      .eq('status', 'active')
      .is('deleted_at', null);

    const campaignIds = (campaignsData ?? []).map((c) => c.id);

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

    const firstProductLabelByCampaign = new Map<string, string>();
    for (const link of variantLinks ?? []) {
      if (firstProductLabelByCampaign.has(link.campaign_id)) continue;
      const productId = variantProductId.get(link.variant_id);
      const title = productId ? productById.get(productId)?.title : null;
      firstProductLabelByCampaign.set(link.campaign_id, title ?? '(商品情報なし)');
    }

    const { data: cyclesData } = campaignIds.length
      ? await supabase
          .from('cycles')
          .select('id, campaign_id, cycle_no, tasks(status, due_date)')
          .in('campaign_id', campaignIds)
          .order('cycle_no', { ascending: true })
      : { data: [] as any[] };

    const rows: CampaignRow[] = (campaignsData ?? []).map((c) => {
      const cyclesForCampaign = (cyclesData ?? []).filter((cy: any) => cy.campaign_id === c.id);
      const cycleStatuses = cyclesForCampaign.map((cy: any) => deriveCycleStatus(cy.tasks ?? []));

      const pendingTasks = cyclesForCampaign
        .flatMap((cy: any) => cy.tasks ?? [])
        .filter((t: any) => t.status === 'pending' || t.status === 'rejected');
      const nextDueDate =
        pendingTasks.length > 0
          ? pendingTasks.reduce((min: string, t: any) => (t.due_date < min ? t.due_date : min), pendingTasks[0].due_date)
          : null;

      return {
        id: c.id,
        title: c.title,
        productLabel: firstProductLabelByCampaign.get(c.id) ?? '(商品情報なし)',
        nextDueDate,
        pendingCount: pendingTasks.length,
        cycleStatuses,
      };
    });

    rows.sort((a, b) => {
      if (!a.nextDueDate && !b.nextDueDate) return 0;
      if (!a.nextDueDate) return 1;
      if (!b.nextDueDate) return -1;
      return a.nextDueDate < b.nextDueDate ? -1 : 1;
    });

    setCampaigns(rows);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <Screen className="px-6 pt-6">
      <View className="flex-row items-center justify-between mb-6">
        <Text className="font-heading text-title-lg text-ink">あなたの案件</Text>
        <View className="flex-row" style={{ gap: 16 }}>
          <Pressable onPress={() => router.push('/submission-history')}>
            <Text className="font-body text-caption text-accent-ink">提出履歴</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/monitor-profile')}>
            <Text className="font-body text-caption text-accent-ink">プロフィール</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={campaigns}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <Text className="font-body text-caption text-ink-soft">
              まだ案件はありません。準備が整いましたらお知らせします。
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/campaign-detail', params: { id: item.id } })}
            className="bg-surface rounded-card border-hairline border-line px-4 py-4 mb-3"
          >
            <Text className="font-body-medium text-body text-ink mb-1">{item.title}</Text>
            <Text className="font-body text-caption text-ink-soft mb-2">{item.productLabel}</Text>

            <View className="flex-row items-center justify-between mb-2">
              {item.nextDueDate ? (
                <Text className="font-body-medium text-title text-status-overdue">
                  次の期限: {formatDueDate(item.nextDueDate)}
                </Text>
              ) : (
                <Text className="font-body text-caption text-ink-soft">未提出の項目はありません</Text>
              )}
              {item.pendingCount > 0 && (
                <View className="bg-status-overdue/10 rounded-full px-3 py-1">
                  <Text className="font-body-medium text-caption text-status-overdue">
                    未提出 {item.pendingCount}
                  </Text>
                </View>
              )}
            </View>

            {item.cycleStatuses.length > 0 && <CycleDots statuses={item.cycleStatuses} />}
          </Pressable>
        )}
      />

      <Pressable onPress={handleSignOut} className="items-center mt-4">
        <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
      </Pressable>
    </Screen>
  );
}
