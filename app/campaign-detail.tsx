import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { StatusPill } from '../components/StatusPill';
import { variantLabel } from '../lib/campaigns';
import { goBackOrReplace } from '../lib/navigation';
import { supabase } from '../lib/supabase';

type ProductInfo = {
  title: string;
  brand: string | null;
  imageUrl: string | null;
  variantTitle: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
};

type TaskRow = { id: string; type: 'media' | 'sns'; due_date: string; status: string };
type CycleRow = { id: string; cycle_no: number; label: string; tasks: TaskRow[] };

type CampaignDetail = {
  id: string;
  title: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  shootingGuideline: string | null;
  products: ProductInfo[];
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '未提出',
  submitted: '提出済',
  approved: '確認済',
  rejected: '差し戻し',
  cancelled: 'キャンセル',
};

type PillTone = 'neutral' | 'accent' | 'overdue' | 'rejected';

// データ提出とSNS投稿の区別がぱっと見でわかるよう、タスク種別ごとにアイコン・見出し・ボタン風の
// 見た目を分ける(実機フィードバック: 「回次一覧でデータ提出と投稿の区別がわかりづらい」)。
function taskStatusTone(status: string, dueDate: string): PillTone {
  if (status === 'rejected') return 'rejected';
  if (status === 'approved' || status === 'submitted') return 'accent';
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today ? 'overdue' : 'neutral';
}

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニター側 案件詳細の本体(仕様書 v1.8 画面一覧5)。商品情報・撮影ガイドライン・回次一覧・到着確認ボタン。
// 単独ルート(直接アクセス/通知経由)でもmonitor-homeの「あなたの案件」シート内埋め込みでも使う
// 共通コンポーネント。onOpenTaskの呼び出し方だけ呼び出し元で変える。
export function CampaignDetailContent({
  id,
  onOpenTask,
}: {
  id: string;
  onOpenTask: (taskId: string, type: 'media' | 'sns') => void;
}) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingDelivered, setMarkingDelivered] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);

    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('id, title, shipped_at, delivered_at, shooting_guideline')
      .eq('id', id)
      .maybeSingle();

    if (!campaignData) {
      setLoadError('案件が見つかりませんでした');
      setLoading(false);
      return;
    }

    const { data: variantLinks } = await supabase
      .from('campaign_variants')
      .select('variant_id')
      .eq('campaign_id', id);

    let products: ProductInfo[] = [];
    if (variantLinks && variantLinks.length > 0) {
      const { data: variantsData } = await supabase
        .from('variants')
        .select('title, sku, size, color, image_url, product_id')
        .in('id', variantLinks.map((v) => v.variant_id));
      const productIds = Array.from(new Set((variantsData ?? []).map((v) => v.product_id)));
      const { data: productsData } = await supabase
        .from('products')
        .select('id, title, brand, image_url')
        .in('id', productIds);
      const productById = new Map((productsData ?? []).map((p) => [p.id, p]));
      products = (variantsData ?? []).map((v) => ({
        title: productById.get(v.product_id)?.title ?? '商品名未設定',
        brand: productById.get(v.product_id)?.brand ?? null,
        imageUrl: v.image_url ?? productById.get(v.product_id)?.image_url ?? null,
        variantTitle: v.title,
        sku: v.sku,
        size: v.size,
        color: v.color,
      }));
    }

    setCampaign({
      id: campaignData.id,
      title: campaignData.title,
      shippedAt: campaignData.shipped_at,
      deliveredAt: campaignData.delivered_at,
      shootingGuideline: campaignData.shooting_guideline,
      products,
    });

    const { data: cyclesData } = await supabase
      .from('cycles')
      .select('id, cycle_no, label, tasks(id, type, due_date, status)')
      .eq('campaign_id', id)
      .order('cycle_no', { ascending: true });

    setCycles((cyclesData as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleMarkDelivered() {
    setMarkingDelivered(true);
    await supabase.rpc('mark_campaign_delivered', { p_campaign_id: id });
    await load();
    setMarkingDelivered(false);
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError || !campaign) {
    return (
      <View className="flex-1 px-6 pt-6">
        <ErrorBanner message={loadError ?? '案件が見つかりませんでした'} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title text-ink mb-4">{campaign.title}</Text>

      {campaign.products.map((p, index) => (
        <View
          key={index}
          className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row"
          style={{ gap: 12 }}
        >
          {p.imageUrl ? (
            <Image source={{ uri: p.imageUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} />
          ) : (
            <View
              style={{ width: 64, height: 64, borderRadius: 10 }}
              className="bg-line items-center justify-center"
            >
              <Text className="font-body text-tiny text-ink-soft">No Image</Text>
            </View>
          )}
          <View className="flex-1 justify-center">
            <Text className="font-body-medium text-body text-ink">
              {p.brand ? `${p.brand} ` : ''}
              {p.title}
            </Text>
            <Text className="font-body text-caption text-ink-soft">
              {variantLabel({ title: p.variantTitle, sku: p.sku, size: p.size, color: p.color })}
            </Text>
          </View>
        </View>
      ))}

      {campaign.shippedAt && !campaign.deliveredAt && (
        <View className="mt-2 mb-6">
          <AppButton
            label={markingDelivered ? '送信中…' : '受け取りました'}
            onPress={handleMarkDelivered}
            loading={markingDelivered}
          />
        </View>
      )}
      {campaign.deliveredAt && (
        <Text className="font-body text-caption text-ink-soft mb-6">受け取り確認済みです</Text>
      )}

      {campaign.shootingGuideline && (
        <View className="mb-6">
          <Text className="font-body-medium text-body text-ink mb-2">撮影ガイドライン</Text>
          <View className="bg-surface rounded-card border-hairline border-line px-4 py-3">
            <Text className="font-body text-body text-ink">{campaign.shootingGuideline}</Text>
          </View>
        </View>
      )}

      <Text className="font-body-medium text-body text-ink mb-3">回次一覧</Text>
      {cycles.map((cycle) => {
        const mediaTask = cycle.tasks.find((t) => t.type === 'media');
        const snsTask = cycle.tasks.find((t) => t.type === 'sns');
        return (
          <View
            key={cycle.id}
            className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
          >
            <Text className="font-body-medium text-body text-ink mb-2">{cycle.label}</Text>

            <View style={{ gap: 8 }}>
              {mediaTask && mediaTask.status !== 'cancelled' && (
                <Pressable
                  onPress={() => onOpenTask(mediaTask.id, 'media')}
                  className="flex-row items-center justify-between rounded-control border-hairline border-line bg-bg px-3 py-3"
                >
                  <View className="flex-row items-center flex-1" style={{ gap: 10 }}>
                    <View className="bg-accent/15 rounded-full items-center justify-center" style={{ width: 32, height: 32 }}>
                      <Ionicons name="image-outline" size={16} color="#4E5B54" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-body-medium text-body text-ink">データ提出</Text>
                      <Text className="font-body text-tiny text-ink-soft">
                        {formatDueDate(mediaTask.due_date)}まで
                      </Text>
                    </View>
                  </View>
                  <StatusPill
                    label={TASK_STATUS_LABEL[mediaTask.status]}
                    tone={taskStatusTone(mediaTask.status, mediaTask.due_date)}
                  />
                </Pressable>
              )}

              {snsTask && snsTask.status !== 'cancelled' && (
                <Pressable
                  onPress={() => onOpenTask(snsTask.id, 'sns')}
                  className="flex-row items-center justify-between rounded-control border-hairline border-line bg-bg px-3 py-3"
                >
                  <View className="flex-row items-center flex-1" style={{ gap: 10 }}>
                    <View className="bg-accent/15 rounded-full items-center justify-center" style={{ width: 32, height: 32 }}>
                      <Ionicons name="logo-instagram" size={16} color="#4E5B54" />
                    </View>
                    <View className="flex-1">
                      <Text className="font-body-medium text-body text-ink">Instagram投稿</Text>
                      <Text className="font-body text-tiny text-ink-soft">
                        {formatDueDate(snsTask.due_date)}まで
                      </Text>
                    </View>
                  </View>
                  <StatusPill
                    label={TASK_STATUS_LABEL[snsTask.status]}
                    tone={taskStatusTone(snsTask.status, snsTask.due_date)}
                  />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// 単独ルートとしてアクセスされた場合(通知からの直接遷移など)のフォールバック。
// monitor-homeの「あなたの案件」シートに埋め込まれる場合はCampaignDetailContentを直接使う。
export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <HeroScreen title="案件詳細" onBack={() => goBackOrReplace('/monitor-home')}>
      <CampaignDetailContent
        id={id}
        onOpenTask={(taskId, type) =>
          router.push({ pathname: type === 'media' ? '/submission-form' : '/sns-submission-form', params: { taskId } })
        }
      />
    </HeroScreen>
  );
}
