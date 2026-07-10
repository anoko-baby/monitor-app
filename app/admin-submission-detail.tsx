import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { formatCampaignNo, formatCycleFolderName } from '../lib/campaigns';
import { createDropboxSharedLink } from '../lib/dropbox';
import { getThumbnailSignedUrl } from '../lib/mediaPipeline';
import { supabase } from '../lib/supabase';

type FileRow = {
  id: string;
  kind: 'photo' | 'video';
  dropboxSharedUrl: string | null;
  thumbUrl: string | null;
  originalFilename: string | null;
  isStarred: boolean;
};

type FieldAnswer = { label: string; value: string };

type ReviewLogRow = {
  id: string;
  action: 'approved' | 'rejected';
  comment: string | null;
  newDueDate: string | null;
  actorName: string;
  createdAt: string;
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '未提出',
  submitted: '提出済',
  approved: '確認済',
  rejected: '差し戻し',
  cancelled: 'キャンセル',
};

// 提出詳細・検収(仕様書 v1.8 画面一覧6, 3.5)。taskIdはデータ/SNSどちらのタスクでも受け付ける。
export default function AdminSubmissionDetail() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [taskType, setTaskType] = useState<'media' | 'sns'>('media');
  const [taskStatus, setTaskStatus] = useState('pending');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [campaignNo, setCampaignNo] = useState(0);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [monitorName, setMonitorName] = useState('');
  const [cycleLabel, setCycleLabel] = useState('');
  const [skuInfo, setSkuInfo] = useState<{ sku: string | null; size: string | null; color: string | null }[]>([]);
  const [dropboxFolderPath, setDropboxFolderPath] = useState<string | null>(null);

  const [fieldAnswers, setFieldAnswers] = useState<FieldAnswer[]>([]);
  const [snsUrls, setSnsUrls] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [reviewLogs, setReviewLogs] = useState<ReviewLogRow[]>([]);

  const [actorId, setActorId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectDueDate, setRejectDueDate] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingDropbox, setOpeningDropbox] = useState(false);

  useEffect(() => {
    load();
  }, [taskId]);

  async function load() {
    setLoading(true);
    setLoadError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: me } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setActorId(me?.id ?? null);
    }

    const { data: task } = await supabase
      .from('tasks')
      .select('id, type, due_date, status, cycle_id')
      .eq('id', taskId)
      .maybeSingle();
    if (!task) {
      setLoadError('タスクが見つかりませんでした');
      setLoading(false);
      return;
    }
    setTaskType(task.type);
    setTaskStatus(task.status);
    setTaskDueDate(task.due_date);

    const { data: cycle } = await supabase
      .from('cycles')
      .select('id, cycle_no, label, campaign_id')
      .eq('id', task.cycle_id)
      .maybeSingle();
    if (!cycle) {
      setLoadError('回次が見つかりませんでした');
      setLoading(false);
      return;
    }
    setCycleLabel(cycle.label);

    const { data: mediaTask } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('cycle_id', cycle.id)
      .eq('type', 'media')
      .maybeSingle();

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('campaign_no, title, monitor_id, dropbox_base_path')
      .eq('id', cycle.campaign_id)
      .maybeSingle();
    if (campaign) {
      setCampaignNo(campaign.campaign_no);
      setCampaignTitle(campaign.title);
      if (campaign.dropbox_base_path && mediaTask?.due_date) {
        setDropboxFolderPath(
          `${campaign.dropbox_base_path}/${formatCycleFolderName(cycle.cycle_no, mediaTask.due_date)}`
        );
      }

      const { data: monitor } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', campaign.monitor_id)
        .maybeSingle();
      setMonitorName(monitor?.name ?? '(モニター不明)');
    }

    const { data: variantLinks } = await supabase
      .from('campaign_variants')
      .select('variant_id')
      .eq('campaign_id', cycle.campaign_id);
    if (variantLinks && variantLinks.length > 0) {
      const { data: variantsData } = await supabase
        .from('variants')
        .select('sku, size, color')
        .in('id', variantLinks.map((v) => v.variant_id));
      setSkuInfo(variantsData ?? []);
    }

    const { data: submission } = await supabase
      .from('submissions')
      .select('id, form_data, sns_urls')
      .eq('task_id', taskId)
      .maybeSingle();

    if (submission) {
      const formData = (submission.form_data as Record<string, string>) ?? {};
      setMemo(formData.memo ?? '');

      if (task.type === 'media') {
        const { data: fieldRows } = await supabase
          .from('campaign_form_fields')
          .select('form_field_key, form_fields(key, label, unit, sort_order)')
          .eq('campaign_id', cycle.campaign_id);
        const answers = (fieldRows ?? [])
          .map((r: any) => ({
            label: r.form_fields.label,
            value: formData[r.form_fields.key] ?? '',
            unit: r.form_fields.unit,
            sortOrder: r.form_fields.sort_order,
          }))
          .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
          .map((a: any) => ({ label: a.label, value: a.unit ? `${a.value}${a.unit}` : a.value }));
        setFieldAnswers(answers);

        const { data: filesData } = await supabase
          .from('submission_files')
          .select('id, kind, dropbox_shared_url, thumbnail_url, original_filename, is_starred')
          .eq('submission_id', submission.id)
          .order('created_at', { ascending: true });

        const withThumbs = await Promise.all(
          (filesData ?? []).map(async (f) => ({
            id: f.id,
            kind: f.kind,
            dropboxSharedUrl: f.dropbox_shared_url,
            thumbUrl: f.thumbnail_url ? await getThumbnailSignedUrl(f.thumbnail_url) : null,
            originalFilename: f.original_filename,
            isStarred: f.is_starred,
          }))
        );
        setFiles(withThumbs);
      } else {
        setSnsUrls((submission.sns_urls as string[]) ?? []);
      }
    }

    const { data: logs } = await supabase
      .from('review_logs')
      .select('id, action, comment, new_due_date, created_at, actor_id')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id)));
    const { data: actors } = actorIds.length
      ? await supabase.from('profiles').select('id, name').in('id', actorIds)
      : { data: [] as any[] };
    const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.name]));

    setReviewLogs(
      (logs ?? []).map((l) => ({
        id: l.id,
        action: l.action,
        comment: l.comment,
        newDueDate: l.new_due_date,
        actorName: actorNameById.get(l.actor_id) ?? '(不明)',
        createdAt: l.created_at,
      }))
    );

    setLoading(false);
  }

  async function toggleStar(file: FileRow) {
    const nextStarred = !file.isStarred;
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, isStarred: nextStarred } : f)));
    await supabase.from('submission_files').update({ is_starred: nextStarred }).eq('id', file.id);
  }

  async function handleOpenDropboxFolder() {
    if (!dropboxFolderPath) return;
    setOpeningDropbox(true);
    setActionError(null);
    try {
      const url = await createDropboxSharedLink(dropboxFolderPath);
      await Linking.openURL(url);
    } catch (err: any) {
      setActionError(err?.message ?? 'Dropboxリンクの作成に失敗しました');
    } finally {
      setOpeningDropbox(false);
    }
  }

  async function handleApprove() {
    if (!actorId) return;
    setApproving(true);
    setActionError(null);
    try {
      await supabase.from('review_logs').insert({ task_id: taskId, action: 'approved', actor_id: actorId });
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewer_id: actorId })
        .eq('id', taskId);
      if (error) throw new Error('確認済みへの更新に失敗しました');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? '確認済みへの更新に失敗しました');
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!actorId) return;
    if (!rejectComment.trim()) {
      setActionError('差し戻しコメントを入力してください');
      return;
    }
    if (!rejectDueDate) {
      setActionError('新しい提出期限を入力してください');
      return;
    }
    setRejecting(true);
    setActionError(null);
    try {
      await supabase.from('review_logs').insert({
        task_id: taskId,
        action: 'rejected',
        comment: rejectComment.trim(),
        new_due_date: rejectDueDate,
        actor_id: actorId,
      });
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'rejected',
          due_date: rejectDueDate,
          reviewed_at: new Date().toISOString(),
          reviewer_id: actorId,
        })
        .eq('id', taskId);
      if (error) throw new Error('差し戻しの更新に失敗しました');
      setRejectModalOpen(false);
      setRejectComment('');
      setRejectDueDate('');
      await load();
    } catch (err: any) {
      setActionError(err?.message ?? '差し戻しの更新に失敗しました');
    } finally {
      setRejecting(false);
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

  const canReview = taskStatus === 'submitted';

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-body text-caption text-ink-soft mb-1">{formatCampaignNo(campaignNo)}</Text>
      <Text className="font-heading text-title-lg text-ink mb-1">{campaignTitle}</Text>
      <Text className="font-body text-caption text-ink-soft mb-1">
        {monitorName} ・ {cycleLabel} ・ {taskType === 'media' ? 'データ提出' : 'SNS投稿'}
      </Text>
      <Text className="font-body text-caption text-ink-soft mb-4">
        期限: {taskDueDate} ・ ステータス: {TASK_STATUS_LABEL[taskStatus]}
      </Text>

      {skuInfo.length > 0 && taskType === 'media' && (
        <Text className="font-body text-caption text-ink-soft mb-4">
          {skuInfo.map((s) => [s.sku, s.size, s.color].filter(Boolean).join(' / ')).join(' , ')}
        </Text>
      )}

      {dropboxFolderPath && (
        <View className="mb-4">
          <AppButton
            label={openingDropbox ? '開いています…' : 'Dropboxフォルダを開く'}
            onPress={handleOpenDropboxFolder}
            loading={openingDropbox}
            variant="secondary"
          />
        </View>
      )}

      {taskType === 'media' ? (
        <>
          <Text className="font-body-medium text-body text-ink mb-2">提出ファイル</Text>
          <View className="flex-row flex-wrap mb-4" style={{ gap: 2 }}>
            {files.map((f) => (
              <Pressable key={f.id} onPress={() => toggleStar(f)} style={{ width: 96, height: 96 }}>
                {f.thumbUrl && (
                  <Image source={{ uri: f.thumbUrl }} style={{ width: 96, height: 96, borderRadius: 8 }} />
                )}
                <Text
                  className={`font-body text-title absolute top-1 right-1 ${
                    f.isStarred ? 'text-status-rejected' : 'text-white'
                  }`}
                >
                  ★
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="font-body-medium text-body text-ink mb-2">フォーム回答</Text>
          {fieldAnswers.map((a) => (
            <View key={a.label} className="flex-row justify-between mb-1">
              <Text className="font-body text-caption text-ink-soft">{a.label}</Text>
              <Text className="font-body text-caption text-ink">{a.value || '-'}</Text>
            </View>
          ))}
        </>
      ) : (
        <>
          <Text className="font-body-medium text-body text-ink mb-2">投稿URL</Text>
          {snsUrls.map((url, i) => (
            <Pressable key={i} onPress={() => Linking.openURL(url)} className="mb-1">
              <Text className="font-body text-caption text-accent-ink" numberOfLines={1}>
                {url}
              </Text>
            </Pressable>
          ))}
          {memo ? (
            <Text className="font-body text-caption text-ink-soft mt-2">メモ: {memo}</Text>
          ) : null}
        </>
      )}

      {actionError && <ErrorBanner message={actionError} />}

      {canReview && (
        <View className="mt-6" style={{ gap: 8 }}>
          <AppButton
            label={approving ? '更新中…' : '確認済みにする'}
            onPress={handleApprove}
            loading={approving}
          />
          <AppButton label="差し戻す" onPress={() => setRejectModalOpen(true)} variant="secondary" />
        </View>
      )}

      <Text className="font-body-medium text-body text-ink mt-8 mb-3">差し戻し履歴</Text>
      {reviewLogs.length === 0 && (
        <Text className="font-body text-caption text-ink-soft">履歴はありません</Text>
      )}
      {reviewLogs.map((log) => (
        <View key={log.id} className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2">
          <Text className="font-body-medium text-caption text-ink">
            {log.action === 'approved' ? '確認済み' : '差し戻し'} ・ {log.actorName} ・{' '}
            {log.createdAt.slice(0, 10)}
          </Text>
          {log.comment && <Text className="font-body text-caption text-ink-soft mt-1">{log.comment}</Text>}
          {log.newDueDate && (
            <Text className="font-body text-caption text-ink-soft">新しい期限: {log.newDueDate}</Text>
          )}
        </View>
      ))}

      <Modal visible={rejectModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/40 items-center justify-center px-6">
          <View className="bg-surface rounded-card p-4 w-full">
            <Text className="font-body-medium text-body text-ink mb-3">差し戻す</Text>
            <TextField
              label="差し戻しコメント(必須)"
              value={rejectComment}
              onChangeText={setRejectComment}
              multiline
              numberOfLines={3}
            />
            <TextField
              label="新しい提出期限(必須・YYYY-MM-DD)"
              value={rejectDueDate}
              onChangeText={setRejectDueDate}
              placeholder="2026-08-20"
            />
            {actionError && <ErrorBanner message={actionError} />}
            <View style={{ gap: 8 }}>
              <AppButton label={rejecting ? '送信中…' : '差し戻す'} onPress={handleReject} loading={rejecting} />
              <AppButton
                label="キャンセル"
                variant="secondary"
                onPress={() => {
                  setRejectModalOpen(false);
                  setActionError(null);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
