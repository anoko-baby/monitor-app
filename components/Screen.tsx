import { ReactNode } from 'react';
import { ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  className?: string;
  style?: ViewStyle;
};

// ヘッダーなし画面(Stack.Screen options={{ headerShown: false }})専用。
// ヘッダー付き画面はネイティブヘッダーが安全領域を処理してくれるのでこれは使わない。
export function Screen({ children, className, style }: Props) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      className={`flex-1 bg-bg ${className ?? ''}`}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </SafeAreaView>
  );
}
