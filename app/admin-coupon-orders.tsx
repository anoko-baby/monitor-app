import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { monitorDisplayName } from '../lib/campaigns';
import { goBackOrReplace } from '../lib/navigation';
import { supabase } from '../lib/supabase';

type CouponOrder = {
  id: string;
  order_no: string;
  ordered_at: string;
  coupon_code: string;
  customer_name: string | null;
  monitor_id: string | null;
  monitor_name: string | null;
  line_items: unknown;
  status: 'pending' | 'converted' | 'skipped';
};

const STATUS_LABEL: Record<CouponOrder['status'], string> = {
  pending: '未対応',
  converted: '案件化済み',
  skipped: '対象外',
};

// クーポン注文タブの本体(仕様書 v1.8 3.12)。単独ルートでもadmin-homeのシート内埋め込みでも使う
// 共通コンポーネント。「案件化する」は案件一覧セクション(admin-campaign-form)への遷移になるため、
// このシート埋め込みの中でも通常のrouter.pushのまま(ヘッダーが変わるのは意図通り)。
export function AdminCouponOrdersContent() {
  const [orders, setOrders] = useState<CouponOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('coupon_orders')
      .select(
        'id, order_no, ordered_at, coupon_code, customer_name, monitor_id, line_items, status, monitor:profiles(name, instagram_handle)'
      )
      .order('ordered_at', { ascending: false });
    if (error) setLoadError(`クーポン注文一覧の取得に失敗しました: ${error.message}`);
    setOrders(
      (data ?? []).map((o: any) => ({
        id: o.id,
        order_no: o.order_no,
        ordered_at: o.ordered_at,
        coupon_code: o.coupon_code,
        customer_name: o.customer_name,
        monitor_id: o.monitor_id,
        monitor_name: o.monitor ? monitorDisplayName({ name: o.monitor.name, instagramHandle: o.monitor.instagram_handle }) : null,
        line_items: o.line_items,
        status: o.status,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function markSkipped(id: string) {
    await supabase.from('coupon_orders').update({ status: 'skipped' }).eq('id', id);
    loadOrders();
  }

  function handleConvert(order: CouponOrder) {
    router.push({
      pathname: '/admin-campaign-form',
      params: {
        sourceOrderId: order.id,
        monitorId: order.monitor_id ?? undefined,
        monitorName: order.monitor_name ?? undefined,
        shipmentOrderNo: order.order_no,
        shippedAt: order.ordered_at.slice(0, 10),
        lineItems: JSON.stringify(order.line_items ?? []),
      },
    });
  }

  return (
    <View className="flex-1 px-6 pt-6">
      <Text className="font-heading text-title text-ink mb-4">クーポン注文</Text>
      {loadError && <ErrorBanner message={loadError} />}
      {loading && <Text className="font-body text-caption text-ink-soft">読み込み中…</Text>}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <Text className="font-body text-caption text-ink-soft">
              まだクーポン注文がありません
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="font-body text-body text-ink">{item.order_no}</Text>
              <Text className="font-body text-caption text-ink-soft">
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <Text className="font-body text-caption text-ink-soft mb-1">
              {item.customer_name ?? '(顧客名不明)'} ・ {item.coupon_code}
              {item.monitor_id ? ' ・ 紐付け済み' : ' ・ 未紐付け'}
            </Text>
            {item.status === 'pending' && (
              <View className="flex-row items-center mt-1" style={{ gap: 16 }}>
                <Pressable onPress={() => handleConvert(item)}>
                  <Text className="font-body-medium text-caption text-accent-ink">案件化する</Text>
                </Pressable>
                <Pressable onPress={() => markSkipped(item.id)}>
                  <Text className="font-body text-caption text-status-overdue">対象外にする</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

// 単独ルートとしてアクセスされた場合のフォールバック。admin-homeのシートに埋め込まれる場合は
// AdminCouponOrdersContentを直接使う。
export default function AdminCouponOrders() {
  return (
    <HeroScreen title="クーポン注文" onBack={() => goBackOrReplace('/admin-home')}>
      <AdminCouponOrdersContent />
    </HeroScreen>
  );
}
