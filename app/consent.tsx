import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { registerPushTokenForCurrentUser } from '../lib/push';
import { supabase } from '../lib/supabase';

// トグルだと「同意している状態」がぱっと見でわかりにくいとの実機フィードバックを受け、
// チェックボックス(✓)に変更した。
function ConsentCheckbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} className="flex-row items-center mb-4" style={{ gap: 10 }}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={24}
        color={checked ? '#4E5B54' : '#B7AE9E'}
      />
      <Text className="font-body text-body text-ink flex-1">{label}</Text>
    </Pressable>
  );
}

const TOS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '第1条(規約の適用)',
    body: '本規約は、anoko.(以下「当社」といいます)が提供するモニター管理アプリ「anoko monitor」(以下「本アプリ」)を通じたモニター活動(以下「本サービス」)の利用条件を定めるものです。モニターとして本サービスに登録される方(以下「モニター」)は、本規約に同意のうえご利用いただきます。',
  },
  {
    heading: '第2条(モニター登録)',
    body: '1. モニター登録は、当社が発行する招待コードを保有する方のみ行うことができます。\n2. 登録にあたり届け出た氏名・連絡先等の情報に虚偽があった場合、当社はモニター登録を取り消すことがあります。',
  },
  {
    heading: '第3条(商品の提供)',
    body: '1. 当社は、モニター活動のため商品をモニターに提供します。\n2. 提供された商品の返却要否は案件ごとに当社が定めるものとし、返却が必要な場合は当社の指示に従うものとします。',
  },
  {
    heading: '第4条(モニターの義務)',
    body: '1. モニターは、当社が案件ごとに定める期限までに、着用・使用した写真・動画等(以下「提出物」)およびSNS投稿を提出するものとします。\n2. モニターは、提出物について、実際に着用・使用した状態を偽りなく提出するものとします。\n3. 期限までに提出がない場合、当社はモニターへの以後の案件依頼を見合わせることがあります。',
  },
  {
    heading: '第5条(提出物の利用)',
    body: '1. モニターが提出した写真・動画等の著作権はモニターに帰属しますが、モニターは当社に対し、下記で選択した範囲(ECサイト掲載・SNS掲載・広告利用)において、これらを無償で使用する権利を許諾するものとします。\n2. モニターは、いつでも本アプリまたはお問い合わせにより、上記の同意範囲を変更することができます。ただし、既に掲載・使用が開始されているものについては、当社は合理的な期間内に対応するよう努めるものとし、即時の削除を保証するものではありません。',
  },
  {
    heading: '第6条(禁止事項)',
    body: 'モニターは、本サービスの利用にあたり、次の行為をしてはなりません。\n・虚偽の情報を登録する行為\n・提供された商品を、モニター活動の目的外で転売・譲渡する行為\n・当社または第三者の権利を侵害する行為\n・その他、当社が本サービスの運営上不適切と判断する行為',
  },
  {
    heading: '第7条(個人情報の取り扱い)',
    body: '1. 当社は、モニターから取得した氏名・都道府県・電話番号・メールアドレス・Instagramアカウント名・お子様に関する情報(呼び名・生年月・性別)を、本サービスの運営(案件のご案内・提出物の確認・お知らせの配信・お問い合わせ対応)の目的でのみ利用します。\n2. 商品の発送先住所は本アプリでは保持せず、Shopify(当社ECサイトの受注管理システム)側で別途管理します。\n3. 提出された写真・動画等は、モニター活動の管理のためDropbox上で保管します。\n4. 当社は、法令に基づく場合を除き、モニターの同意なく個人情報を第三者に提供しません。\n5. モニターは、ご自身の個人情報の開示・訂正・削除を、下記お問い合わせ先に請求することができます。',
  },
  {
    heading: '第8条(登録の抹消)',
    body: 'モニターが退会を希望する場合、または本規約に違反した場合、当社はモニター登録を抹消することができます。',
  },
  {
    heading: '第9条(規約の変更)',
    body: '当社は、必要と判断した場合、モニターへの通知をもって本規約を変更することができます。変更後も本サービスの利用を継続した場合、変更後の規約に同意したものとみなします。',
  },
  {
    heading: '第10条(お問い合わせ)',
    body: '本規約に関するお問い合わせは、main@anoko-official.com までご連絡ください。\n\n制定日: 2026年8月26日\nanoko.',
  },
];

export default function Consent() {
  const [consentEc, setConsentEc] = useState(false);
  const [consentSns, setConsentSns] = useState(false);
  const [consentAd, setConsentAd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notifDenied, setNotifDenied] = useState(false);

  // 3.8: モニターは初回登録時に通知許可を必須ステップとして求める。
  // OSで「許可しない」を選ばれた場合はブロックできないため、バナーで有効化を促すのみ。
  // Web版はWeb Push未整備のため、許可リクエスト自体を行わずnotify_push=falseとして進める。
  async function handleAgree() {
    setSubmitting(true);

    const granted =
      Platform.OS === 'web' ? false : (await Notifications.requestPermissionsAsync()).status === 'granted';
    setNotifDenied(Platform.OS !== 'web' && !granted);

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

    if (granted) {
      await registerPushTokenForCurrentUser();
    }

    setSubmitting(false);
    router.replace('/monitor-home');
  }

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title-lg text-ink mb-4">利用規約・プライバシーポリシー</Text>

      <View
        className="bg-surface rounded-card border-hairline border-line px-4 py-4 mb-6"
        style={{ maxHeight: 320 }}
      >
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
          {TOS_SECTIONS.map((section) => (
            <View key={section.heading} className="mb-4">
              <Text className="font-body-medium text-body text-ink mb-1">{section.heading}</Text>
              <Text className="font-body text-caption text-ink-soft">{section.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <Text className="font-body-medium text-body text-ink mb-2">
        以下すべてにチェックのうえ、ご同意ください(モニターへのご協力には全項目への同意が必要です)
      </Text>

      <ConsentCheckbox
        label="写真・動画をECサイトに掲載することに同意する"
        checked={consentEc}
        onToggle={() => setConsentEc((v) => !v)}
      />
      <ConsentCheckbox
        label="写真・動画をSNSに掲載することに同意する"
        checked={consentSns}
        onToggle={() => setConsentSns((v) => !v)}
      />
      <View className="mb-8">
        <ConsentCheckbox
          label="写真・動画を広告に利用することに同意する"
          checked={consentAd}
          onToggle={() => setConsentAd((v) => !v)}
        />
      </View>

      {notifDenied && (
        <ErrorBanner message="通知が許可されていません。設定アプリから通知を有効にしてください。" />
      )}

      <AppButton
        label={submitting ? '処理中…' : '同意して次へ'}
        onPress={handleAgree}
        disabled={!consentEc || !consentSns || !consentAd}
        loading={submitting}
      />
    </ScrollView>
  );
}
