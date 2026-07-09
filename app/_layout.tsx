import '../global.css';

import { NotoSansJP_400Regular, NotoSansJP_500Medium } from '@expo-google-fonts/noto-sans-jp';
import { ZenMaruGothic_500Medium } from '@expo-google-fonts/zen-maru-gothic';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { View } from 'react-native';

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
      <Stack.Screen name="register" options={{ title: 'メール登録' }} />
      <Stack.Screen name="consent" options={{ title: '利用同意', headerBackVisible: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="admin-home" options={{ headerShown: false }} />
      <Stack.Screen name="admin-invite-issue" options={{ title: 'モニターを招待する' }} />
      <Stack.Screen name="dev-upload-test" options={{ title: 'Dropboxアップロード検証(開発用)' }} />
    </Stack>
  );
}
