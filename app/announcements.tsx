import { Ionicons } from '@expo/vector-icons';
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
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E7E1D6' }} />}
          ListEmptyComponent={
            <Text className="font-body text-caption text-ink-soft">お知らせはまだありません</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/announcement-detail', params: { targetId: item.targetId } })}
              className="flex-row items-center py-3"
              style={{ gap: 12 }}
            >
              <View className="bg-accent/15 rounded-full items-center justify-center" style={{ width: 40, height: 40 }}>
                <Ionicons name="megaphone-outline" size={18} color="#4E5B54" />
              </View>
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
