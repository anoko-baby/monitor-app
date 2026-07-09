import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { supabase } from '../lib/supabase';

type ProductInfo = { title: string; brand: string | null; sku: string | null; size: string | null; color: string | null };

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

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニター側 案件詳細(仕様書 v1.8 画面一覧5)。商品情報・撮影ガイドライン・回次一覧・到着確認ボタン。
export default function CampaignDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        .select('sku, size, color, product_id')
        .in('id', variantLinks.map((v) => v.variant_id));
      const productIds = Array.from(new Set((variantsData ?? []).map((v) => v.product_id)));
      const { data: productsData } = await supabase
        .from('products')
        .select('id, title, brand')
        .in('id', productIds);
      const productById = new Map((productsData ?? []).map((p) => [p.id, p]));
      products = (variantsData ?? []).map((v) => ({
        title: productById.get(v.product_id)?.title ?? '商品名未設定',
        brand: productById.get(v.product_id)?.brand ?? null,
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
  }, [id]);

  async function handleMarkDelivered() {
    setMarkingDelivered(true);
    await supabase.rpc('mark_campaign_delivered', { p_campaign_id: id });
    await load();
    setMarkingDelivered(false);
  }

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError || !campaign) {
    return (
      <View className="flex-1 bg-bg px-6 pt-6">
        <ErrorBanner message={loadError ?? '案件が見つかりませんでした'} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title-lg text-ink mb-4">{campaign.title}</Text>

      {campaign.products.map((p, index) => (
        <View key={index} className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2">
          <Text className="font-body-medium text-body text-ink">
            {p.brand ? `${p.brand} ` : ''}
            {p.title}
          </Text>
          <Text className="font-body text-caption text-ink-soft">
            {[p.sku, p.size, p.color].filter(Boolean).join(' / ') || 'SKU未設定'}
          </Text>
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

            {mediaTask && mediaTask.status !== 'cancelled' && (
              <Pressable
                onPress={() => router.push({ pathname: '/submission-form', params: { taskId: mediaTask.id } })}
                className="flex-row items-center justify-between mb-2"
              >
                <Text className="font-body text-body text-ink">
                  データ提出・{formatDueDate(mediaTask.due_date)}まで
                </Text>
                <Text className="font-body text-caption text-accent-ink">
                  {TASK_STATUS_LABEL[mediaTask.status]} ›
                </Text>
              </Pressable>
            )}

            {snsTask && snsTask.status !== 'cancelled' && (
              <Pressable
                onPress={() => router.push({ pathname: '/sns-submission-form', params: { taskId: snsTask.id } })}
                className="flex-row items-center justify-between"
              >
                <Text className="font-body text-body text-ink">
                  SNS投稿・{formatDueDate(snsTask.due_date)}まで
                </Text>
                <Text className="font-body text-caption text-accent-ink">
                  {TASK_STATUS_LABEL[snsTask.status]} ›
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
