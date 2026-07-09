import { Text, View } from 'react-native';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View className="bg-status-overdue/10 rounded-card p-4 mb-4">
      <Text className="font-body text-caption text-status-overdue">{message}</Text>
    </View>
  );
}
