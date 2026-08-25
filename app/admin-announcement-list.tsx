import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { BottomTabBar } from '../components/BottomTabBar';
import { ErrorBanner } from '../components/ErrorBanner';
import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';

type AnnouncementRow = {
  id: string;
  title: string;
  sentAt: string | null;
  targetCount: number;
};

// お知らせ配信の履歴一覧(仕様書 v1.8 3.9)。作成と同時に配信されるため、下書き状態は無い。
export default function AdminAnnouncementList() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data: announcements, error } = await supabase
      .from('announcements')
      .select('id, title, sent_at')
      .order('created_at', { ascending: false });
    if (error) setLoadError(`お知らせ一覧の取得に失敗しました: ${error.message}`);

    const ids = (announcements ?? []).map((a) => a.id);
    const { data: targets } = ids.length
      ? await supabase.from('announcement_targets').select('announcement_id').in('announcement_id', ids)
      : { data: [] as { announcement_id: string }[] };

    const countByAnnouncement = new Map<string, number>();
    for (const t of targets ?? []) {
      countByAnnouncement.set(t.announcement_id, (countByAnnouncement.get(t.announcement_id) ?? 0) + 1);
    }

    setRows(
      (announcements ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        sentAt: a.sent_at,
        targetCount: countByAnnouncement.get(a.id) ?? 0,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
      <View className="mb-4">
        <AppButton label="お知らせを作成・配信する" onPress={() => router.push('/admin-announcement-form')} />
      </View>

      {loadError && <ErrorBanner message={loadError} />}

      {loading ? (
        <ActivityIndicator color="#7E8F86" />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E7E1D6' }} />}
          ListEmptyComponent={
            <Text className="font-body text-caption text-ink-soft">まだ配信したお知らせはありません</Text>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center py-3" style={{ gap: 12 }}>
              <View className="bg-accent/15 rounded-full items-center justify-center" style={{ width: 40, height: 40 }}>
                <Ionicons name="megaphone-outline" size={18} color="#4E5B54" />
              </View>
              <View className="flex-1">
                <Text className="font-body-medium text-body text-ink mb-1">{item.title}</Text>
                <Text className="font-body text-caption text-ink-soft">
                  {item.sentAt ? item.sentAt.slice(0, 10) : '未配信'} ・ 対象 {item.targetCount}名
                </Text>
              </View>
            </View>
          )}
        />
      )}
      </View>

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </Screen>
  );
}
