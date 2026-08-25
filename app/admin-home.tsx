import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { HeroProfileBadge } from '../components/HeroProfileBadge';
import { HeroScreen } from '../components/HeroScreen';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';
import { AdminCouponOrdersContent } from './admin-coupon-orders';
import { AdminProductSearchContent } from './admin-product-search';
import { AdminWatchedCouponsContent } from './admin-watched-coupons';

type ToolKey = 'productSearch' | 'watchedCoupons' | 'couponOrders';

const LINKS: { label: string; key: ToolKey | 'invite' }[] = [
  { label: 'モニターを招待する', key: 'invite' },
  { label: '商品検索(Shopify)', key: 'productSearch' },
  { label: '監視クーポン登録', key: 'watchedCoupons' },
  { label: 'クーポン注文', key: 'couponOrders' },
];

type SheetView = { type: 'menu' } | { type: 'tool'; key: ToolKey };

// 管理者ホーム(仕様書 v1.8 画面一覧2)。実機フィードバックにより、メニューから開くツール群も
// ヘッダー/フッタータブを固定したままシート本体だけ差し替えるマスター・ディテール方式にした。
// 「モニターを招待する」はadmin-monitor-list側に主要導線があるため、ここでは単独ルートへ遷移する。
export default function AdminHome() {
  const [view, setView] = useState<SheetView>({ type: 'menu' });

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <View className="flex-1">
      <HeroScreen
        title="ホーム"
        subtitle={view.type === 'menu' ? 'anoko monitor 管理画面' : undefined}
        headerExtra={<HeroProfileBadge />}
        onBack={view.type === 'tool' ? () => setView({ type: 'menu' }) : undefined}
      >
        {view.type === 'menu' ? (
          <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
            <Text className="font-body-medium text-caption text-ink-soft mb-2">その他のメニュー</Text>
            {LINKS.map((link) => (
              <Pressable
                key={link.key}
                onPress={() =>
                  link.key === 'invite' ? router.push('/admin-invite-issue') : setView({ type: 'tool', key: link.key })
                }
                className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
              >
                <Text className="font-body text-body text-ink">{link.label}</Text>
              </Pressable>
            ))}

            <Pressable onPress={handleSignOut} className="items-center mt-10 py-2">
              <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <>
            {view.key === 'productSearch' && <AdminProductSearchContent />}
            {view.key === 'watchedCoupons' && <AdminWatchedCouponsContent />}
            {view.key === 'couponOrders' && <AdminCouponOrdersContent />}
          </>
        )}
      </HeroScreen>

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </View>
  );
}
