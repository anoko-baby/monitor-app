import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { supabase } from '../lib/supabase';

export default function Consent() {
  const [consentEc, setConsentEc] = useState(false);
  const [consentSns, setConsentSns] = useState(false);
  const [consentAd, setConsentAd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);

  // 3.8: モニターは初回登録時に通知許可を必須ステップとして求める。
  // OSで「許可しない」を選ばれた場合はブロックできないため、バナーで有効化を促すのみ。
  async function handleAgree() {
    setSubmitting(true);

    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === 'granted';
    setNotifDenied(!granted);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session) {
      await supabase
        .from('profiles')
        .update({
          tos_agreed_at: new Date().toISOString(),
          consent_ec: consentEc,
          consent_sns: consentSns,
          consent_ad: consentAd,
          notify_push: granted,
          status: 'active',
        })
        .eq('auth_user_id', session.user.id);
    }

    setSubmitting(false);
    router.replace('/welcome');
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title-lg text-ink mb-4">利用規約・プライバシーポリシー</Text>
      <Text className="font-body text-body text-ink-soft mb-8">
        (規約文面は準備中です。ご利用にあたっては下記の内容にご同意ください)
      </Text>

      <View className="flex-row items-center justify-between mb-4">
        <Text className="font-body text-body text-ink flex-1 pr-4">
          写真・動画をECサイトに掲載してもよい
        </Text>
        <Switch value={consentEc} onValueChange={setConsentEc} />
      </View>
      <View className="flex-row items-center justify-between mb-4">
        <Text className="font-body text-body text-ink flex-1 pr-4">
          写真・動画をSNSに掲載してもよい
        </Text>
        <Switch value={consentSns} onValueChange={setConsentSns} />
      </View>
      <View className="flex-row items-center justify-between mb-8">
        <Text className="font-body text-body text-ink flex-1 pr-4">
          写真・動画を広告に利用してもよい
        </Text>
        <Switch value={consentAd} onValueChange={setConsentAd} />
      </View>

      {notifDenied && (
        <ErrorBanner message="通知が許可されていません。設定アプリから通知を有効にしてください。" />
      )}

      <AppButton
        label={submitting ? '処理中…' : '同意して次へ'}
        onPress={handleAgree}
        loading={submitting}
      />
    </ScrollView>
  );
}
