import AsyncStorage from '@react-native-async-storage/async-storage';

// 提出フォームのドラフト保存(仕様書 v1.8 9章: 入力値は端末にドラフト保存し、アップロード失敗時に消えない)。
const DRAFT_KEY_PREFIX = 'submission_draft:';

export type DraftFileStatus = 'pending' | 'processing' | 'uploading' | 'done' | 'error';

export type DraftFile = {
  key: string;
  localUri: string;
  kind: 'photo' | 'video';
  originalFilename: string;
  fileSize: number;
  durationMs: number | null;
  sequenceNo: number;
  status: DraftFileStatus;
  errorMessage?: string;
  dropboxPath?: string;
  dropboxSharedUrl?: string;
  thumbnailPath?: string;
  durationSec?: number;
};

export type SubmissionDraft = {
  formValues: Record<string, string>;
  files: DraftFile[];
  updatedAt: string;
};

export async function saveDraft(taskId: string, draft: SubmissionDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY_PREFIX + taskId, JSON.stringify(draft));
}

export async function loadDraft(taskId: string): Promise<SubmissionDraft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY_PREFIX + taskId);
  return raw ? (JSON.parse(raw) as SubmissionDraft) : null;
}

export async function clearDraft(taskId: string): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY_PREFIX + taskId);
}
