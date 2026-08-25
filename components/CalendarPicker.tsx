import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

// カレンダー形式の日付/年月選択(仕様書には無いが、実機フィードバックでYYYY-MM-DD手入力が
// 使いにくいとの指摘を受けて追加)。ネイティブモジュールに依存せずWeb/ネイティブ両方で
// 同じ見た目・挙動になるよう、Modal+グリッドで自前実装している。
//
// mode='date': 年月日(YYYY-MM-DD)を選ぶ。撮影日など。
// mode='month': 年月(YYYY-MM)のみを選ぶ(日は常に01固定)。子どもの生年月など。

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  mode?: 'date' | 'month';
  editable?: boolean;
  placeholder?: string;
  maxDate?: string;
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseValue(value: string | null): { year: number; month: number; day: number } {
  if (value) {
    const [y, m, d] = value.split('-').map(Number);
    if (y && m) return { year: y, month: m, day: d || 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function formatDisplay(value: string | null, mode: 'date' | 'month'): string {
  if (!value) return '';
  const { year, month, day } = parseValue(value);
  return mode === 'month' ? `${year}年${month}月` : `${year}年${month}月${day}日`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function CalendarPicker({ label, value, onChange, mode = 'date', editable = true, placeholder, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const initial = parseValue(value);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  function openPicker() {
    if (!editable) return;
    const p = parseValue(value);
    setViewYear(p.year);
    setViewMonth(p.month);
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  function shiftYear(delta: number) {
    setViewYear(viewYear + delta);
  }

  function selectDay(day: number) {
    const candidate = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
    if (maxDate && candidate > maxDate) return;
    onChange(candidate);
    setOpen(false);
  }

  function selectMonth(month: number) {
    onChange(`${viewYear}-${pad2(month)}-01`);
    setOpen(false);
  }

  const dim = daysInMonth(viewYear, viewMonth);
  const startWeekday = firstWeekday(viewYear, viewMonth);
  const dayCells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  const selected = value ? parseValue(value) : null;
  const isSelectedMonth = selected && selected.year === viewYear && selected.month === viewMonth;

  return (
    <View className="mb-4">
      <Text className="font-body text-caption text-ink-soft mb-1">{label}</Text>
      <Pressable
        onPress={openPicker}
        disabled={!editable}
        className="font-body bg-surface border border-line rounded-control px-4 py-3"
      >
        <Text className={`font-body text-body ${value ? 'text-ink' : 'text-ink-soft'}`}>
          {value ? formatDisplay(value, mode) : placeholder ?? '選択してください'}
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
            style={{ width: 320, maxWidth: '90%' }}
            onPress={(e) => e.stopPropagation()}
          >
            {mode === 'date' ? (
              <>
                <View className="flex-row items-center justify-between mb-3">
                  <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} className="px-3 py-1">
                    <Text className="font-body-medium text-body text-ink">‹</Text>
                  </Pressable>
                  <Text className="font-body-medium text-body text-ink">
                    {viewYear}年{viewMonth}月
                  </Text>
                  <Pressable onPress={() => shiftMonth(1)} hitSlop={8} className="px-3 py-1">
                    <Text className="font-body-medium text-body text-ink">›</Text>
                  </Pressable>
                </View>
                <View className="flex-row mb-1">
                  {WEEKDAYS.map((w) => (
                    <View key={w} style={{ width: '14.28%' }} className="items-center py-1">
                      <Text className="font-body text-tiny text-ink-soft">{w}</Text>
                    </View>
                  ))}
                </View>
                <View className="flex-row flex-wrap">
                  {dayCells.map((day, idx) => {
                    if (day === null) return <View key={`blank-${idx}`} style={{ width: '14.28%', height: 40 }} />;
                    const candidate = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`;
                    const isSelected = value === candidate;
                    const disabled = !!maxDate && candidate > maxDate;
                    return (
                      <View key={day} style={{ width: '14.28%', height: 40 }} className="items-center justify-center">
                        <Pressable
                          onPress={() => selectDay(day)}
                          disabled={disabled}
                          style={{ width: 32, height: 32 }}
                          className={`items-center justify-center rounded-full ${isSelected ? 'bg-accent' : ''}`}
                        >
                          <Text
                            className={`font-body text-caption ${
                              disabled ? 'text-ink-soft opacity-40' : isSelected ? 'text-white' : 'text-ink'
                            }`}
                          >
                            {day}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View className="flex-row items-center justify-between mb-3">
                  <Pressable onPress={() => shiftYear(-1)} hitSlop={8} className="px-3 py-1">
                    <Text className="font-body-medium text-body text-ink">‹</Text>
                  </Pressable>
                  <Text className="font-body-medium text-body text-ink">{viewYear}年</Text>
                  <Pressable onPress={() => shiftYear(1)} hitSlop={8} className="px-3 py-1">
                    <Text className="font-body-medium text-body text-ink">›</Text>
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap">
                  {MONTH_LABELS.map((label2, idx) => {
                    const month = idx + 1;
                    const isSelected = !!isSelectedMonth && selected!.month === month;
                    return (
                      <View key={month} style={{ width: '33.33%' }} className="p-1">
                        <Pressable
                          onPress={() => selectMonth(month)}
                          className={`items-center justify-center rounded-control py-3 ${
                            isSelected ? 'bg-accent' : 'bg-bg'
                          }`}
                        >
                          <Text className={`font-body text-caption ${isSelected ? 'text-white' : 'text-ink'}`}>
                            {label2}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <Pressable onPress={() => setOpen(false)} className="items-center mt-3 py-2">
              <Text className="font-body text-caption text-ink-soft">閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
