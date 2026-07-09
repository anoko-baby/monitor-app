import { Text, View } from 'react-native';

// 3.10 モニター実績。tasks/submissionsテーブルはM5以降で作るため、
// それまでは常に空表示になる(集計クエリはテーブルが揃ってから実装する)。
export function AchievementSection() {
  return (
    <View>
      <Text className="font-body-medium text-body text-ink mb-3">モニター実績</Text>
      <View className="bg-surface rounded-card border-hairline border-line p-4">
        <View className="flex-row justify-between mb-2">
          <Text className="font-body text-caption text-ink-soft">提出率</Text>
          <Text className="font-body text-caption text-ink-soft">-</Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="font-body text-caption text-ink-soft">期限内提出率</Text>
          <Text className="font-body text-caption text-ink-soft">-</Text>
        </View>
        <Text className="font-body text-caption text-ink-soft mt-2">
          過去案件はまだありません
        </Text>
      </View>
    </View>
  );
}
