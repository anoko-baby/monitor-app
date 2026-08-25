import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { supabase } from '../lib/supabase';

type AnnouncementRow = {
  targetId: string;
  title: string;
  sentAt: string | null;
  isUnread: boolean;
};

// モニター側お知らせ一覧(仕様書 v1.8 3.9)。未読バッジ表示。
export default function Announcements() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('announcement_targets')
      .select('id, read_at, announcements(title, sent_at)')
      .order('created_at', { ascending: false });

    setRows(
      (data ?? []).map((t: any) => ({
        targetId: t.id,
        title: t.announcements?.title ?? '(削除されたお知らせ)',
        sentAt: t.announcements?.sent_at ?? null,
        isUnread: !t.read_at,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen className="px-6 pt-6">
      <Text className="font-heading text-title-lg text-ink mb-6">お知らせ</Text>

      {loading ? (
        <ActivityIndicator color="#7E8F86" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.targetId}
          ListEmptyComponent={
            <Text className="font-body text-caption text-ink-soft">お知らせはまだありません</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/announcement-detail', params: { targetId: item.targetId } })}
              className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row items-center justify-between"
            >
              <View className="flex-1 pr-2">
                <Text
                  className={`font-body-medium text-body ${item.isUnread ? 'text-ink' : 'text-ink-soft'}`}
                >
                  {item.title}
                </Text>
                {item.sentAt && (
                  <Text className="font-body text-caption text-ink-soft mt-1">{item.sentAt.slice(0, 10)}</Text>
                )}
              </View>
              {item.isUnread && <View className="w-2 h-2 rounded-full bg-status-overdue" />}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
