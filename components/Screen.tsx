import { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
};

// ヘッダーなし画面(Stack.Screen options={{ headerShown: false }})専用。
// ヘッダー付き画面はネイティブヘッダーが安全領域を処理してくれるのでこれは使わない。
//
// 注意: Web版ではSafeAreaView自体にpx-6等のpadding系classNameを渡しても効かない
// (safe-area-contextが挿入するインラインpaddingに負けて0pxになる)。
// paddingや横方向のalign指定は必ず子の<View className="flex-1 px-6 ...">側に書くこと。
export function Screen({ children }: Props) {
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} className="flex-1 bg-bg" style={{ flex: 1 }}>
      {children}
    </SafeAreaView>
  );
}
