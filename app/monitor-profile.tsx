import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Avatar } from '../components/Avatar';
import { BottomTabBar } from '../components/BottomTabBar';
import { ChildrenManager } from '../components/ChildrenManager';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { TextField } from '../components/TextField';
import { monitorDisplayName } from '../lib/campaigns';
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
  instagram_handle: string | null;
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
  const [activeTab, setActiveTab] = useState<'info' | 'children'>('info');

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
        .select('id, name, nickname, email, prefecture, phone, instagram_handle, wifi_only_upload')
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
      <View className="flex-1 bg-bg px-6 pt-6">
        {loadError && <ErrorBanner message={loadError} />}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <HeroScreen
        title="プロフィール"
        subtitle={profile.instagram_handle ? `@${profile.instagram_handle}` : undefined}
        headerExtra={
          <View className="flex-row items-center mt-4" style={{ gap: 12 }}>
            <Avatar label={monitorDisplayName({ name: profile.name, instagramHandle: profile.instagram_handle })} />
            <Text className="font-body-medium text-body text-white">
              {monitorDisplayName({ name: profile.name, instagramHandle: profile.instagram_handle })}
            </Text>
          </View>
        }
        tabs={[
          { key: 'info', label: 'プロフィール情報', icon: 'person-outline', activeIcon: 'person' },
          { key: 'children', label: '子ども情報', icon: 'people-outline', activeIcon: 'people' },
        ]}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as 'info' | 'children')}
      >
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
          {loadError && <ErrorBanner message={loadError} />}

          {activeTab === 'info' ? (
            <>
              <TextField label="氏名" value={profile.name ?? ''} editable={false} />
              <TextField
                label="Instagramアカウント名"
                value={profile.instagram_handle ? `@${profile.instagram_handle}` : ''}
                editable={false}
              />
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

              <Pressable onPress={handleSignOut} className="items-center mt-10 py-2">
                <Text className="font-body text-caption text-ink-soft">ログアウト</Text>
              </Pressable>
            </>
          ) : (
            <ChildrenManager monitorId={profile.id} />
          )}
        </ScrollView>
      </HeroScreen>

      <BottomTabBar items={monitorTabItems(unreadAnnouncements)} />
    </View>
  );
}
