import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

// 都道府県選択(実機フィードバック: 「都道府県の選択は北海道から順にプルダウンで表示できたら
// うれしい」)。CalendarPickerと同じくネイティブモジュールに依存せず、Modal+自前リストで実装する。
export const PREFECTURES = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
];

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PrefecturePicker({ label, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View className="mb-4">
      <Text className="font-body text-caption text-ink-soft mb-1">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="font-body bg-surface border border-line rounded-control px-4 py-3"
      >
        <Text className={`font-body text-body ${value ? 'text-ink' : 'text-ink-soft'}`}>
          {value || placeholder || '選択してください'}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(62,58,52,0.4)' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="bg-surface rounded-card p-4"
            style={{ width: 280, maxWidth: '90%', maxHeight: '70%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView showsVerticalScrollIndicator>
              {PREFECTURES.map((pref) => {
                const selected = value === pref;
                return (
                  <Pressable
                    key={pref}
                    onPress={() => {
                      onChange(pref);
                      setOpen(false);
                    }}
                    className={`px-3 py-3 rounded-control ${selected ? 'bg-accent/15' : ''}`}
                  >
                    <Text
                      className={`font-body text-body ${selected ? 'font-body-medium text-accent-ink' : 'text-ink'}`}
                    >
                      {pref}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable onPress={() => setOpen(false)} className="items-center mt-2 py-2">
              <Text className="font-body text-caption text-ink-soft">閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
