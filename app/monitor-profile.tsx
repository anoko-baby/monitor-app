import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { BottomTabBar } from '../components/BottomTabBar';
import { ChildrenManager } from '../components/ChildrenManager';
import { ErrorBanner } from '../components/ErrorBanner';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { registerPushTokenForCurrentUser } from '../lib/push';
import { supabase } from '../lib/supabase';
import { monitorTabItems } from '../lib/tabItems';

type OwnProfile = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string | null;
  prefecture: string | null;
  phone: string | null;
  wifi_only_upload: boolean;
};

export default function MonitorProfile() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);

  async function loadUnreadAnnouncements() {
    const { count } = await supabase
      .from('announcement_targets')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    setUnreadAnnouncements(count ?? 0);
  }

  useEffect(() => {
    (async () => {
      setLoadError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadError('ログイン情報が確認できませんでした。もう一度ログインし直してください。');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, nickname, email, prefecture, phone, wifi_only_upload')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (error) {
        setLoadError(`プロフィールの取得に失敗しました: ${error.message}`);
        setLoading(false);
        return;
      }
      setProfile(data);

      if (Platform.OS !== 'web') {
        const permission = await Notifications.getPermissionsAsync();
        setNotifGranted(permission.status === 'granted');
        if (permission.status === 'granted') {
          await registerPushTokenForCurrentUser();
        }
      }

      setLoading(false);
    })();
    loadUnreadAnnouncements();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

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

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <View className="flex-1 px-6 pt-6">
          <Text className="font-heading text-title-lg text-ink mb-6">プロフィール</Text>
          {loadError && <ErrorBanner message={loadError} />}
        </View>
        <BottomTabBar items={monitorTabItems(unreadAnnouncements)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
        <View className="flex-row items-center justify-between mb-6">
          <Text className="font-heading text-title-lg text-ink">プロフィール</Text>
          <Pressable onPress={handleSignOut}>
            <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
          </Pressable>
        </View>

        {loadError && <ErrorBanner message={loadError} />}

        <TextField label="氏名" value={profile.name ?? ''} editable={false} />
        <TextField label="都道府県" value={profile.prefecture ?? ''} editable={false} />
        <TextField label="電話番号" value={profile.phone ?? ''} editable={false} />
        <TextField
          label="ニックネーム"
          value={profile.nickname ?? ''}
          onChangeText={(text) => setProfile({ ...profile, nickname: text })}
        />
        <TextField label="メールアドレス" value={profile.email ?? ''} editable={false} />

        {Platform.OS !== 'web' && (
          <>
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
          </>
        )}

        <AppButton label={saving ? '保存中…' : '保存する'} onPress={handleSave} loading={saving} />
        {saved && (
          <Text className="font-body text-caption text-accent-ink mt-2 text-center">保存しました</Text>
        )}

        <View className="mt-8">
          <ChildrenManager monitorId={profile.id} />
        </View>
      </ScrollView>
      </View>

      <BottomTabBar items={monitorTabItems(unreadAnnouncements)} />
    </Screen>
  );
}
