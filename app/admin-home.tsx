import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { HeroProfileBadge } from '../components/HeroProfileBadge';
import { HeroScreen } from '../components/HeroScreen';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';

const LINKS: {
  label: string;
  href: '/admin-invite-issue' | '/admin-product-search' | '/admin-watched-coupons' | '/admin-coupon-orders';
}[] = [
  { label: 'モニターを招待する', href: '/admin-invite-issue' },
  { label: '商品検索(Shopify)', href: '/admin-product-search' },
  { label: '監視クーポン登録', href: '/admin-watched-coupons' },
  { label: 'クーポン注文', href: '/admin-coupon-orders' },
];

export default function AdminHome() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <View className="flex-1">
      <HeroScreen title="ホーム" subtitle="anoko monitor 管理画面" headerExtra={<HeroProfileBadge />}>
        <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text className="font-body-medium text-caption text-ink-soft mb-2">その他のメニュー</Text>
          {LINKS.map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href)}
              className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
            >
              <Text className="font-body text-body text-ink">{link.label}</Text>
            </Pressable>
          ))}

          <Pressable onPress={handleSignOut} className="items-center mt-10 py-2">
            <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
          </Pressable>
        </ScrollView>
      </HeroScreen>

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </View>
  );
}
