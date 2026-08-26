import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { invokeEdgeFunction, supabase } from '../lib/supabase';

export default function Register() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [name, setName] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !prefecture.trim() || !phone.trim()) {
      setError('氏名・都道府県・電話番号を入力してください');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }
    setLoading(true);
    setError(null);

    const { errorMessage } = await invokeEdgeFunction('invite-register', {
      body: { code, email, password, name: name.trim(), prefecture: prefecture.trim(), phone: phone.trim() },
    });

    if (errorMessage) {
      setLoading(false);
      setError(errorMessage);
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
      <Text className="font-heading text-title-lg text-ink mb-2">本登録</Text>
      <Text className="font-body text-body text-ink-soft mb-8">
        今後このメールアドレスとパスワードでログインします。
      </Text>

      <TextField label="氏名" value={name} onChangeText={setName} />
      <TextField label="都道府県" value={prefecture} onChangeText={setPrefecture} placeholder="広島県" />
      <TextField
        label="電話番号"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="09012345678"
      />
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
        disabled={!name || !prefecture || !phone || !email || !password}
        loading={loading}
      />
    </View>
  );
}
