import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

// Home画面はM6で作る。M3時点では登録完了確認+プロフィールへの入口のみのスタブ。
export default function Welcome() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <Screen className="items-center justify-center px-6">
      <Text className="font-heading text-title-lg text-ink mb-2">登録が完了しました</Text>
      <Text className="font-body text-body text-ink-soft mb-8 text-center">
        案件の一覧はまだありません。準備が整いましたらお知らせします。
      </Text>

      <View className="w-full mb-4">
        <AppButton
          label="プロフィールを編集する"
          variant="secondary"
          onPress={() => router.push('/monitor-profile')}
        />
      </View>

      <Pressable onPress={handleSignOut}>
        <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
      </Pressable>
    </Screen>
  );
}
