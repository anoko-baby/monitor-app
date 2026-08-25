import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { BottomTabBar } from '../components/BottomTabBar';
import { ErrorBanner } from '../components/ErrorBanner';
import { Screen } from '../components/Screen';
import { StatusPill } from '../components/StatusPill';
import { supabase } from '../lib/supabase';
import { ADMIN_TAB_ITEMS } from '../lib/tabItems';

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

export default function AdminMonitorList() {
  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, nickname, instagram_handle, status')
        .eq('role', 'monitor')
        .order('created_at', { ascending: false });
      // クエリ失敗時に空リストと見分けが付かないと不具合調査ができないため、必ずエラーを表示する
      if (error) setLoadError(`モニター一覧の取得に失敗しました: ${error.message}`);
      setMonitors(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <Screen>
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-heading text-title-lg text-ink">モニター一覧</Text>
          <Pressable onPress={() => router.push('/admin-invite-issue')}>
            <Text className="font-body-medium text-body text-accent-ink">+ 招待する</Text>
          </Pressable>
        </View>

        {loadError && <ErrorBanner message={loadError} />}

        {loading ? (
          <ActivityIndicator color="#7E8F86" />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={monitors}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#E7E1D6' }} />}
            ListEmptyComponent={
              <Text className="font-body text-body text-ink-soft">まだモニターがいません</Text>
            }
            renderItem={({ item }) => {
              const displayName = item.name ?? (item.instagram_handle ? `@${item.instagram_handle}` : '(未登録)');
              return (
                <Pressable
                  onPress={() => router.push({ pathname: '/admin-monitor-detail', params: { id: item.id } })}
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

      <BottomTabBar items={ADMIN_TAB_ITEMS} />
    </Screen>
  );
}
