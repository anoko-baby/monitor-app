import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { PrefecturePicker } from '../components/PrefecturePicker';
import { TextField } from '../components/TextField';
import { invokeEdgeFunction, supabase } from '../lib/supabase';

export default function Register() {
  const { code, instagramHandle } = useLocalSearchParams<{ code: string; instagramHandle?: string }>();
  const [name, setName] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !prefecture.trim() || !phone.trim() || !email.trim()) {
      setError('氏名・都道府県・電話番号・メールアドレスを入力してください');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return;
    }
    if (password !== passwordConfirm) {
      setError('パスワードが一致しません。確認用のパスワードをご確認ください');
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

      {!!instagramHandle && (
        <TextField label="Instagramアカウント名(招待時の登録内容・変更不可)" value={`@${instagramHandle}`} editable={false} />
      )}

      <TextField label="氏名" required value={name} onChangeText={setName} />
      <PrefecturePicker label="都道府県" required value={prefecture} onChange={setPrefecture} />
      <TextField
        label="電話番号"
        required
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="09012345678"
      />
      <TextField
        label="メールアドレス"
        required
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField
        label="パスワード(8文字以上)"
        required
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <View className="mb-6">
        <TextField
          label="パスワード(確認用)"
          required
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry
        />
      </View>

      {error && <ErrorBanner message={error} />}

      <AppButton
        label={loading ? '登録中…' : '登録する'}
        onPress={handleRegister}
        disabled={!name || !prefecture || !phone || !email || !password || !passwordConfirm}
        loading={loading}
      />
    </View>
  );
}
