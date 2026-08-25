import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

// ネイティブヘッダーの標準の戻るボタンは、Web版でページを直接開いた/リロードした場合に
// ナビゲーション履歴が無く表示されない(あるいは戻り先が無い)ことがある。
// canGoBack()を使い、履歴があれば通常の戻る、無ければ決まった親画面へreplaceする
// (WEAR等のアプリと同様、どこから来ても必ず迷子にならない導線にする)。
export function makeHeaderBackButton(fallbackHref: string) {
  return function HeaderBackButton() {
    return (
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace(fallbackHref as any);
          }
        }}
        hitSlop={12}
        style={{ paddingRight: 12, paddingVertical: 4 }}
      >
        <Ionicons name="chevron-back" size={24} color="#3E3A34" />
      </Pressable>
    );
  };
}
