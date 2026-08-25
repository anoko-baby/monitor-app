import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

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
    <Screen>
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="flex-row items-center justify-between mb-8">
          <Text className="font-heading text-title-lg text-ink">ホーム</Text>
          <Pressable onPress={handleSignOut}>
            <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
          </Pressable>
        </View>

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
      </ScrollView>

      <BottomTabBar
        items={[
          { label: 'ホーム', href: '/admin-home' },
          { label: '案件一覧', href: '/admin-campaign-list' },
          { label: '全提出一覧', href: '/admin-submission-list' },
          { label: 'モニター一覧', href: '/admin-monitor-list' },
          { label: 'お知らせ配信', href: '/admin-announcement-list' },
        ]}
      />
    </Screen>
  );
}
