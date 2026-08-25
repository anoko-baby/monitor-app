import '../global.css';

import { NotoSansJP_400Regular, NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp';
import { ZenMaruGothic_500Medium } from '@expo-google-fonts/zen-maru-gothic';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { makeHeaderBackButton } from '../components/HeaderBackButton';

// Web版: スマホ幅前提のレイアウトがワイドな画面で間延びして見づらいため、
// 中央に最大幅のカラムを敷いてその外側をline色でレターボックス表示する
// (ネイティブでは無関係。Platform.OS==='web'のときのみ効く)。
const WEB_MAX_WIDTH = 480;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ZenMaruGothic_500Medium,
    NotoSansJP_400Regular,
    NotoSansJP_500Medium,
  });

  if (!fontsLoaded) {
    return <View className="flex-1 bg-bg" />;
  }

  return (
    <SafeAreaProvider>
      <View
        style={
          Platform.OS === 'web'
            ? { flex: 1, backgroundColor: '#E7E1D6', alignItems: 'center' }
            : { flex: 1 }
        }
      >
        <View
          style={
            Platform.OS === 'web'
              ? { flex: 1, width: '100%', maxWidth: WEB_MAX_WIDTH, backgroundColor: '#F6F3ED' }
              : { flex: 1 }
          }
        >
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#F6F3ED' },
              headerTintColor: '#3E3A34',
              headerShadowVisible: false,
              contentStyle: { backgroundColor: '#F6F3ED' },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="admin-login" options={{ title: 'ログイン' }} />
            <Stack.Screen name="invite-code" options={{ title: '招待コード入力' }} />
            <Stack.Screen name="monitor-login" options={{ title: 'ログイン' }} />
            <Stack.Screen name="register" options={{ title: 'メール登録' }} />
            <Stack.Screen name="consent" options={{ title: '利用同意', headerBackVisible: false }} />
            <Stack.Screen name="monitor-home" options={{ headerShown: false }} />
            <Stack.Screen
              name="campaign-detail"
              options={{ title: '案件詳細', headerLeft: makeHeaderBackButton('/monitor-home') }}
            />
            <Stack.Screen
              name="submission-form"
              options={{ title: '提出する', headerLeft: makeHeaderBackButton('/monitor-home') }}
            />
            <Stack.Screen
              name="sns-submission-form"
              options={{ title: 'SNS投稿記録', headerLeft: makeHeaderBackButton('/monitor-home') }}
            />
            <Stack.Screen name="submission-history" options={{ headerShown: false }} />
            <Stack.Screen name="announcements" options={{ headerShown: false }} />
            <Stack.Screen
              name="announcement-detail"
              options={{ title: 'お知らせ詳細', headerLeft: makeHeaderBackButton('/announcements') }}
            />
            <Stack.Screen name="admin-home" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-invite-issue"
              options={{ title: 'モニターを招待する', headerLeft: makeHeaderBackButton('/admin-monitor-list') }}
            />
            <Stack.Screen name="admin-monitor-list" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-monitor-detail"
              options={{ title: 'モニター詳細', headerLeft: makeHeaderBackButton('/admin-monitor-list') }}
            />
            <Stack.Screen name="monitor-profile" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-product-search"
              options={{ title: '商品検索', headerLeft: makeHeaderBackButton('/admin-home') }}
            />
            <Stack.Screen
              name="admin-watched-coupons"
              options={{ title: '監視クーポン登録', headerLeft: makeHeaderBackButton('/admin-home') }}
            />
            <Stack.Screen
              name="admin-coupon-orders"
              options={{ title: 'クーポン注文', headerLeft: makeHeaderBackButton('/admin-home') }}
            />
            <Stack.Screen name="admin-campaign-list" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-campaign-form"
              options={{ title: '案件作成・編集', headerLeft: makeHeaderBackButton('/admin-campaign-list') }}
            />
            <Stack.Screen name="admin-submission-list" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-submission-detail"
              options={{ title: '提出詳細・検収', headerLeft: makeHeaderBackButton('/admin-submission-list') }}
            />
            <Stack.Screen name="admin-announcement-list" options={{ headerShown: false }} />
            <Stack.Screen
              name="admin-announcement-form"
              options={{ title: 'お知らせ作成・配信', headerLeft: makeHeaderBackButton('/admin-announcement-list') }}
            />
            <Stack.Screen name="dev-upload-test" options={{ title: 'Dropboxアップロード検証(開発用)' }} />
          </Stack>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
