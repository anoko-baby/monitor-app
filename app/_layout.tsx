import '../global.css';

import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#F6F3ED' },
        headerTintColor: '#3E3A34',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#F6F3ED' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Dropboxアップロード検証' }} />
    </Stack>
  );
}
