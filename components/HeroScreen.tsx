import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// WEARアプリのプロフィール/ホーム画面を参考にしたページ構成(実機フィードバックで依頼された、
// 濃色ヘッダー+その下に角丸シートが被さって出てくるレイアウト)。シート内上部にアイコン付き
// タブを置き、ページ内切り替えができるようにする(例: プロフィール情報/子ども情報)。
// タブバー(BottomTabBar)は主要画面下部に別途置くため、ここでは扱わない
// (呼び出し側で <HeroScreen>...</HeroScreen> の下にBottomTabBarを並べる)。

export type HeroTab = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
};

type Props = {
  title: string;
  subtitle?: string;
  headerExtra?: ReactNode;
  // 2つ以上あるときだけタブ行を表示する(サブビューの無い画面は見出し+シートのみでよい)
  tabs?: HeroTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  // 詳細・フォーム系の画面用。指定すると見出しの左に戻るボタンを表示する
  // (ネイティブヘッダーの代わりに、この濃色ヘッダーを主要画面・詳細画面問わず統一するため)。
  onBack?: () => void;
  children: ReactNode;
};

const HERO_BG = '#3E3A34'; // ink
const ACTIVE_COLOR = '#3E3A34';
const INACTIVE_COLOR = '#8C8579';

export function HeroScreen({ title, subtitle, headerExtra, tabs, activeTab, onTabChange, onBack, children }: Props) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: HERO_BG }}>
      <View className="px-6 pt-2 pb-9">
        <View className="flex-row items-center">
          {onBack && (
            <Pressable onPress={onBack} hitSlop={8} style={{ marginRight: 8, marginLeft: -4 }}>
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </Pressable>
          )}
          <Text className="font-heading text-title-lg text-white">{title}</Text>
        </View>
        {subtitle && <Text className="font-body text-caption mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{subtitle}</Text>}
        {headerExtra}
      </View>

      <View
        className="flex-1 bg-bg"
        style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, overflow: 'hidden' }}
      >
        {tabs && tabs.length > 1 && (
          <View className="flex-row border-b border-line px-4">
            {tabs.map((tab) => {
              const active = tab.key === activeTab;
              const iconName = active ? tab.activeIcon ?? tab.icon : tab.icon;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => onTabChange?.(tab.key)}
                  className="flex-1 items-center pt-4 pb-3"
                  style={{ gap: 4 }}
                >
                  <Ionicons name={iconName} size={20} color={active ? ACTIVE_COLOR : INACTIVE_COLOR} />
                  <Text className={`text-tiny ${active ? 'font-body-medium text-ink' : 'font-body text-ink-soft'}`}>
                    {tab.label}
                  </Text>
                  <View
                    style={{
                      height: 2,
                      width: '60%',
                      marginTop: 2,
                      borderRadius: 1,
                      backgroundColor: active ? '#7E8F86' : 'transparent',
                    }}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <View className="flex-1">{children}</View>
      </View>
    </SafeAreaView>
  );
}
