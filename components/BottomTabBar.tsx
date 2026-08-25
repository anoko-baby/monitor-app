import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabItem = {
  label: string;
  href: string;
  badge?: number;
};

// 主要画面(ホーム画面)専用のフッター固定タブメニュー。詳細・フォーム画面は従来どおり
// ネイティブヘッダー+戻るボタンのプッシュ遷移(WEAR等の一般的なアプリと同じ構成)。
export function BottomTabBar({ items }: { items: TabItem[] }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row bg-surface"
      style={{
        borderTopWidth: 1,
        borderTopColor: '#E7E1D6',
        paddingBottom: insets.bottom || 10,
        paddingTop: 8,
      }}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable
            key={item.href}
            onPress={() => {
              if (!active) router.replace(item.href as any);
            }}
            className="flex-1 items-center"
            style={{ gap: 2 }}
          >
            <View>
              <Text
                className={`font-body-medium text-caption ${active ? 'text-accent-ink' : 'text-ink-soft'}`}
              >
                {item.label}
              </Text>
              {!!item.badge && (
                <View
                  className="bg-status-overdue rounded-full"
                  style={{ position: 'absolute', top: -2, right: -8, width: 6, height: 6 }}
                />
              )}
            </View>
            <View
              className={active ? 'bg-accent' : 'bg-transparent'}
              style={{ width: 16, height: 2, borderRadius: 1 }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
