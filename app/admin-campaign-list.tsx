import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { CycleDots } from '../components/CycleDots';
import { CycleDotStatus, deriveCycleStatus, formatCampaignNo } from '../lib/campaigns';
import { supabase } from '../lib/supabase';

type CampaignRow = {
  id: string;
  campaignNo: number;
  title: string;
  status: 'active' | 'completed' | 'cancelled';
  monitorName: string | null;
  cycleStatuses: CycleDotStatus[];
};

const STATUS_LABEL: Record<CampaignRow['status'], string> = {
  active: '進行中',
  completed: '完了',
  cancelled: '中止',
};

// 案件一覧(仕様書 v1.8 画面一覧 3)。行タップで案件作成・編集画面(admin-campaign-form)を編集モードで開く。
export default function AdminCampaignList() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data: campaignsData } = await supabase
      .from('campaigns')
      .select('id, campaign_no, title, status, monitor:profiles(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const campaignIds = (campaignsData ?? []).map((c) => c.id);

    const { data: cyclesData } = campaignIds.length
      ? await supabase
          .from('cycles')
          .select('id, campaign_id, cycle_no, tasks(status, due_date)')
          .in('campaign_id', campaignIds)
          .order('cycle_no', { ascending: true })
      : { data: [] as any[] };

    const cyclesByCampaign = new Map<string, CycleDotStatus[]>();
    for (const cycle of cyclesData ?? []) {
      const status = deriveCycleStatus(cycle.tasks ?? []);
      const list = cyclesByCampaign.get(cycle.campaign_id) ?? [];
      list.push(status);
      cyclesByCampaign.set(cycle.campaign_id, list);
    }

    setCampaigns(
      (campaignsData ?? []).map((c: any) => ({
        id: c.id,
        campaignNo: c.campaign_no,
        title: c.title,
        status: c.status,
        monitorName: c.monitor?.name ?? null,
        cycleStatuses: cyclesByCampaign.get(c.id) ?? [],
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="font-heading text-title-lg text-ink">案件一覧</Text>
        <Pressable onPress={() => router.push('/admin-campaign-form')}>
          <Text className="font-body-medium text-body text-accent-ink">+ 新規案件</Text>
        </Pressable>
      </View>

      {loading && <Text className="font-body text-caption text-ink-soft">読み込み中…</Text>}

      <FlatList
        data={campaigns}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <Text className="font-body text-caption text-ink-soft">まだ案件がありません</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/admin-campaign-form', params: { id: item.id } })
            }
            className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="font-body text-caption text-ink-soft">
                {formatCampaignNo(item.campaignNo)}
              </Text>
              <Text className="font-body text-caption text-ink-soft">
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <Text className="font-body-medium text-body text-ink mb-1">{item.title}</Text>
            <Text className="font-body text-caption text-ink-soft mb-2">
              {item.monitorName ?? '(モニター不明)'}
            </Text>
            {item.cycleStatuses.length > 0 && <CycleDots statuses={item.cycleStatuses} />}
          </Pressable>
        )}
      />
    </View>
  );
}
