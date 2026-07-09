import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) setChecking(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, tos_agreed_at')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!active) return;

      if (!profile) {
        setChecking(false);
        return;
      }

      if (profile.role === 'admin' || profile.role === 'staff') {
        router.replace('/admin-home');
      } else if (!profile.tos_agreed_at) {
        router.replace('/consent');
      } else {
        router.replace('/monitor-home');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </Screen>
    );
  }

  return (
    <Screen className="px-6 justify-center">
      <Text className="font-heading text-title-lg text-ink mb-2">anoko monitor</Text>
      <Text className="font-body text-body text-ink-soft mb-12">モニター管理アプリ</Text>

      <View className="mb-3">
        <AppButton label="モニターの方はこちら" onPress={() => router.push('/invite-code')} />
      </View>
      <AppButton
        label="スタッフ・管理者の方はこちら"
        variant="secondary"
        onPress={() => router.push('/admin-login')}
      />
    </Screen>
  );
}
