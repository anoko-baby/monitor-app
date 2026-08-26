import { Text, TextInput, TextInputProps, View } from 'react-native';

type Props = TextInputProps & {
  label: string;
  // 「(必須)」という文字表記ではなく赤い*マークにしてほしい、との実機フィードバックにより追加。
  required?: boolean;
};

export function TextField({ label, required, style, ...inputProps }: Props) {
  return (
    <View className="mb-4">
      <Text className="font-body text-caption text-ink-soft mb-1">
        {label}
        {required && <Text className="text-status-overdue"> *</Text>}
      </Text>
      <TextInput
        className="font-body bg-surface border border-line rounded-control px-4 py-3 text-body text-ink"
        placeholderTextColor="#B7AE9E"
        style={style}
        {...inputProps}
      />
    </View>
  );
}
