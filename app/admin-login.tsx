import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (signInError) {
      setError('メールアドレスまたはパスワードが正しくありません');
      return;
    }

    router.replace('/admin-home');
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-8">ログイン</Text>

      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <View className="mb-6">
        <TextField label="パスワード" value={password} onChangeText={setPassword} secureTextEntry />
      </View>

      {error && <ErrorBanner message={error} />}

      <AppButton
        label={loading ? 'ログイン中…' : 'ログインする'}
        onPress={handleLogin}
        disabled={!email || !password}
        loading={loading}
      />
    </View>
  );
}
