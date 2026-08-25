import { Text, View } from 'react-native';

// WEAR等のSNS/フリマアプリでよく見る「頭文字の丸アイコン」。画像を持たないモニター/ブランドの
// 一覧行で、単なるテキストの羅列よりも視認性を上げるために使う。
export function Avatar({ label, size = 40 }: { label: string; size?: number }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      className="bg-accent items-center justify-center"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      <Text className="font-body-medium text-white" style={{ fontSize: size * 0.4 }}>
        {initial}
      </Text>
    </View>
  );
}
