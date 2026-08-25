import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/StatusPill';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, nickname, instagram_handle, status')
        .eq('role', 'monitor')
        .order('created_at', { ascending: false });
      setMonitors(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={monitors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}
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
    </View>
  );
}
