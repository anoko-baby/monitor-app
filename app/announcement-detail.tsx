import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorBanner } from '../components/ErrorBanner';
import { supabase } from '../lib/supabase';

type Announcement = {
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
  sentAt: string | null;
};

// モニター側お知らせ詳細(仕様書 v1.8 3.9)。開いた時点で既読(read_at)にする。
export default function AnnouncementDetail() {
  const { targetId } = useLocalSearchParams<{ targetId: string }>();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: target } = await supabase
        .from('announcement_targets')
        .select('read_at, announcements(title, body, link_label, link_url, sent_at)')
        .eq('id', targetId)
        .maybeSingle();

      const a = (target as any)?.announcements;
      if (!a) {
        setLoadError('お知らせが見つかりませんでした');
        setLoading(false);
        return;
      }

      setAnnouncement({
        title: a.title,
        body: a.body,
        linkLabel: a.link_label,
        linkUrl: a.link_url,
        sentAt: a.sent_at,
      });

      if (!target?.read_at) {
        await supabase.from('announcement_targets').update({ read_at: new Date().toISOString() }).eq('id', targetId);
      }

      setLoading(false);
    })();
  }, [targetId]);

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError || !announcement) {
    return (
      <View className="flex-1 bg-bg px-6 pt-6">
        <ErrorBanner message={loadError ?? 'お知らせが見つかりませんでした'} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      {announcement.sentAt && (
        <Text className="font-body text-caption text-ink-soft mb-2">{announcement.sentAt.slice(0, 10)}</Text>
      )}
      <Text className="font-heading text-title-lg text-ink mb-4">{announcement.title}</Text>
      <Text className="font-body text-body text-ink mb-6">{announcement.body}</Text>

      {announcement.linkUrl && (
        <Pressable
          onPress={() => Linking.openURL(announcement.linkUrl!)}
          className="bg-accent rounded-control py-3 items-center"
        >
          <Text className="font-body-medium text-body text-white">{announcement.linkLabel ?? '詳しく見る'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
