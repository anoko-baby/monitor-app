import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { CycleDots } from '../components/CycleDots';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { StatusPill } from '../components/StatusPill';
import { CycleDotStatus, deriveCycleStatus, formatCampaignNo, monitorDisplayName } from '../lib/campaigns';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'done'>('active');

  async function load() {
    setLoading(true);
    setLoadError(null);

    const { data: campaignsData, error } = await supabase
      .from('campaigns')
      .select('id, campaign_no, title, status, monitor:profiles(name, instagram_handle)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) setLoadError(`案件一覧の取得に失敗しました: ${error.message}`);

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
        monitorName: monitorDisplayName({
          name: c.monitor?.name ?? null,
          instagramHandle: c.monitor?.instagram_handle ?? null,
        }),
        cycleStatuses: cyclesByCampaign.get(c.id) ?? [],
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const visibleCampaigns = campaigns.filter((c) => (activeTab === 'active' ? c.status === 'active' : c.status !== 'active'));

  return (
    <View className="flex-1">
      <HeroScreen
        title="案件一覧"
        subtitle={`進行中 ${campaigns.filter((c) => c.status === 'active').length}件`}
        tabs={[
          { key: 'active', label: '進行中', icon: 'time-outline', activeIcon: 'time' },
          { key: 'done', label: '完了・中止', icon: 'checkmark-done-outline', activeIcon: 'checkmark-done' },
        ]}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as 'active' | 'done')}
      >
        <View className="flex-1 px-6 pt-4">
          <View className="flex-row justify-end mb-2">
            <Pressable onPress={() => router.push('/admin-campaign-form')}>
              <Text className="font-body-medium text-body text-accent-ink">+ 新規案件</Text>
            </Pressable>
          </View>

          {loadError && <ErrorBanner message={loadError} />}
          {loading && <Text className="font-body text-caption text-ink-soft">読み込み中…</Text>}

          <FlatList
            style={{ flex: 1 }}
            data={visibleCampaigns}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              !loading ? (
                <Text className="font-body text-caption text-ink-soft">該当する案件がありません</Text>
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
                  <StatusPill
                    label={STATUS_LABEL[item.status]}
                    tone={item.status === 'active' ? 'accent' : item.status === 'cancelled' ? 'rejected' : 'neutral'}
                  />
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
      </HeroScreen>

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </View>
  );
}
