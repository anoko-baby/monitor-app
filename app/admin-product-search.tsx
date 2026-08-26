import { useState } from 'react';
import { FlatList, Image, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { TextField } from '../components/TextField';
import { variantLabel } from '../lib/campaigns';
import { goBackOrReplace } from '../lib/navigation';
import { invokeEdgeFunction } from '../lib/supabase';

type Variant = {
  shopifyVariantId: string;
  title: string | null;
  sku: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
};

type Product = {
  shopifyProductId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  variants: Variant[];
};

// 商品検索の本体。単独ルートでもadmin-homeのシート内埋め込みでも使う共通コンポーネント。
export function AdminProductSearchContent() {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query) return;
    setLoading(true);
    setError(null);
    setSearched(true);

    const { data, errorMessage } = await invokeEdgeFunction<any>('shopify-product-search', {
      body: { query },
    });

    setLoading(false);

    if (errorMessage || !data) {
      setError(errorMessage ?? '商品検索に失敗しました');
      setProducts([]);
      return;
    }

    setProducts(data.products ?? []);
  }

  return (
    <View className="flex-1 px-6 pt-6">
      <Text className="font-heading text-title text-ink mb-4">商品検索</Text>
      <View className="flex-row items-end mb-2">
        <View className="flex-1 mr-2">
          <TextField label="商品検索" value={query} onChangeText={setQuery} placeholder="商品名など" />
        </View>
      </View>
      <View className="mb-4">
        <AppButton
          label={loading ? '検索中…' : '検索する'}
          onPress={handleSearch}
          disabled={!query}
          loading={loading}
        />
      </View>

      {error && <ErrorBanner message={error} />}

      {!loading && searched && !error && products.length === 0 && (
        <Text className="font-body text-caption text-ink-soft">該当する商品が見つかりませんでした</Text>
      )}

      <FlatList
        data={products}
        keyExtractor={(item) => item.shopifyProductId}
        renderItem={({ item }) => (
          <View className="bg-surface rounded-card border-hairline border-line p-4 mb-3">
            <View className="flex-row mb-2">
              {item.imageUrl && (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
                />
              )}
              <View className="flex-1">
                <Text className="font-body text-body text-ink">{item.title}</Text>
                {item.brand && (
                  <Text className="font-body text-caption text-ink-soft">{item.brand}</Text>
                )}
              </View>
            </View>
            {item.variants.map((variant) => (
              <Text key={variant.shopifyVariantId} className="font-body text-caption text-ink-soft">
                {variantLabel(variant)}
              </Text>
            ))}
          </View>
        )}
      />
    </View>
  );
}

// 単独ルートとしてアクセスされた場合のフォールバック。admin-homeのシートに埋め込まれる場合は
// AdminProductSearchContentを直接使う。
export default function AdminProductSearch() {
  return (
    <HeroScreen title="商品検索" onBack={() => goBackOrReplace('/admin-home')}>
      <AdminProductSearchContent />
    </HeroScreen>
  );
}
