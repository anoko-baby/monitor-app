import { useEffect, useState } from 'react';
import { FlatList, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

type WatchedCoupon = {
  id: string;
  code: string;
  label: string | null;
  active: boolean;
};

// 監視対象クーポンの登録(仕様書 v1.8 3.12)。コード登録時にShopify APIで実在チェックを行う。
export default function AdminWatchedCoupons() {
  const [coupons, setCoupons] = useState<WatchedCoupon[]>([]);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCoupons() {
    const { data } = await supabase
      .from('watched_coupons')
      .select('id, code, label, active')
      .order('created_at', { ascending: false });
    setCoupons(data ?? []);
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  async function handleAdd() {
    if (!code) return;
    setChecking(true);
    setError(null);

    const { data, error: fnError } = await supabase.functions.invoke('shopify-check-discount', {
      body: { code },
    });

    if (fnError || data?.error) {
      setChecking(false);
      setError(data?.error ?? 'クーポンの確認に失敗しました');
      return;
    }

    if (!data.exists) {
      setChecking(false);
      setError('Shopifyにこのクーポンコードが見つかりませんでした');
      return;
    }

    const { error: insertError } = await supabase
      .from('watched_coupons')
      .insert({ code, label: label || data.title || null });

    setChecking(false);

    if (insertError) {
      setError('登録に失敗しました(既に登録済みの可能性があります)');
      return;
    }

    setCode('');
    setLabel('');
    loadCoupons();
  }

  async function toggleActive(coupon: WatchedCoupon) {
    await supabase.from('watched_coupons').update({ active: !coupon.active }).eq('id', coupon.id);
    loadCoupons();
  }

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <TextField label="クーポンコード" value={code} onChangeText={setCode} autoCapitalize="characters" />
      <TextField label="ラベル(任意)" value={label} onChangeText={setLabel} />

      {error && <ErrorBanner message={error} />}

      <View className="mb-6">
        <AppButton
          label={checking ? '確認中…' : '登録する'}
          onPress={handleAdd}
          disabled={!code}
          loading={checking}
        />
      </View>

      <FlatList
        data={coupons}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text className="font-body text-caption text-ink-soft">まだ登録されていません</Text>
        }
        renderItem={({ item }) => (
          <View className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row items-center justify-between">
            <View>
              <Text className="font-body text-body text-ink">{item.code}</Text>
              {item.label && (
                <Text className="font-body text-caption text-ink-soft">{item.label}</Text>
              )}
            </View>
            <Switch value={item.active} onValueChange={() => toggleActive(item)} />
          </View>
        )}
      />
    </View>
  );
}
