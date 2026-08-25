import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

type MonitorOption = { id: string; name: string; nickname: string | null };

// お知らせ作成・配信(仕様書 v1.8 3.9)。Phase1は全モニター/個別選択のみ(タグ・グループ配信はPhase2)。
// 送信前に対象人数・対象者一覧のプレビューを必ず表示する。
export default function AdminAnnouncementForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'manual'>('all');

  const [monitorQuery, setMonitorQuery] = useState('');
  const [monitorResults, setMonitorResults] = useState<MonitorOption[]>([]);
  const [monitorSearching, setMonitorSearching] = useState(false);
  const [monitorSearched, setMonitorSearched] = useState(false);
  const [selectedMonitors, setSelectedMonitors] = useState<MonitorOption[]>([]);

  const [previewTargets, setPreviewTargets] = useState<MonitorOption[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function searchMonitors() {
    if (!monitorQuery) return;
    setMonitorSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('role', 'monitor')
      .eq('status', 'active')
      .ilike('name', `%${monitorQuery}%`)
      .limit(20);
    setMonitorResults(data ?? []);
    setMonitorSearching(false);
    setMonitorSearched(true);
  }

  function toggleMonitor(m: MonitorOption) {
    setSelectedMonitors((prev) =>
      prev.some((p) => p.id === m.id) ? prev.filter((p) => p.id !== m.id) : [...prev, m]
    );
  }

  function validate(): string | null {
    if (!title.trim()) return 'タイトルを入力してください';
    if (!body.trim()) return '本文を入力してください';
    if (linkUrl && !linkLabel) return 'リンクボタンのラベルを入力してください';
    if (targetType === 'manual' && selectedMonitors.length === 0) return '配信先のモニターを選択してください';
    return null;
  }

  async function handlePreview() {
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setPreviewLoading(true);

    if (targetType === 'manual') {
      setPreviewTargets(selectedMonitors);
    } else {
      const { data } = await supabase.from('profiles').select('id, name, nickname').eq('role', 'monitor').eq('status', 'active');
      setPreviewTargets(data ?? []);
    }
    setPreviewLoading(false);
  }

  async function handleSend() {
    if (!previewTargets) return;
    setSending(true);
    setFormError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('ログイン情報が確認できませんでした');
      const { data: me } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (!me) throw new Error('プロフィールが見つかりませんでした');

      const { data: announcement, error: announcementError } = await supabase
        .from('announcements')
        .insert({
          title: title.trim(),
          body: body.trim(),
          link_label: linkUrl ? linkLabel.trim() : null,
          link_url: linkUrl ? linkUrl.trim() : null,
          target_type: targetType,
          created_by: me.id,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (announcementError || !announcement) throw new Error('お知らせの作成に失敗しました');

      const { error: targetsError } = await supabase
        .from('announcement_targets')
        .insert(previewTargets.map((m) => ({ announcement_id: announcement.id, monitor_id: m.id })));
      if (targetsError) throw new Error('配信対象の登録に失敗しました');

      await supabase.functions.invoke('notify-dispatch', {
        body: { event: 'announcement_sent', announcementId: announcement.id },
      });

      router.replace('/admin-announcement-list');
    } catch (err: any) {
      setFormError(err?.message ?? '配信に失敗しました');
    } finally {
      setSending(false);
    }
  }

  if (previewTargets) {
    return (
      <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
        <Text className="font-heading text-title-lg text-ink mb-4">配信内容の確認</Text>

        <View className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-4">
          <Text className="font-body-medium text-body text-ink mb-1">{title}</Text>
          <Text className="font-body text-caption text-ink-soft">{body}</Text>
          {linkUrl && (
            <Text className="font-body text-caption text-accent-ink mt-2">
              {linkLabel} → {linkUrl}
            </Text>
          )}
        </View>

        <Text className="font-body-medium text-body text-ink mb-2">
          配信対象: {previewTargets.length}名
        </Text>
        {previewTargets.map((m) => (
          <Text key={m.id} className="font-body text-caption text-ink-soft mb-1">
            {m.name}
            {m.nickname ? `(${m.nickname})` : ''}
          </Text>
        ))}
        {previewTargets.length === 0 && (
          <Text className="font-body text-caption text-status-overdue mb-1">配信対象がいません</Text>
        )}

        {formError && <ErrorBanner message={formError} />}

        <View className="mt-6" style={{ gap: 8 }}>
          <AppButton
            label={sending ? '配信中…' : 'この内容で配信する'}
            onPress={handleSend}
            loading={sending}
            disabled={previewTargets.length === 0}
          />
          <AppButton label="戻って修正する" variant="secondary" onPress={() => setPreviewTargets(null)} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextField label="タイトル" value={title} onChangeText={setTitle} />
      <TextField label="本文" value={body} onChangeText={setBody} multiline numberOfLines={5} />
      <TextField label="リンクボタンのラベル(任意)" value={linkLabel} onChangeText={setLinkLabel} />
      <TextField
        label="リンクURL(任意)"
        value={linkUrl}
        onChangeText={setLinkUrl}
        autoCapitalize="none"
        placeholder="https://"
      />

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">配信先</Text>
      <View className="flex-row mb-4" style={{ gap: 8 }}>
        <Pressable
          onPress={() => setTargetType('all')}
          className={`flex-1 rounded-control border py-3 items-center ${
            targetType === 'all' ? 'border-accent bg-accent' : 'border-line bg-surface'
          }`}
        >
          <Text className={`font-body-medium ${targetType === 'all' ? 'text-white' : 'text-ink'}`}>
            全モニター
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTargetType('manual')}
          className={`flex-1 rounded-control border py-3 items-center ${
            targetType === 'manual' ? 'border-accent bg-accent' : 'border-line bg-surface'
          }`}
        >
          <Text className={`font-body-medium ${targetType === 'manual' ? 'text-white' : 'text-ink'}`}>
            個別選択
          </Text>
        </Pressable>
      </View>

      {targetType === 'manual' && (
        <>
          {selectedMonitors.length > 0 && (
            <View className="mb-3">
              <Text className="font-body-medium text-caption text-ink-soft mb-2">
                選択中({selectedMonitors.length}名)
              </Text>
              {selectedMonitors.map((m) => (
                <View
                  key={m.id}
                  className="bg-surface rounded-card border-2 border-accent px-4 py-3 mb-2 flex-row items-center justify-between"
                >
                  <Text className="font-body-medium text-body text-ink">✓ {m.name}</Text>
                  <Pressable onPress={() => toggleMonitor(m)} hitSlop={8}>
                    <Text className="font-body text-caption text-status-overdue">削除</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <TextField
            label="モニター名で検索"
            value={monitorQuery}
            onChangeText={(text) => {
              setMonitorQuery(text);
              setMonitorSearched(false);
            }}
            onSubmitEditing={searchMonitors}
            returnKeyType="search"
          />
          <AppButton
            label={monitorSearching ? '検索中…' : '検索する'}
            onPress={searchMonitors}
            disabled={!monitorQuery || monitorSearching}
            loading={monitorSearching}
            variant="secondary"
          />
          {monitorSearched && !monitorSearching && monitorResults.length === 0 && (
            <Text className="font-body text-caption text-ink-soft mt-2">
              該当するモニターが見つかりませんでした
            </Text>
          )}
          {monitorResults.map((m) => {
            const isSelected = selectedMonitors.some((s) => s.id === m.id);
            return (
              <Pressable
                key={m.id}
                onPress={() => toggleMonitor(m)}
                className={`rounded-control border-2 px-4 py-3 mt-2 ${
                  isSelected ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text className={`font-body ${isSelected ? 'text-white' : 'text-ink'}`}>
                  {isSelected ? '✓ ' : ''}
                  {m.name}
                  {m.nickname ? `(${m.nickname})` : ''}
                </Text>
              </Pressable>
            );
          })}
        </>
      )}

      {formError && <ErrorBanner message={formError} />}
      <View className="mt-4">
        <AppButton label={previewLoading ? '確認中…' : '配信内容を確認する'} onPress={handlePreview} loading={previewLoading} />
      </View>
    </ScrollView>
  );
}
