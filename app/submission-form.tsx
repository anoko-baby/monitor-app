import * as ImagePicker from 'expo-image-picker';
import * as Network from 'expo-network';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorBanner } from '../components/ErrorBanner';
import { TextField } from '../components/TextField';
import { formatCycleFolderName, formatSubmissionFileName } from '../lib/campaigns';
import { getThumbnailSignedUrl, processAndUploadFile } from '../lib/mediaPipeline';
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

function computeAgeDisplay(birthMonth: string, shotDate: string): { months: number; label: string } {
  const [by, bm] = birthMonth.split('-').map(Number);
  const [sy, sm] = shotDate.split('-').map(Number);
  const months = (sy - by) * 12 + (sm - bm);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return { months, label: years > 0 ? `${years}歳${rem}ヶ月` : `${months}ヶ月` };
}

// モニター側 データ提出フォーム(仕様書 v1.8 画面一覧6)。ファイル選択+動的フォーム項目。
export default function SubmissionForm() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [taskStatus, setTaskStatus] = useState<string>('pending');
  const [rejectComment, setRejectComment] = useState<string | null>(null);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [cycleLabel, setCycleLabel] = useState('');
  const [cycleNo, setCycleNo] = useState(0);
  const [dropboxBasePath, setDropboxBasePath] = useState<string | null>(null);
  const [skuInfo, setSkuInfo] = useState<{ sku: string | null; size: string | null; color: string | null }[]>([]);
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [childBirthMonth, setChildBirthMonth] = useState<string | null>(null);
  const [wifiOnly, setWifiOnly] = useState(false);

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [existingFiles, setExistingFiles] = useState<ExistingFile[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [ageEdited, setAgeEdited] = useState(false);
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
    saveDraft(taskId, { formValues: fieldValues, files: pendingFiles, updatedAt: new Date().toISOString() });
  }, [fieldValues, pendingFiles, loading]);

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

      if (campaign.child_id) {
        const { data: child } = await supabase
          .from('children')
          .select('birth_month')
          .eq('id', campaign.child_id)
          .maybeSingle();
        setChildBirthMonth(child?.birth_month ?? null);
      }
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

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('wifi_only_upload')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      setWifiOnly(profile?.wifi_only_upload ?? false);
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
    }

    const draft = await loadDraft(taskId);
    if (draft) {
      setFieldValues((prev) => ({ ...prev, ...draft.formValues }));
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

  useEffect(() => {
    if (!fieldValues.shot_date || !childBirthMonth || ageEdited) return;
    const hasAgeField = fieldDefs.some((f) => f.key === 'age_months');
    if (!hasAgeField) return;
    const { months } = computeAgeDisplay(childBirthMonth, fieldValues.shot_date);
    setFieldValues((prev) => ({ ...prev, age_months: String(months) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues.shot_date, childBirthMonth, fieldDefs]);

  function setFieldValue(key: string, value: string) {
    if (key === 'age_months') setAgeEdited(true);
    setFieldValues((prev) => ({ ...prev, [key]: value }));
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

  async function handleSubmit() {
    setSubmitError(null);

    for (const f of fieldDefs) {
      if (f.is_required && !fieldValues[f.key]) {
        setSubmitError(`${f.label}を入力してください`);
        return;
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
      const isResubmission = taskStatus === 'rejected';
      const newVersion = isResubmission ? version + 1 : version;

      const { error: subError } = await supabase
        .from('submissions')
        .update({ form_data: fieldValues, version: newVersion })
        .eq('id', subId);
      if (subError) throw new Error('提出内容の保存に失敗しました');

      if (doneFiles.length > 0) {
        const { error: filesError } = await supabase.from('submission_files').insert(
          doneFiles.map((f) => ({
            submission_id: subId,
            kind: f.kind,
            dropbox_path: f.dropboxPath!,
            dropbox_shared_url: f.dropboxSharedUrl!,
            thumbnail_url: f.thumbnailPath!,
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
      <Text className="font-body text-caption text-ink-soft mb-1">
        {cycleLabel} ・ {formatDueDate(taskDueDate)}まで
      </Text>
      {skuInfo.length > 0 && (
        <Text className="font-body text-caption text-ink-soft mb-4">
          {skuInfo.map((s) => [s.sku, s.size, s.color].filter(Boolean).join(' / ')).join(' , ')}
        </Text>
      )}

      {taskStatus === 'rejected' && rejectComment && (
        <View className="bg-status-overdue/10 rounded-card p-4 mb-4">
          <Text className="font-body-medium text-caption text-status-overdue mb-1">差し戻されました</Text>
          <Text className="font-body text-caption text-status-overdue">{rejectComment}</Text>
        </View>
      )}

      {readOnly && (
        <Text className="font-body text-caption text-status-approved mb-4">
          確認済みのため編集できません
        </Text>
      )}

      {submitted && !readOnly && (
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
              </View>
            ))}
          </View>
        </View>
      )}

      {!readOnly && (
        <>
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
                <Pressable onPress={() => startProcessing(f)}>
                  <Text className="font-body text-caption text-accent-ink">再試行</Text>
                </Pressable>
              ) : f.status !== 'done' ? (
                <ActivityIndicator color="#7E8F86" />
              ) : (
                <Pressable onPress={() => removeFile(f.key)}>
                  <Text className="font-body text-caption text-status-overdue">削除</Text>
                </Pressable>
              )}
            </View>
          ))}
        </>
      )}

      <Text className="font-body-medium text-body text-ink mb-2 mt-4">提出内容</Text>
      {fieldDefs.map((f) => {
        const value = fieldValues[f.key] ?? '';
        if (f.input_type === 'select' && f.options) {
          return (
            <View key={f.key} className="mb-4">
              <Text className="font-body text-caption text-ink-soft mb-1">{f.label}</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {f.options.map((opt) => (
                  <Pressable
                    key={opt}
                    disabled={readOnly}
                    onPress={() => setFieldValue(f.key, opt)}
                    className={`rounded-control border px-3 py-2 ${
                      value === opt ? 'border-accent bg-accent' : 'border-line bg-surface'
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
          <View key={f.key}>
            <TextField
              label={`${f.label}${f.unit ? `(${f.unit})` : ''}`}
              value={value}
              onChangeText={(text) => setFieldValue(f.key, text)}
              editable={!readOnly}
              keyboardType={f.input_type === 'number' ? 'decimal-pad' : 'default'}
              placeholder={f.input_type === 'date' ? 'YYYY-MM-DD' : undefined}
              multiline={f.key === 'memo'}
              numberOfLines={f.key === 'memo' ? 3 : undefined}
            />
            {f.key === 'age_months' && childBirthMonth && fieldValues.shot_date && (
              <Text className="font-body text-tiny text-ink-soft -mt-3 mb-3">
                {computeAgeDisplay(childBirthMonth, fieldValues.shot_date).label}
              </Text>
            )}
          </View>
        );
      })}

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
