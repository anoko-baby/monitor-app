import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';

import { supabase } from '../lib/supabase';

type MonitorRow = {
  id: string;
  name: string;
  nickname: string | null;
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
        .select('id, name, nickname, status')
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
        contentContainerStyle={{ padding: 24 }}
        ListEmptyComponent={
          <Text className="font-body text-body text-ink-soft">まだモニターがいません</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/admin-monitor-detail', params: { id: item.id } })}
            className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row items-center justify-between"
          >
            <View>
              <Text className="font-body text-body text-ink">{item.name}</Text>
              {item.nickname && (
                <Text className="font-body text-caption text-ink-soft">{item.nickname}</Text>
              )}
            </View>
            <Text className="font-body text-caption text-ink-soft">{STATUS_LABEL[item.status]}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
