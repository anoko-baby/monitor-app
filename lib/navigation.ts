import { router } from 'expo-router';

// Web版でページを直接開いた/リロードした場合はナビゲーション履歴が無いことがあるため、
// 履歴があれば通常の戻る、無ければ決まった親画面へreplaceする(components/HeaderBackButton.tsx
// と同じロジック。HeroScreenのonBackから直接呼べる関数版)。
export function goBackOrReplace(fallbackHref: string): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref as any);
  }
}
