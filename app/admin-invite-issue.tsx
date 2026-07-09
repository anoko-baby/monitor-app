import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I等紛らわしい文字は除外
const INVITE_EXPIRY_DAYS = 14;

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return code;
}

export default function AdminInviteIssue() {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleIssue() {
    setLoading(true);
    setError(null);

    // 3.1.1: 仮登録は氏名・ニックネームのみ(メールはモニター本人が本登録時に設定)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({ role: 'monitor', name, nickname: nickname || null, status: 'invited' })
      .select('id')
      .single();

    if (profileError || !profile) {
      setLoading(false);
      setError('モニターの仮登録に失敗しました');
      return;
    }

    const code = generateInviteCode();
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: codeError } = await supabase
      .from('invite_codes')
      .insert({ monitor_id: profile.id, code, expires_at: expiresAt });

    setLoading(false);

    if (codeError) {
      setError('招待コードの発行に失敗しました');
      return;
    }

    setIssuedCode(code);
  }

  if (issuedCode) {
    return (
      <View className="flex-1 bg-bg px-6 pt-6 items-center">
        <Text className="font-heading text-title-lg text-ink mb-6">招待コードを発行しました</Text>
        <View className="bg-surface rounded-card border-hairline border-line px-8 py-6 mb-6">
          <Text className="font-body text-title-lg text-ink" style={{ letterSpacing: 6 }}>
            {issuedCode}
          </Text>
        </View>
        <Text className="font-body text-caption text-ink-soft text-center">
          このコードをLINE等でモニターに送付してください(有効期限{INVITE_EXPIRY_DAYS}日)
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <TextField label="氏名" value={name} onChangeText={setName} />
      <TextField label="ニックネーム" value={nickname} onChangeText={setNickname} />

      {error && <ErrorBanner message={error} />}

      <AppButton
        label={loading ? '発行中…' : '招待コードを発行する'}
        onPress={handleIssue}
        disabled={!name}
        loading={loading}
      />
    </View>
  );
}
