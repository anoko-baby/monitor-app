import { Text, View } from 'react-native';

type Tone = 'neutral' | 'accent' | 'overdue' | 'rejected';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-status-pending/20 text-ink-soft',
  accent: 'bg-accent/15 text-accent-ink',
  overdue: 'bg-status-overdue/15 text-status-overdue',
  rejected: 'bg-status-rejected/15 text-status-rejected',
};

// WEARのブランド一覧・ステータス表示のような、丸みのある小さなバッジ。
export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const [bgClass, textClass] = TONE_CLASSES[tone].split(' ');
  return (
    <View className={`${bgClass} rounded-full px-3 py-1`}>
      <Text className={`font-body-medium text-tiny ${textClass}`}>{label}</Text>
    </View>
  );
}
