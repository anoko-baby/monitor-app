import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';

export default function InviteCode() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleNext() {
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(trimmed)) {
      setError('8桁の英数字で入力してください');
      return;
    }
    setError(null);
    router.push({ pathname: '/register', params: { code: trimmed } });
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-2">招待コードを入力してください</Text>
      <Text className="font-body text-body text-ink-soft mb-8">
        スタッフから届いた8桁の招待コードを入力してください。
      </Text>

      <View className="mb-4">
        <TextField
          label="招待コード"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          placeholder="A1B2C3D4"
          style={{ textAlign: 'center', letterSpacing: 4 }}
        />
      </View>

      {error && <ErrorBanner message={error} />}

      <AppButton label="次へ" onPress={handleNext} disabled={code.length !== 8} />
    </View>
  );
}
