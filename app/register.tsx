import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

export default function Register() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke('invite-register', {
      body: { code, email, password },
    });

    if (fnError || data?.error) {
      setLoading(false);
      setError(data?.error ?? '登録に失敗しました。招待コードをご確認ください。');
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (signInError) {
      setError('登録は完了しましたが、ログインに失敗しました。もう一度お試しください。');
      return;
    }

    router.replace('/consent');
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-2">メールアドレスを登録してください</Text>
      <Text className="font-body text-body text-ink-soft mb-8">
        今後このメールアドレスとパスワードでログインします。
      </Text>

      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View className="mb-6">
        <TextField
          label="パスワード(8文字以上)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      {error && <ErrorBanner message={error} />}

      <AppButton
        label={loading ? '登録中…' : '登録する'}
        onPress={handleRegister}
        disabled={!email || !password}
        loading={loading}
      />
    </View>
  );
}
