import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// 通知許可済みのログイン中ユーザーのExpo Push Tokenを取得し、profiles.push_tokenへ保存する(仕様書 v1.8 3.8)。
// EAS projectId未設定の間(M9でのEASビルド設定前)はトークンが取得できないため、静かにスキップする。
// Web版はWeb Push用のservice worker/VAPID設定が未整備のため、常にスキップする。
export async function registerPushTokenForCurrentUser(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return false;

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    await supabase
      .from('profiles')
      .update({ push_token: tokenResponse.data, notify_push: true })
      .eq('auth_user_id', session.user.id);
    return true;
  } catch {
    return false;
  }
}
