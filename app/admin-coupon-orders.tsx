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
      .select('id, order_no, ordered_at, coupon_code, customer_name, monitor_id, status')
      .order('ordered_at', { ascending: false });
    setOrders(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function markSkipped(id: string) {
    await supabase.from('coupon_orders').update({ status: 'skipped' }).eq('id', id);
    loadOrders();
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
              <Pressable onPress={() => markSkipped(item.id)}>
                <Text className="font-body text-caption text-status-overdue">対象外にする</Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </View>
  );
}
