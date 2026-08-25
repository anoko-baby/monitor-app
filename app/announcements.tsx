import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { BottomTabBar } from '../components/BottomTabBar';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroProfileBadge } from '../components/HeroProfileBadge';
import { HeroScreen } from '../components/HeroScreen';
import { supabase } from '../lib/supabase';
import { monitorTabItems } from '../lib/tabItems';
import { AnnouncementDetailContent } from './announcement-detail';

type AnnouncementRow = {
  targetId: string;
  title: string;
  sentAt: string | null;
  isUnread: boolean;
};

type SheetView = { type: 'list' } | { type: 'detail'; targetId: string };

// モニター側お知らせ一覧(仕様書 v1.8 3.9)。未読バッジ表示。
export default function Announcements() {
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [activeTab, setActiveTab] = useState<'unread' | 'read'>('unread');
  const [view, setView] = useState<SheetView>({ type: 'list' });

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('announcement_targets')
      .select('id, read_at, announcements(title, sent_at)')
      .order('created_at', { ascending: false });
    if (error) setLoadError(`お知らせ一覧の取得に失敗しました: ${error.message}`);

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

  async function loadUnreadAnnouncements() {
    const { count } = await supabase
      .from('announcement_targets')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null);
    setUnreadAnnouncements(count ?? 0);
  }

  useEffect(() => {
    load();
    loadUnreadAnnouncements();
  }, []);

  const visibleRows = rows.filter((r) => (activeTab === 'unread' ? r.isUnread : !r.isUnread));

  function backToList() {
    setView({ type: 'list' });
    load();
    loadUnreadAnnouncements();
  }

  return (
    <View className="flex-1">
      <HeroScreen
        title="お知らせ"
        subtitle={view.type === 'list' ? `未読 ${rows.filter((r) => r.isUnread).length}件` : undefined}
        headerExtra={<HeroProfileBadge />}
        onBack={view.type === 'detail' ? backToList : undefined}
        tabs={
          view.type === 'list'
            ? [
                { key: 'unread', label: '未読', icon: 'mail-unread-outline', activeIcon: 'mail-unread' },
                { key: 'read', label: '既読', icon: 'mail-open-outline', activeIcon: 'mail-open' },
              ]
            : undefined
        }
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as 'unread' | 'read')}
      >
      {view.type === 'detail' ? (
        <AnnouncementDetailContent targetId={view.targetId} />
      ) : (
      <View className="flex-1 px-6 pt-4">
      {loadError && <ErrorBanner message={loadError} />}

      {loading ? (
        <ActivityIndicator color="#7E8F86" />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={visibleRows}
          keyExtractor={(item) => item.targetId}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E7E1D6' }} />}
          ListEmptyComponent={
            <Text className="font-body text-caption text-ink-soft">
              {activeTab === 'unread' ? '未読のお知らせはありません' : '既読のお知らせはありません'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setView({ type: 'detail', targetId: item.targetId })}
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
      </View>
      )}
      </HeroScreen>

      <BottomTabBar items={monitorTabItems(unreadAnnouncements)} />
    </View>
  );
}
