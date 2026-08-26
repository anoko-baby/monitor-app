import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { CalendarPicker } from '../components/CalendarPicker';
import { ErrorBanner } from '../components/ErrorBanner';
import { HeroScreen } from '../components/HeroScreen';
import { TextField } from '../components/TextField';
import {
  childDisplayName,
  computeAgeLabel,
  formatCycleFolderName,
  formatSubmissionFileName,
  todayDateString,
  variantLabel,
} from '../lib/campaigns';
import { getThumbnailSignedUrl, processAndUploadFile } from '../lib/mediaPipeline';
import { goBackOrReplace } from '../lib/navigation';
import { supabase } from '../lib/supabase';
import { clearDraft, DraftFile, loadDraft, saveDraft } from '../lib/submissionDraft';

const MAX_PHOTOS = 30;
const MAX_PHOTO_SIZE = 50 * 1024 * 1024;
const MAX_VIDEOS = 5;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;

type FieldDef = {
  key: string;
  label: string;
  input_type: 'date' | 'number' | 'select' | 'text';
  unit: string | null;
  options: string[] | null;
  is_required: boolean;
};

type ChildOption = { id: string; call_name: string; birth_month: string | null };
type VariantOption = { id: string; title: string | null; sku: string | null; size: string | null; color: string | null };

type ExistingFile = {
  id: string;
  kind: 'photo' | 'video';
  original_filename: string | null;
  thumbnail_url: string | null;
  signedThumbUrl: string | null;
};

function formatDueDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

// モニター側 データ提出フォームの本体(仕様書 v1.8 画面一覧6)。ファイル選択+動的フォーム項目+
// 複数の子ども(登録済みchildrenから複数選択)ごとの着用バリエーション/身長体重等/年齢の記録。
// 単独ルートでもmonitor-homeの「あなたの案件」シート内埋め込みでも使う共通コンポーネント。
export function SubmissionFormContent({ taskId }: { taskId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [taskStatus, setTaskStatus] = useState<string>('pending');
  const [rejectComment, setRejectComment] = useState<string | null>(null);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [cycleLabel, setCycleLabel] = useState('');
  const [cycleNo, setCycleNo] = useState(0);
  const [dropboxBasePath, setDropboxBasePath] = useState<string | null>(null);
  const [campaignVariants, setCampaignVariants] = useState<VariantOption[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [wifiOnly, setWifiOnly] = useState(false);

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [childFieldValues, setChildFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [childVariantIds, setChildVariantIds] = useState<Record<string, string[]>>({});
  const [submissionChildRowIds, setSubmissionChildRowIds] = useState<Record<string, string>>({});

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [pendingFiles, setPendingFiles] = useState<DraftFile[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const sequenceCounterRef = useRef(0);
  const submissionIdRef = useRef<string | null>(null);
  const cycleNoRef = useRef(0);
  const dueDateRef = useRef('');
  const basePathRef = useRef<string | null>(null);

  useEffect(() => {
    load();
  }, [taskId]);

  useEffect(() => {
    if (loading) return;
    saveDraft(taskId, {
      formValues: fieldValues,
      files: pendingFiles,
      updatedAt: new Date().toISOString(),
      selectedChildIds,
      childFieldValues,
      childVariantIds,
    });
  }, [fieldValues, pendingFiles, selectedChildIds, childFieldValues, childVariantIds, loading]);

  useEffect(() => {
    if (!wifiOnly) return;
    const sub = Network.addNetworkStateListener(({ type }) => {
      if (type === Network.NetworkStateType.WIFI) {
        pendingFiles.filter((f) => f.status === 'pending').forEach((f) => startProcessing(f));
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wifiOnly, pendingFiles]);

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
    dueDateRef.current = task.due_date;

    if (task.status === 'rejected') {
      const { data: latestLog } = await supabase
        .from('review_logs')
        .select('comment')
        .eq('task_id', taskId)
        .eq('action', 'rejected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setRejectComment(latestLog?.comment ?? null);
    }

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
    setCycleNo(cycle.cycle_no);
    cycleNoRef.current = cycle.cycle_no;

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, title, dropbox_base_path, child_id')
      .eq('id', cycle.campaign_id)
      .maybeSingle();
    if (campaign) {
      setCampaignTitle(campaign.title);
      setDropboxBasePath(campaign.dropbox_base_path);
      basePathRef.current = campaign.dropbox_base_path;
    }

    const { data: variantLinks } = await supabase
      .from('campaign_variants')
      .select('variant_id')
      .eq('campaign_id', cycle.campaign_id);
    if (variantLinks && variantLinks.length > 0) {
      const { data: variantsData } = await supabase
        .from('variants')
        .select('id, title, sku, size, color')
        .in('id', variantLinks.map((v) => v.variant_id));
      setCampaignVariants(variantsData ?? []);
    }

    const { data: fieldRows } = await supabase
      .from('campaign_form_fields')
      .select('form_field_key, is_required, form_fields(key, label, input_type, unit, options, sort_order)')
      .eq('campaign_id', cycle.campaign_id);
    const defs: FieldDef[] = (fieldRows ?? [])
      .map((r: any) => ({
        key: r.form_fields.key,
        label: r.form_fields.label,
        input_type: r.form_fields.input_type,
        unit: r.form_fields.unit,
        options: r.form_fields.options,
        is_required: r.is_required,
        sortOrder: r.form_fields.sort_order,
      }))
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    setFieldDefs(defs);

    let profileId: string | null = null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, wifi_only_upload')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      profileId = profile?.id ?? null;
      // Web版はブラウザがWi-Fi/モバイル回線を区別できないため、この設定は無視して常にアップロードする
      setWifiOnly(Platform.OS === 'web' ? false : profile?.wifi_only_upload ?? false);
    }

    if (profileId) {
      const { data: childrenData } = await supabase
        .from('children')
        .select('id, call_name, birth_month')
        .eq('monitor_id', profileId)
        .order('created_at', { ascending: true });
      setChildren(childrenData ?? []);
    }

    const { data: submission } = await supabase
      .from('submissions')
      .select('id, form_data, version')
      .eq('task_id', taskId)
      .maybeSingle();

    let existingCount = 0;
    if (submission) {
      setSubmissionId(submission.id);
      submissionIdRef.current = submission.id;
      setVersion(submission.version);
      setFieldValues((submission.form_data as Record<string, string>) ?? {});

      const { data: existingChildren } = await supabase
        .from('submission_children')
        .select('id, child_id, form_data')
        .eq('submission_id', submission.id);

      if (existingChildren && existingChildren.length > 0) {
        setSelectedChildIds(existingChildren.map((r) => r.child_id));
        const rowIds: Record<string, string> = {};
        const values: Record<string, Record<string, string>> = {};
        for (const r of existingChildren) {
          rowIds[r.child_id] = r.id;
          values[r.child_id] = (r.form_data as Record<string, string>) ?? {};
        }
        setSubmissionChildRowIds(rowIds);
        setChildFieldValues(values);

        const scIds = existingChildren.map((r) => r.id);
        const { data: existingVariants } = await supabase
          .from('submission_child_variants')
          .select('submission_child_id, variant_id')
          .in('submission_child_id', scIds);
        const childIdByScId = new Map(existingChildren.map((r) => [r.id, r.child_id]));
        const variantMap: Record<string, string[]> = {};
        for (const v of existingVariants ?? []) {
          const childId = childIdByScId.get(v.submission_child_id);
          if (!childId) continue;
          variantMap[childId] = [...(variantMap[childId] ?? []), v.variant_id];
        }
        setChildVariantIds(variantMap);
      } else if (campaign?.child_id) {
        setSelectedChildIds([campaign.child_id]);
      }

      const { data: filesData } = await supabase
        .from('submission_files')
        .select('id, kind, original_filename, thumbnail_url')
        .eq('submission_id', submission.id);

      const withSigned = await Promise.all(
        (filesData ?? []).map(async (f) => ({
          ...f,
          signedThumbUrl: f.thumbnail_url ? await getThumbnailSignedUrl(f.thumbnail_url) : null,
        }))
      );
      setExistingFiles(withSigned as ExistingFile[]);
      existingCount = withSigned.length;
    } else if (campaign?.child_id) {
      setSelectedChildIds([campaign.child_id]);
    }

    const draft = await loadDraft(taskId);
    if (draft) {
      setFieldValues((prev) => ({ ...prev, ...draft.formValues }));
      if (draft.selectedChildIds) setSelectedChildIds(draft.selectedChildIds);
      if (draft.childFieldValues) setChildFieldValues((prev) => ({ ...prev, ...draft.childFieldValues }));
      if (draft.childVariantIds) setChildVariantIds((prev) => ({ ...prev, ...draft.childVariantIds }));
      const restoredFiles = draft.files.map((f) =>
        f.status === 'done' || f.status === 'error' ? f : { ...f, status: 'pending' as const }
      );
      setPendingFiles(restoredFiles);
      sequenceCounterRef.current = existingCount + restoredFiles.length;
    } else {
      sequenceCounterRef.current = existingCount;
    }

    setLoading(false);
  }

  function setFieldValue(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleChild(childId: string) {
    setSelectedChildIds((prev) => (prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]));
  }

  function setChildFieldValue(childId: string, key: string, value: string) {
    setChildFieldValues((prev) => ({ ...prev, [childId]: { ...(prev[childId] ?? {}), [key]: value } }));
  }

  function toggleChildVariant(childId: string, variantId: string) {
    setChildVariantIds((prev) => {
      const current = prev[childId] ?? [];
      const next = current.includes(variantId)
        ? current.filter((id) => id !== variantId)
        : [...current, variantId];
      return { ...prev, [childId]: next };
    });
  }

  async function ensureSubmissionId(): Promise<string> {
    if (submissionIdRef.current) return submissionIdRef.current;
    const { data, error } = await supabase
      .from('submissions')
      .insert({ task_id: taskId, form_data: {}, sns_urls: [] })
      .select('id')
      .single();
    if (error || !data) throw new Error('提出データの初期化に失敗しました');
    submissionIdRef.current = data.id;
    setSubmissionId(data.id);
    return data.id;
  }

  function updateFile(key: string, patch: Partial<DraftFile>) {
    setPendingFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  async function startProcessing(file: DraftFile) {
    if (wifiOnly) {
      const state = await Network.getNetworkStateAsync();
      if (state.type !== Network.NetworkStateType.WIFI) {
        updateFile(file.key, { status: 'pending' });
        return;
      }
    }

    updateFile(file.key, { status: 'processing', errorMessage: undefined });
    try {
      const subId = await ensureSubmissionId();
      const fileName = formatSubmissionFileName(cycleNoRef.current, file.sequenceNo, file.originalFilename);
      const folder = formatCycleFolderName(cycleNoRef.current, dueDateRef.current);
      const destPath = `${basePathRef.current}/${folder}/${fileName}`;

      updateFile(file.key, { status: 'uploading' });
      const result = await processAndUploadFile({
        asset: {
          uri: file.localUri,
          fileName: file.originalFilename,
          fileSize: file.fileSize,
          mimeType: null,
          kind: file.kind,
          width: null,
          height: null,
          durationMs: file.durationMs,
        },
        submissionId: subId,
        dropboxDestPath: destPath,
      });
      updateFile(file.key, {
        status: 'done',
        dropboxPath: result.dropboxPath,
        dropboxSharedUrl: result.dropboxSharedUrl,
        thumbnailPath: result.thumbnailPath,
        durationSec: result.durationSec ?? undefined,
      });
    } catch (err: any) {
      updateFile(file.key, { status: 'error', errorMessage: err?.message ?? 'アップロードに失敗しました' });
    }
  }

  async function pickFiles(kind: 'photo' | 'video') {
    setSubmitError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSubmitError(`${kind === 'photo' ? '写真' : '動画'}へのアクセス許可が必要です`);
      return;
    }

    const existingCount = existingFiles.filter((f) => f.kind === kind).length;
    const pendingCount = pendingFiles.filter((f) => f.kind === kind && f.status !== 'error').length;
    const max = kind === 'photo' ? MAX_PHOTOS : MAX_VIDEOS;
    const remaining = max - existingCount - pendingCount;
    if (remaining <= 0) {
      setSubmitError(`${kind === 'photo' ? '写真' : '動画'}は1回次あたり最大${max}点までです`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['videos'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled) return;

    const maxSize = kind === 'photo' ? MAX_PHOTO_SIZE : MAX_VIDEO_SIZE;
    const subId = await ensureSubmissionId();

    for (const asset of result.assets) {
      const fileName =
        asset.fileName ?? `${kind}_${sequenceCounterRef.current + 1}.${kind === 'photo' ? 'jpg' : 'mov'}`;
      const fileSize = asset.fileSize ?? 0;
      if (fileSize > maxSize) {
        setSubmitError(
          `${fileName}は上限(${kind === 'photo' ? '50MB' : '2GB'})を超えているため追加できません`
        );
        continue;
      }

      sequenceCounterRef.current += 1;
      const draftFile: DraftFile = {
        key: `${Date.now()}_${sequenceCounterRef.current}`,
        localUri: asset.uri,
        kind,
        originalFilename: fileName,
        fileSize,
        durationMs: asset.duration ? Math.round(asset.duration * 1000) : null,
        sequenceNo: sequenceCounterRef.current,
        status: 'pending',
      };
      setPendingFiles((prev) => [...prev, draftFile]);
      startProcessing(draftFile);
    }
    void subId;
  }

  function removeFile(key: string) {
    setPendingFiles((prev) => prev.filter((f) => f.key !== key));
  }

  async function removeExistingFile(fileId: string) {
    setSubmitError(null);
    const { error } = await supabase.from('submission_files').delete().eq('id', fileId);
    if (error) {
      setSubmitError(`ファイルの削除に失敗しました: ${error.message}`);
      return;
    }
    setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  const shotDateField = fieldDefs.find((f) => f.key === 'shot_date');
  const childFieldDefs = fieldDefs.filter((f) => f.key !== 'shot_date' && f.key !== 'age_months');
  const selectedChildren = children.filter((c) => selectedChildIds.includes(c.id));

  async function handleSubmit() {
    setSubmitError(null);

    if (shotDateField?.is_required && !fieldValues.shot_date) {
      setSubmitError(`${shotDateField.label}を選択してください`);
      return;
    }

    if (children.length > 0 && selectedChildIds.length === 0) {
      setSubmitError('対象の子どもを選択してください');
      return;
    }

    for (const child of selectedChildren) {
      for (const f of childFieldDefs) {
        if (f.is_required && !childFieldValues[child.id]?.[f.key]) {
          setSubmitError(`${childDisplayName(child.call_name)}の${f.label}を入力してください`);
          return;
        }
      }
    }

    if (pendingFiles.some((f) => f.status !== 'done' && f.status !== 'error')) {
      setSubmitError('アップロード中のファイルがあります。完了までお待ちください');
      return;
    }

    const doneFiles = pendingFiles.filter((f) => f.status === 'done');
    if (existingFiles.length === 0 && doneFiles.length === 0) {
      setSubmitError('写真または動画を1つ以上選択してください');
      return;
    }

    setSubmitting(true);
    try {
      const subId = await ensureSubmissionId();
      const isResubmission = taskStatus !== 'pending';
      const newVersion = isResubmission ? version + 1 : version;

      const { error: subError } = await supabase
        .from('submissions')
        .update({ form_data: fieldValues, version: newVersion })
        .eq('id', subId);
      if (subError) throw new Error('提出内容の保存に失敗しました');

      const removedChildIds = Object.keys(submissionChildRowIds).filter((id) => !selectedChildIds.includes(id));
      if (removedChildIds.length > 0) {
        const { error: removeError } = await supabase
          .from('submission_children')
          .delete()
          .in('id', removedChildIds.map((id) => submissionChildRowIds[id]));
        if (removeError) throw new Error('子ども情報の更新に失敗しました');
      }

      const nextRowIds: Record<string, string> = {};
      for (const child of selectedChildren) {
        const ageMonths =
          child.birth_month && fieldValues.shot_date
            ? computeAgeLabel(child.birth_month, fieldValues.shot_date).months
            : null;
        const formData = childFieldValues[child.id] ?? {};
        const existingRowId = submissionChildRowIds[child.id];

        let rowId = existingRowId;
        if (existingRowId) {
          const { error } = await supabase
            .from('submission_children')
            .update({ age_months: ageMonths, form_data: formData })
            .eq('id', existingRowId);
          if (error) throw new Error('子ども情報の保存に失敗しました');
        } else {
          const { data, error } = await supabase
            .from('submission_children')
            .insert({ submission_id: subId, child_id: child.id, age_months: ageMonths, form_data: formData })
            .select('id')
            .single();
          if (error || !data) throw new Error('子ども情報の保存に失敗しました');
          rowId = data.id;
        }
        nextRowIds[child.id] = rowId!;

        const { error: clearVariantsError } = await supabase
          .from('submission_child_variants')
          .delete()
          .eq('submission_child_id', rowId);
        if (clearVariantsError) throw new Error('着用バリエーションの保存に失敗しました');

        const variantIds = childVariantIds[child.id] ?? [];
        if (variantIds.length > 0) {
          const { error: cvError } = await supabase
            .from('submission_child_variants')
            .insert(variantIds.map((variantId) => ({ submission_child_id: rowId!, variant_id: variantId })));
          if (cvError) throw new Error('着用バリエーションの保存に失敗しました');
        }
      }
      setSubmissionChildRowIds(nextRowIds);

      if (doneFiles.length > 0) {
        const { error: filesError } = await supabase.from('submission_files').insert(
          doneFiles.map((f) => ({
            submission_id: subId,
            kind: f.kind,
            dropbox_path: f.dropboxPath!,
            dropbox_shared_url: f.dropboxSharedUrl!,
            thumbnail_url: f.thumbnailPath ?? null,
            file_size: f.fileSize,
            duration_sec: f.durationSec ?? null,
            original_filename: f.originalFilename,
          }))
        );
        if (filesError) throw new Error('ファイル情報の保存に失敗しました');
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

      await supabase.functions.invoke('notify-dispatch', { body: { event: 'task_submitted', taskId } });

      await clearDraft(taskId);
      setPendingFiles([]);
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
      <View className="flex-1 items-center justify-center py-12">
        <ActivityIndicator color="#7E8F86" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 px-6 pt-6">
        <ErrorBanner message={loadError} />
      </View>
    );
  }

  // 一度提出した(確認待ちの)ファイルは削除できないようにする。下書き中(pending)・差し戻され
  // 再提出中(rejected)の時だけ削除可能(supabase/migrations/...restrict_submission_files_delete...
  // のRLSポリシーと同じ条件に揃える)。確認済み(approved)後も追加提出は何度でもできるようにし、
  // 追加提出すると再度確認待ち(submitted)に戻る(実機フィードバック)。
  const canDeleteFiles = taskStatus === 'pending' || taskStatus === 'rejected';

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
      <Text className="font-heading text-title text-ink mb-1">{campaignTitle}</Text>
      <Text className="font-body text-caption text-ink-soft mb-4">
        {cycleLabel} ・ {formatDueDate(taskDueDate)}まで
      </Text>

      {campaignVariants.length > 0 && (
        <Text className="font-body text-caption text-ink-soft mb-4">
          {campaignVariants.map(variantLabel).join(' , ')}
        </Text>
      )}

      {taskStatus === 'rejected' && rejectComment && (
        <View className="bg-status-overdue/10 rounded-card p-4 mb-4">
          <Text className="font-body-medium text-caption text-status-overdue mb-1">差し戻されました</Text>
          <Text className="font-body text-caption text-status-overdue">{rejectComment}</Text>
        </View>
      )}

      {taskStatus === 'approved' && !submitted && (
        <Text className="font-body text-caption text-status-approved mb-4">
          確認済みです。追加で提出することもできます
        </Text>
      )}

      {submitted && (
        <Text className="font-body-medium text-caption text-accent-ink mb-4">提出しました</Text>
      )}

      {existingFiles.length > 0 && (
        <View className="mb-4">
          <Text className="font-body-medium text-body text-ink mb-2">提出済みのファイル</Text>
          <View className="flex-row flex-wrap" style={{ gap: 2 }}>
            {existingFiles.map((f) => (
              <View key={f.id} style={{ width: 96, height: 96 }} className="rounded-md overflow-hidden bg-line">
                {f.signedThumbUrl && (
                  <Image source={{ uri: f.signedThumbUrl }} style={{ width: 96, height: 96 }} />
                )}
                {canDeleteFiles && (
                  <Pressable
                    onPress={() => removeExistingFile(f.id)}
                    hitSlop={8}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: 'rgba(62,58,52,0.7)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text className="font-body-medium text-tiny text-white">×</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="flex-row mb-4" style={{ gap: 8 }}>
        <View className="flex-1">
          <AppButton label="写真を選ぶ" onPress={() => pickFiles('photo')} variant="secondary" />
        </View>
        <View className="flex-1">
          <AppButton label="動画を選ぶ" onPress={() => pickFiles('video')} variant="secondary" />
        </View>
      </View>

      {pendingFiles.map((f) => (
        <View
          key={f.key}
          className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row items-center justify-between"
        >
          <View className="flex-1 mr-2">
            <Text className="font-body text-caption text-ink" numberOfLines={1}>
              {f.originalFilename}
            </Text>
            <Text className="font-body text-tiny text-ink-soft">
              {f.status === 'pending' && (wifiOnly ? 'Wi-Fi接続を待っています' : '待機中')}
              {f.status === 'processing' && '処理中…'}
              {f.status === 'uploading' && 'アップロード中…'}
              {f.status === 'done' && '完了'}
              {f.status === 'error' && (f.errorMessage ?? 'エラー')}
            </Text>
          </View>
          {f.status === 'error' ? (
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Pressable onPress={() => startProcessing(f)}>
                <Text className="font-body text-caption text-accent-ink">再試行</Text>
              </Pressable>
              <Pressable onPress={() => removeFile(f.key)}>
                <Text className="font-body text-caption text-status-overdue">削除</Text>
              </Pressable>
            </View>
          ) : f.status !== 'done' ? (
            <ActivityIndicator color="#7E8F86" />
          ) : (
            <Pressable onPress={() => removeFile(f.key)}>
              <Text className="font-body text-caption text-status-overdue">削除</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Text className="font-body-medium text-body text-ink mb-2 mt-4">提出内容</Text>

      {shotDateField && (
        <CalendarPicker
          label={shotDateField.label}
          mode="date"
          value={fieldValues.shot_date || null}
          onChange={(v) => setFieldValue('shot_date', v)}
          maxDate={todayDateString()}
        />
      )}

      <Text className="font-body-medium text-body text-ink mb-2 mt-2">対象の子ども(複数選択可)</Text>
      {children.length === 0 ? (
        <Text className="font-body text-caption text-ink-soft mb-4">
          子どもが登録されていません。プロフィール画面から登録してください。
        </Text>
      ) : (
        <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
          {children.map((child) => {
            const selected = selectedChildIds.includes(child.id);
            return (
              <Pressable
                key={child.id}
                onPress={() => toggleChild(child.id)}
                className={`rounded-full border px-4 py-2 ${
                  selected ? 'border-accent bg-accent' : 'border-line bg-surface'
                }`}
              >
                <Text className={`font-body text-caption ${selected ? 'text-white' : 'text-ink'}`}>
                  {childDisplayName(child.call_name)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedChildren.map((child) => {
        const ageInfo =
          child.birth_month && fieldValues.shot_date
            ? computeAgeLabel(child.birth_month, fieldValues.shot_date)
            : null;
        return (
          <View key={child.id} className="bg-surface rounded-card border-hairline border-line p-4 mb-3">
            <Text className="font-body-medium text-body text-ink mb-1">{childDisplayName(child.call_name)}</Text>
            <Text className="font-body text-caption text-ink-soft mb-3">
              {ageInfo ? `撮影時点: ${ageInfo.label}` : '撮影日を選択すると年齢が表示されます'}
            </Text>

            {campaignVariants.length > 0 && (
              <View className="mb-3">
                <Text className="font-body text-caption text-ink-soft mb-1">着用したカラー/サイズ</Text>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {campaignVariants.map((v) => {
                    const selected = (childVariantIds[child.id] ?? []).includes(v.id);
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => toggleChildVariant(child.id, v.id)}
                        className={`rounded-control border px-3 py-2 ${
                          selected ? 'border-accent bg-accent' : 'border-line bg-bg'
                        }`}
                      >
                        <Text className={`font-body text-caption ${selected ? 'text-white' : 'text-ink'}`}>
                          {variantLabel(v)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {childFieldDefs.map((f) => {
              const value = childFieldValues[child.id]?.[f.key] ?? '';
              if (f.input_type === 'select' && f.options) {
                return (
                  <View key={f.key} className="mb-3">
                    <Text className="font-body text-caption text-ink-soft mb-1">{f.label}</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      {f.options.map((opt) => (
                        <Pressable
                          key={opt}
                          onPress={() => setChildFieldValue(child.id, f.key, opt)}
                          className={`rounded-control border px-3 py-2 ${
                            value === opt ? 'border-accent bg-accent' : 'border-line bg-bg'
                          }`}
                        >
                          <Text className={`font-body text-caption ${value === opt ? 'text-white' : 'text-ink'}`}>
                            {opt}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                );
              }

              return (
                <TextField
                  key={f.key}
                  label={`${f.label}${f.unit ? `(${f.unit})` : ''}`}
                  value={value}
                  onChangeText={(text) => setChildFieldValue(child.id, f.key, text)}
                  keyboardType={f.input_type === 'number' ? 'decimal-pad' : 'default'}
                  multiline={f.key === 'memo'}
                  numberOfLines={f.key === 'memo' ? 3 : undefined}
                />
              );
            })}
          </View>
        );
      })}

      {submitError && <ErrorBanner message={submitError} />}

      <AppButton
        label={submitting ? '送信中…' : taskStatus === 'approved' ? '追加で提出する' : '提出する'}
        onPress={handleSubmit}
        loading={submitting}
      />
    </ScrollView>
  );
}

// 単独ルートとしてアクセスされた場合(通知からの直接遷移など)のフォールバック。
// monitor-homeの「あなたの案件」シートに埋め込まれる場合はSubmissionFormContentを直接使う。
export default function SubmissionForm() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  return (
    <HeroScreen title="提出する" onBack={() => goBackOrReplace('/monitor-home')}>
      <SubmissionFormContent taskId={taskId} />
    </HeroScreen>
  );
}
