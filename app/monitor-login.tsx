import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

// モニターの再ログイン画面。招待コード登録は初回のみで、以後はここからメール/パスワードでログインする
// (ブラウザのセッションが切れた場合や機種変更時に必要。今まで導線が無かった不具合の修正)。
export default function MonitorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.user) {
      setLoading(false);
      setError('メールアドレスまたはパスワードが正しくありません');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, tos_agreed_at')
      .eq('auth_user_id', signInData.user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'monitor') {
      await supabase.auth.signOut();
      setLoading(false);
      setError('モニターアカウントが見つかりませんでした');
      return;
    }

    setLoading(false);
    router.replace(profile.tos_agreed_at ? '/monitor-home' : '/consent');
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
