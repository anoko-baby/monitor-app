import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { CycleDots } from '../components/CycleDots';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroProfileBadge } from '../components/HeroProfileBadge';
import { HeroScreen } from '../components/HeroScreen';
import { CycleDotStatus, deriveCycleStatus } from '../lib/campaigns';
import { supabase } from '../lib/supabase';
import { monitorTabItems } from '../lib/tabItems';
import { CampaignDetailContent } from './campaign-detail';
import { SnsSubmissionFormContent } from './sns-submission-form';
import { SubmissionFormContent } from './submission-form';

type CampaignRow = {
  id: string;
  title: string;
  productLabel: string;
  nextDueDate: string | null;
  pendingCount: number;
  cycleStatuses: CycleDotStatus[];
};

// ホームのシート内でどの画面を表示しているか。ヘッダー(「あなたの案件」+アイコン+タブバー)は
// 常に据え置きで、この状態に応じてシート本体だけを入れ替える(実機フィードバック: 詳細ページに
// 飛んでもヘッダーやフッタータブは変わらず、シート領域だけが切り替わるようにしたい、との要望)。
type SheetView =
  | { type: 'list' }
  | { type: 'campaign'; id: string }
  | { type: 'submission'; taskId: string; campaignId: string }
  | { type: 'sns'; taskId: string; campaignId: string };

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニターのホーム(仕様書 v1.8 画面一覧4)。以前のwelcome.tsxのスタブをここで本実装に差し替えた。
export default function MonitorHome() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [view, setView] = useState<SheetView>({ type: 'list' });

  async function load() {
    setLoading(true);
    setLoadError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoadError('ログイン情報が確認できませんでした。もう一度ログインし直してください。');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();
    if (profileError) {
      setLoadError(`プロフィールの取得に失敗しました: ${profileError.message}`);
      setLoading(false);
      return;
    }
    if (!profile) {
      setLoadError('モニターのプロフィールが見つかりませんでした。管理者にご確認ください。');
      setLoading(false);
      return;
    }

    const { data: campaignsData, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, title')
      .eq('monitor_id', profile.id)
      .eq('status', 'active')
      .is('deleted_at', null);
    if (campaignsError) {
      setLoadError(`案件一覧の取得に失敗しました: ${campaignsError.message}`);
      setLoading(false);
      return;
    }

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

  async function loadUnreadAnnouncements() {
    const { count } = await supabase
      .from('announcement_targets')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    setUnreadAnnouncements(count ?? 0);
  }

  useEffect(() => {
    load();
    loadUnreadAnnouncements();
  }, []);

  const visibleCampaigns = campaigns.filter((c) => (activeTab === 'pending' ? c.pendingCount > 0 : c.pendingCount === 0));

  function backToList() {
    setView({ type: 'list' });
    load();
  }

  const onBack =
    view.type === 'campaign'
      ? backToList
      : view.type === 'submission' || view.type === 'sns'
        ? () => setView({ type: 'campaign', id: view.campaignId })
        : undefined;

  return (
    <View className="flex-1">
      <HeroScreen
        title="あなたの案件"
        subtitle={view.type === 'list' ? `未提出 ${campaigns.filter((c) => c.pendingCount > 0).length}件` : undefined}
        headerExtra={<HeroProfileBadge />}
        onBack={onBack}
        tabs={
          view.type === 'list'
            ? [
                { key: 'pending', label: '未提出', icon: 'time-outline', activeIcon: 'time' },
                { key: 'done', label: '提出済み', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle' },
              ]
            : undefined
        }
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as 'pending' | 'done')}
      >
        {view.type === 'list' && (
          <View className="flex-1 px-6 pt-4">
            {loadError && <ErrorBanner message={loadError} />}

            <FlatList
              style={{ flex: 1 }}
              data={visibleCampaigns}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                !loading ? (
                  <Text className="font-body text-caption text-ink-soft">
                    {activeTab === 'pending' ? '未提出の案件はありません' : 'まだ提出済みの案件はありません'}
                  </Text>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setView({ type: 'campaign', id: item.id })}
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
          </View>
        )}

        {view.type === 'campaign' && (
          <CampaignDetailContent
            id={view.id}
            onOpenTask={(taskId, type) =>
              setView(type === 'media' ? { type: 'submission', taskId, campaignId: view.id } : { type: 'sns', taskId, campaignId: view.id })
            }
          />
        )}

        {view.type === 'submission' && <SubmissionFormContent taskId={view.taskId} />}
        {view.type === 'sns' && <SnsSubmissionFormContent taskId={view.taskId} />}
      </HeroScreen>

      <BottomTabBar items={monitorTabItems(unreadAnnouncements)} />
    </View>
  );
}
