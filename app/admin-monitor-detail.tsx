import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, Text, View } from 'react-native';

import { AchievementSection } from '../components/AchievementSection';
import { AppButton } from '../components/AppButton';
import { ChildrenManager } from '../components/ChildrenManager';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

type MonitorProfile = {
  id: string;
  name: string;
  nickname: string | null;
  consent_ec: boolean;
  consent_sns: boolean;
  consent_ad: boolean;
};

export default function AdminMonitorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<MonitorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, nickname, consent_ec, consent_sns, consent_ad')
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
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <TextField
        label="氏名"
        value={profile.name}
        onChangeText={(text) => setProfile({ ...profile, name: text })}
      />
      <TextField
        label="ニックネーム"
        value={profile.nickname ?? ''}
        onChangeText={(text) => setProfile({ ...profile, nickname: text })}
      />

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
