import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { BottomTabBar } from '../components/BottomTabBar';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroProfileBadge } from '../components/HeroProfileBadge';
import { HeroScreen } from '../components/HeroScreen';
import { StatusPill } from '../components/StatusPill';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';
import { AdminInviteIssueContent } from './admin-invite-issue';
import { AdminMonitorDetailContent } from './admin-monitor-detail';

type MonitorRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  instagram_handle: string | null;
  status: 'invited' | 'active' | 'inactive';
};

const STATUS_LABEL: Record<MonitorRow['status'], string> = {
  invited: '招待中',
  active: '有効',
  inactive: '無効',
};

type TabKey = 'all' | MonitorRow['status'];

type SheetView = { type: 'list' } | { type: 'invite' } | { type: 'detail'; id: string };

export default function AdminMonitorList() {
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [view, setView] = useState<SheetView>({ type: 'list' });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, nickname, instagram_handle, status')
      .eq('role', 'monitor')
      .order('created_at', { ascending: false });
    // クエリ失敗時に空リストと見分けが付かないと不具合調査ができないため、必ずエラーを表示する
    if (error) setLoadError(`モニター一覧の取得に失敗しました: ${error.message}`);
    setMonitors(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function backToList() {
    setView({ type: 'list' });
    load();
  }

  const visibleMonitors = monitors.filter((m) => activeTab === 'all' || m.status === activeTab);

  return (
    <View className="flex-1">
      <HeroScreen
        title="モニター一覧"
        subtitle={view.type === 'list' ? `有効 ${monitors.filter((m) => m.status === 'active').length}名` : undefined}
        headerExtra={<HeroProfileBadge />}
        tabs={
          view.type === 'list'
            ? [
                { key: 'all', label: 'すべて', icon: 'people-outline', activeIcon: 'people' },
                { key: 'active', label: '有効', icon: 'checkmark-circle-outline', activeIcon: 'checkmark-circle' },
                { key: 'invited', label: '招待中', icon: 'mail-outline', activeIcon: 'mail' },
                { key: 'inactive', label: '無効', icon: 'close-circle-outline', activeIcon: 'close-circle' },
              ]
            : undefined
        }
        activeTab={view.type === 'list' ? activeTab : undefined}
        onTabChange={view.type === 'list' ? (key) => setActiveTab(key as TabKey) : undefined}
        onBack={view.type !== 'list' ? backToList : undefined}
      >
        {view.type === 'invite' ? (
          <AdminInviteIssueContent />
        ) : view.type === 'detail' ? (
          <AdminMonitorDetailContent id={view.id} />
        ) : (
          <View className="flex-1 px-6 pt-4">
            <View className="flex-row justify-end mb-2">
              <Pressable onPress={() => setView({ type: 'invite' })}>
                <Text className="font-body-medium text-body text-accent-ink">+ 招待する</Text>
              </Pressable>
            </View>

            {loadError && <ErrorBanner message={loadError} />}

            {loading ? (
              <ActivityIndicator color="#7E8F86" />
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={visibleMonitors}
                keyExtractor={(item) => item.id}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E7E1D6' }} />}
                ListEmptyComponent={
                  <Text className="font-body text-body text-ink-soft">該当するモニターがいません</Text>
                }
                renderItem={({ item }) => {
                  const displayName = item.name ?? (item.instagram_handle ? `@${item.instagram_handle}` : '(未登録)');
                  return (
                    <Pressable
                      onPress={() => setView({ type: 'detail', id: item.id })}
                      className="flex-row items-center py-3"
                      style={{ gap: 12 }}
                    >
                      <Avatar label={displayName} />
                      <View className="flex-1">
                        <Text className="font-body-medium text-body text-ink">{displayName}</Text>
                        {(item.nickname || (item.name && item.instagram_handle)) && (
                          <Text className="font-body text-caption text-ink-soft" numberOfLines={1}>
                            {[item.nickname, item.name && item.instagram_handle ? `@${item.instagram_handle}` : null]
                              .filter(Boolean)
                              .join(' ・ ')}
                          </Text>
                        )}
                      </View>
                      <StatusPill
                        label={STATUS_LABEL[item.status]}
                        tone={item.status === 'active' ? 'accent' : item.status === 'invited' ? 'neutral' : 'rejected'}
                      />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        )}
      </HeroScreen>

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </View>
  );
}
