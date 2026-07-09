import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

const LINKS: { label: string; href: '/admin-invite-issue' | '/admin-product-search' | '/admin-watched-coupons' | '/admin-coupon-orders' }[] = [
  { label: 'モニターを招待する', href: '/admin-invite-issue' },
  { label: '商品検索(Shopify)', href: '/admin-product-search' },
  { label: '監視クーポン登録', href: '/admin-watched-coupons' },
  { label: 'クーポン注文', href: '/admin-coupon-orders' },
];

// 案件一覧・全提出一覧はM5/M7で作る。M4時点ではモニター管理・Shopify連携への入口のみのスタブ。
export default function AdminHome() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <Screen className="px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-8">ホーム</Text>

      <View className="mb-6">
        <AppButton label="モニター一覧" onPress={() => router.push('/admin-monitor-list')} />
      </View>

      {LINKS.map((link) => (
        <Pressable
          key={link.href}
          onPress={() => router.push(link.href)}
          className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
        >
          <Text className="font-body text-body text-ink">{link.label}</Text>
        </Pressable>
      ))}

      <Pressable onPress={handleSignOut} className="items-center mt-6">
        <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
      </Pressable>
    </Screen>
  );
}
