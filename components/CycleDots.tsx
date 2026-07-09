import { View } from 'react-native';

import { CycleDotStatus } from '../lib/campaigns';

const DOT_SIZE = 14;

// 仕様書 v1.8 14.4: 繰り返し案件の回次進捗を、ベビー服のスナップボタンをモチーフにしたドットで表現する。
// 完了=塗り+凹み / 提出済=塗り+リング / 未提出=輪郭のみ / 期限超過=赤輪郭 / キャンセル=打ち消し斜線
function Dot({ status }: { status: CycleDotStatus }) {
  if (status === 'completed') {
    return (
      <View
        className="bg-accent items-center justify-center"
        style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }}
      >
        <View className="bg-bg" style={{ width: 4, height: 4, borderRadius: 2 }} />
      </View>
    );
  }

  if (status === 'submitted') {
    return (
      <View
        className="border-2 border-status-submitted items-center justify-center"
        style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }}
      >
        <View
          className="bg-status-submitted"
          style={{ width: DOT_SIZE - 6, height: DOT_SIZE - 6, borderRadius: (DOT_SIZE - 6) / 2 }}
        />
      </View>
    );
  }

  if (status === 'overdue') {
    return (
      <View
        className="border-2 border-status-overdue"
        style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }}
      />
    );
  }

  if (status === 'cancelled') {
    return (
      <View
        className="border border-line items-center justify-center"
        style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }}
      >
        <View
          className="bg-line"
          style={{ width: DOT_SIZE - 2, height: 1.5, transform: [{ rotate: '45deg' }] }}
        />
      </View>
    );
  }

  // pending(未提出)
  return (
    <View
      className="border border-line"
      style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2 }}
    />
  );
}

export function CycleDots({ statuses }: { statuses: CycleDotStatus[] }) {
  return (
    <View className="flex-row" style={{ gap: 6 }}>
      {statuses.map((status, index) => (
        <Dot key={index} status={status} />
      ))}
    </View>
  );
}
