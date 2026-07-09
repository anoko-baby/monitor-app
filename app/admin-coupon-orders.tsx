import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

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

// クーポン注文タブ(仕様書 v1.8 3.12)。「案件化する」ボタンはM5(案件作成画面)で接続する。
export default function AdminCouponOrders() {
  const [orders, setOrders] = useState<CouponOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOrders() {
    setLoading(true);
    const { data } = await supabase
      .from('coupon_orders')
      .select('id, order_no, ordered_at, coupon_code, customer_name, monitor_id, line_items, status, monitor:profiles(name)')
      .order('ordered_at', { ascending: false });
    setOrders(
      (data ?? []).map((o: any) => ({
        id: o.id,
        order_no: o.order_no,
        ordered_at: o.ordered_at,
        coupon_code: o.coupon_code,
        customer_name: o.customer_name,
        monitor_id: o.monitor_id,
        monitor_name: o.monitor?.name ?? null,
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
    <View className="flex-1 bg-bg px-6 pt-6">
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
