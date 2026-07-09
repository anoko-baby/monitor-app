import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ChildrenManager } from '../components/ChildrenManager';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

type OwnProfile = {
  id: string;
  name: string;
  nickname: string | null;
  email: string | null;
  wifi_only_upload: boolean;
};

export default function MonitorProfile() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, name, nickname, email, wifi_only_upload')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setProfile(data);

      const permission = await Notifications.getPermissionsAsync();
      setNotifGranted(permission.status === 'granted');

      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setSaved(false);
    await supabase
      .from('profiles')
      .update({
        nickname: profile.nickname,
        wifi_only_upload: profile.wifi_only_upload,
      })
      .eq('id', profile.id);
    setSaving(false);
    setSaved(true);
  }

  if (loading || !profile) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <TextField label="氏名" value={profile.name} editable={false} />
      <TextField
        label="ニックネーム"
        value={profile.nickname ?? ''}
        onChangeText={(text) => setProfile({ ...profile, nickname: text })}
      />
      <TextField label="メールアドレス" value={profile.email ?? ''} editable={false} />

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">通知</Text>
      {notifGranted === false && (
        <ErrorBanner message="通知が許可されていません。設定アプリから通知を有効にしてください。" />
      )}
      {notifGranted === true && (
        <Text className="font-body text-caption text-ink-soft mb-4">通知は許可されています</Text>
      )}

      <View className="flex-row items-center justify-between mb-6">
        <Text className="font-body text-body text-ink flex-1 pr-4">Wi-Fi接続時のみアップロード</Text>
        <Switch
          value={profile.wifi_only_upload}
          onValueChange={(v) => setProfile({ ...profile, wifi_only_upload: v })}
        />
      </View>

      <AppButton label={saving ? '保存中…' : '保存する'} onPress={handleSave} loading={saving} />
      {saved && (
        <Text className="font-body text-caption text-accent-ink mt-2 text-center">保存しました</Text>
      )}

      <View className="mt-8">
        <ChildrenManager monitorId={profile.id} />
      </View>
    </ScrollView>
  );
}
