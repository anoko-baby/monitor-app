import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TabItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

const ACTIVE_COLOR = '#3E3A34'; // ink
const INACTIVE_COLOR = '#8C8579'; // ink-soft

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
        const iconName = active ? item.activeIcon ?? item.icon : item.icon;
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
              <Ionicons name={iconName} size={22} color={active ? ACTIVE_COLOR : INACTIVE_COLOR} />
              {!!item.badge && (
                <View
                  className="bg-status-overdue rounded-full"
                  style={{ position: 'absolute', top: -2, right: -6, width: 8, height: 8 }}
                />
              )}
            </View>
            <Text
              className={`text-tiny ${active ? 'font-body-medium text-ink' : 'font-body text-ink-soft'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
