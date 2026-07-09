import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

// 案件一覧・全提出一覧はM5/M7で作る。M2時点では招待発行への入口のみのスタブ。
export default function AdminHome() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <Screen className="px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-8">ホーム</Text>

      <View className="mb-4">
        <AppButton label="モニターを招待する" onPress={() => router.push('/admin-invite-issue')} />
      </View>

      <Pressable onPress={handleSignOut} className="items-center">
        <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
      </Pressable>
    </Screen>
  );
}
