import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { goBackOrReplace } from '../lib/navigation';
import { supabase } from '../lib/supabase';

type Announcement = {
  title: string;
  body: string;
  linkLabel: string | null;
  linkUrl: string | null;
  sentAt: string | null;
};

// モニター側お知らせ詳細の本体(仕様書 v1.8 3.9)。開いた時点で既読(read_at)にする。
// 単独ルートでもannouncements.tsxの「お知らせ」シート内埋め込みでも使う共通コンポーネント。
export function AnnouncementDetailContent({ targetId }: { targetId: string }) {
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
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError || !announcement) {
    return (
      <View className="flex-1 px-6 pt-6">
        <ErrorBanner message={loadError ?? 'お知らせが見つかりませんでした'} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title text-ink mb-1">{announcement.title}</Text>
      {announcement.sentAt && (
        <Text className="font-body text-caption text-ink-soft mb-4">{announcement.sentAt.slice(0, 10)}</Text>
      )}
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

// 単独ルートとしてアクセスされた場合(通知からの直接遷移など)のフォールバック。
// announcements.tsxのシートに埋め込まれる場合はAnnouncementDetailContentを直接使う。
export default function AnnouncementDetail() {
  const { targetId } = useLocalSearchParams<{ targetId: string }>();
  return (
    <HeroScreen title="お知らせ詳細" onBack={() => goBackOrReplace('/announcements')}>
      <AnnouncementDetailContent targetId={targetId} />
    </HeroScreen>
  );
}
