import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';

import { AchievementSection } from '../components/AchievementSection';
import { AppButton } from '../components/AppButton';
import { ChildrenManager } from '../components/ChildrenManager';
import { HeroScreen } from '../components/HeroScreen';
import { PrefecturePicker } from '../components/PrefecturePicker';
import { TextField } from '../components/TextField';
import { profileDisplayName } from '../lib/campaigns';
import { goBackOrReplace } from '../lib/navigation';
import { supabase } from '../lib/supabase';

type MonitorProfile = {
  id: string;
  name: string | null;
  nickname: string | null;
  instagram_handle: string | null;
  prefecture: string | null;
  phone: string | null;
  email: string | null;
  consent_ec: boolean;
  consent_sns: boolean;
  consent_ad: boolean;
};

// モニター詳細の本体。単独ルートでもadmin-monitor-listのシート内埋め込みでも使う共通コンポーネント。
export function AdminMonitorDetailContent({ id }: { id: string }) {
  const [profile, setProfile] = useState<MonitorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, nickname, instagram_handle, prefecture, phone, email, consent_ec, consent_sns, consent_ad')
        .eq('id', id)
        .maybeSingle();
      setProfile(data);
      setLoading(false);
    })();
  }, [id]);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    await supabase
      .from('profiles')
      .update({
        name: profile.name,
        nickname: profile.nickname,
        instagram_handle: profile.instagram_handle,
        prefecture: profile.prefecture,
        phone: profile.phone,
        consent_ec: profile.consent_ec,
        consent_sns: profile.consent_sns,
        consent_ad: profile.consent_ad,
      })
      .eq('id', profile.id);
    setSaving(false);
    setSaved(true);
  }

  if (loading || !profile) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title text-ink mb-4">
        {profileDisplayName({ name: profile.name, nickname: profile.nickname, instagramHandle: profile.instagram_handle })}
      </Text>
      <TextField
        label="Instagramアカウント名"
        value={profile.instagram_handle ?? ''}
        onChangeText={(text) => setProfile({ ...profile, instagram_handle: text })}
        autoCapitalize="none"
      />
      <TextField
        label="氏名"
        value={profile.name ?? ''}
        onChangeText={(text) => setProfile({ ...profile, name: text })}
        placeholder={profile.name === null ? '(本登録前)' : undefined}
      />
      <TextField
        label="ニックネーム"
        value={profile.nickname ?? ''}
        onChangeText={(text) => setProfile({ ...profile, nickname: text })}
      />
      <PrefecturePicker
        label="都道府県"
        value={profile.prefecture ?? ''}
        onChange={(text) => setProfile({ ...profile, prefecture: text })}
      />
      <TextField
        label="電話番号"
        value={profile.phone ?? ''}
        onChangeText={(text) => setProfile({ ...profile, phone: text })}
        keyboardType="phone-pad"
      />
      <TextField label="メールアドレス" value={profile.email ?? ''} editable={false} />

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">掲載許諾</Text>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-body text-body text-ink">EC掲載</Text>
        <Switch
          value={profile.consent_ec}
          onValueChange={(v) => setProfile({ ...profile, consent_ec: v })}
        />
      </View>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="font-body text-body text-ink">SNS掲載</Text>
        <Switch
          value={profile.consent_sns}
          onValueChange={(v) => setProfile({ ...profile, consent_sns: v })}
        />
      </View>
      <View className="flex-row items-center justify-between mb-6">
        <Text className="font-body text-body text-ink">広告利用</Text>
        <Switch
          value={profile.consent_ad}
          onValueChange={(v) => setProfile({ ...profile, consent_ad: v })}
        />
      </View>

      <AppButton label={saving ? '保存中…' : '保存する'} onPress={handleSave} loading={saving} />
      {saved && (
        <Text className="font-body text-caption text-accent-ink mt-2 text-center">保存しました</Text>
      )}

      <View className="mt-8 mb-8">
        <ChildrenManager monitorId={profile.id} />
      </View>

      <AchievementSection monitorId={profile.id} />
    </ScrollView>
  );
}

// 単独ルートとしてアクセスされた場合のフォールバック。admin-monitor-listのシートに埋め込まれる
// 場合はAdminMonitorDetailContentを直接使う。
export default function AdminMonitorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <HeroScreen title="モニター詳細" onBack={() => goBackOrReplace('/admin-monitor-list')}>
      <AdminMonitorDetailContent id={id} />
    </HeroScreen>
  );
}
