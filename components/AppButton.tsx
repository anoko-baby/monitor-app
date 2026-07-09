import { ActivityIndicator, Pressable, Text } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
};

// 仕様書 v1.8 14.5: 主ボタン=accent塗り+白文字、副ボタン=枠線のみ。1画面に主ボタンは1つ。
export function AppButton({ label, onPress, disabled, loading, variant = 'primary' }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={
        isPrimary
          ? 'bg-accent rounded-control py-4 items-center'
          : 'border border-line rounded-control py-4 items-center'
      }
      style={{ opacity: disabled || loading ? 0.5 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFFFFF' : '#7E8F86'} />
      ) : (
        <Text
          className={
            isPrimary
              ? 'font-body-medium text-white text-title'
              : 'font-body-medium text-ink text-title'
          }
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
