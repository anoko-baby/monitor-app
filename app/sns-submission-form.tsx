import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { supabase } from '../lib/supabase';

const MAX_URLS = 5;
const URL_RE = /^https?:\/\/.+/i;

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニター側 SNS投稿記録フォーム(仕様書 v1.8 画面一覧7, 3.4.3)。投稿URL(最大5件)+任意メモ。
export default function SnsSubmissionForm() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState('pending');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [cycleLabel, setCycleLabel] = useState('');

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [urls, setUrls] = useState<string[]>(['']);
  const [memo, setMemo] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    load();
  }, [taskId]);

  async function load() {
    setLoading(true);
    setLoadError(null);

    const { data: task } = await supabase
      .from('tasks')
      .select('id, cycle_id, due_date, status')
      .eq('id', taskId)
      .maybeSingle();
    if (!task) {
      setLoadError('タスクが見つかりませんでした');
      setLoading(false);
      return;
    }
    setTaskStatus(task.status);
    setTaskDueDate(task.due_date);

    const { data: cycle } = await supabase
      .from('cycles')
      .select('label, campaign_id')
      .eq('id', task.cycle_id)
      .maybeSingle();
    if (cycle) {
      setCycleLabel(cycle.label);
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('title')
        .eq('id', cycle.campaign_id)
        .maybeSingle();
      setCampaignTitle(campaign?.title ?? '');
    }

    const { data: submission } = await supabase
      .from('submissions')
      .select('id, sns_urls, form_data, version')
      .eq('task_id', taskId)
      .maybeSingle();
    if (submission) {
      setSubmissionId(submission.id);
      setVersion(submission.version);
      const savedUrls = (submission.sns_urls as string[]) ?? [];
      setUrls(savedUrls.length > 0 ? savedUrls : ['']);
      setMemo((submission.form_data as { memo?: string })?.memo ?? '');
    }

    setLoading(false);
  }

  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function addUrlField() {
    if (urls.length >= MAX_URLS) return;
    setUrls((prev) => [...prev, '']);
  }

  function removeUrlField(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setSubmitError(null);

    const filledUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (filledUrls.length === 0) {
      setSubmitError('投稿URLを1件以上入力してください');
      return;
    }
    const invalid = filledUrls.find((u) => !URL_RE.test(u));
    if (invalid) {
      setSubmitError(`URLの形式が正しくありません: ${invalid}`);
      return;
    }

    setSubmitting(true);
    try {
      const isResubmission = taskStatus === 'rejected';
      const newVersion = isResubmission ? version + 1 : version;

      let subId = submissionId;
      if (subId) {
        const { error } = await supabase
          .from('submissions')
          .update({ sns_urls: filledUrls, form_data: { memo }, version: newVersion })
          .eq('id', subId);
        if (error) throw new Error('提出内容の保存に失敗しました');
      } else {
        const { data, error } = await supabase
          .from('submissions')
          .insert({ task_id: taskId, sns_urls: filledUrls, form_data: { memo }, version: newVersion })
          .select('id')
          .single();
        if (error || !data) throw new Error('提出内容の保存に失敗しました');
        subId = data.id;
        setSubmissionId(subId);
      }

      const { data: currentTask } = await supabase
        .from('tasks')
        .select('first_submitted_at')
        .eq('id', taskId)
        .maybeSingle();
      const nowIso = new Date().toISOString();
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          submitted_at: nowIso,
          first_submitted_at: currentTask?.first_submitted_at ?? nowIso,
        })
        .eq('id', taskId);
      if (taskError) throw new Error('タスクの更新に失敗しました');

      setVersion(newVersion);
      setSubmitted(true);
      await load();
    } catch (err: any) {
      setSubmitError(err?.message ?? '提出に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-bg px-6 pt-6">
        <ErrorBanner message={loadError} />
      </View>
    );
  }

  const readOnly = taskStatus === 'approved';

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title-lg text-ink mb-1">{campaignTitle}</Text>
      <Text className="font-body text-caption text-ink-soft mb-4">
        {cycleLabel} ・ {formatDueDate(taskDueDate)}まで
      </Text>

      {readOnly && (
        <Text className="font-body text-caption text-status-approved mb-4">
          確認済みのため編集できません
        </Text>
      )}
      {submitted && !readOnly && (
        <Text className="font-body-medium text-caption text-accent-ink mb-4">提出しました</Text>
      )}

      {urls.map((url, index) => (
        <View key={index} className="flex-row items-end mb-1" style={{ gap: 8 }}>
          <View className="flex-1">
            <TextField
              label={`投稿URL${urls.length > 1 ? `(${index + 1})` : ''}`}
              value={url}
              onChangeText={(text) => updateUrl(index, text)}
              editable={!readOnly}
              placeholder="https://"
              autoCapitalize="none"
            />
          </View>
          {!readOnly && urls.length > 1 && (
            <Pressable onPress={() => removeUrlField(index)} className="mb-4">
              <Text className="font-body text-caption text-status-overdue">削除</Text>
            </Pressable>
          )}
        </View>
      ))}

      {!readOnly && urls.length < MAX_URLS && (
        <Pressable onPress={addUrlField} className="mb-4">
          <Text className="font-body text-caption text-accent-ink">+ URLを追加する</Text>
        </Pressable>
      )}

      <TextField
        label="メモ(任意)"
        value={memo}
        onChangeText={setMemo}
        editable={!readOnly}
        multiline
        numberOfLines={3}
      />

      {submitError && <ErrorBanner message={submitError} />}

      {!readOnly && (
        <AppButton
          label={submitting ? '送信中…' : '提出する'}
          onPress={handleSubmit}
          loading={submitting}
        />
      )}
    </ScrollView>
  );
}
