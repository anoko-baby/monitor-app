import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '../lib/supabase';
import { AppButton } from './AppButton';
import { ErrorBanner } from './ErrorBanner';
import { TextField } from './TextField';

// birth_month はDB上は date 型(年月日)。"YYYY-MM" 入力を月初日に正規化して保存する。
function normalizeBirthMonth(input: string): { value: string | null; error: string | null } {
  const trimmed = input.trim();
  if (!trimmed) return { value: null, error: null };
  if (/^\d{4}-\d{2}$/.test(trimmed)) return { value: `${trimmed}-01`, error: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { value: trimmed, error: null };
  return { value: null, error: '生年月は YYYY-MM の形式で入力してください(例: 2024-05)' };
}

type Child = {
  id: string;
  call_name: string;
  birth_month: string | null;
  sex: 'male' | 'female' | null;
};

export function ChildrenManager({ monitorId }: { monitorId: string }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBirthMonth, setNewBirthMonth] = useState('');
  const [newSex, setNewSex] = useState<'male' | 'female' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadChildren() {
    setLoading(true);
    const { data } = await supabase
      .from('children')
      .select('id, call_name, birth_month, sex')
      .eq('monitor_id', monitorId)
      .order('created_at', { ascending: true });
    setChildren(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorId]);

  async function handleAdd() {
    if (!newName) return;

    const { value: birthMonth, error: formatError } = normalizeBirthMonth(newBirthMonth);
    if (formatError) {
      setError(formatError);
      return;
    }

    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('children').insert({
      monitor_id: monitorId,
      call_name: newName,
      birth_month: birthMonth,
      sex: newSex,
    });

    setSaving(false);

    if (insertError) {
      setError('登録に失敗しました。もう一度お試しください。');
      return;
    }

    setNewName('');
    setNewBirthMonth('');
    setNewSex(null);
    setAdding(false);
    loadChildren();
  }

  async function handleDelete(id: string) {
    const { error: deleteError } = await supabase.from('children').delete().eq('id', id);
    if (deleteError) {
      setError('削除に失敗しました。もう一度お試しください。');
      return;
    }
    loadChildren();
  }

  return (
    <View>
      <Text className="font-body-medium text-body text-ink mb-3">子ども情報</Text>

      {loading && <Text className="font-body text-caption text-ink-soft mb-3">読み込み中…</Text>}

      {!loading && children.length === 0 && (
        <Text className="font-body text-caption text-ink-soft mb-3">まだ登録されていません</Text>
      )}

      {children.map((child) => (
        <View
          key={child.id}
          className="flex-row items-center justify-between bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2"
        >
          <View>
            <Text className="font-body text-body text-ink">{child.call_name}</Text>
            <Text className="font-body text-caption text-ink-soft">
              {child.birth_month ?? '生年月未設定'}
              {child.sex ? (child.sex === 'male' ? ' ・ 男の子' : ' ・ 女の子') : ''}
            </Text>
          </View>
          <Pressable onPress={() => handleDelete(child.id)}>
            <Text className="font-body text-caption text-status-overdue">削除</Text>
          </Pressable>
        </View>
      ))}

      {error && <ErrorBanner message={error} />}

      {adding ? (
        <View className="bg-surface rounded-card border-hairline border-line p-4 mt-2">
          <TextField label="呼び名" value={newName} onChangeText={setNewName} />
          <TextField
            label="生年月(例: 2024-05)"
            value={newBirthMonth}
            onChangeText={setNewBirthMonth}
            placeholder="YYYY-MM"
          />

          <Text className="font-body text-caption text-ink-soft mb-2">性別(任意)</Text>
          <View className="flex-row mb-4">
            {(['male', 'female'] as const).map((sex) => (
              <Pressable
                key={sex}
                onPress={() => setNewSex(newSex === sex ? null : sex)}
                className={`rounded-full px-4 py-2 mr-2 border ${
                  newSex === sex ? 'bg-accent border-accent' : 'border-line'
                }`}
              >
                <Text
                  className={`font-body text-caption ${newSex === sex ? 'text-white' : 'text-ink'}`}
                >
                  {sex === 'male' ? '男の子' : '女の子'}
                </Text>
              </Pressable>
            ))}
          </View>

          <AppButton
            label={saving ? '追加中…' : '追加する'}
            onPress={handleAdd}
            disabled={!newName}
            loading={saving}
          />
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} className="items-center mt-1">
          <Text className="font-body text-caption text-accent-ink">+ 子どもを追加する</Text>
        </Pressable>
      )}
    </View>
  );
}
