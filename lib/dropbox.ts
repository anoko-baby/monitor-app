import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Dropbox upload_session はこの単位でチャンク分割する(仕様書 v1.8 6.2)
const CHUNK_SIZE = 8 * 1024 * 1024;
const SESSION_STORE_PREFIX = 'dropbox_upload_session:';
const TEMP_CHUNK_FILENAME = 'dropbox_upload_chunk.tmp';

type UploadSessionState = {
  sessionId: string;
  offset: number;
  totalSize: number;
  destPath: string;
};

export type UploadProgress = {
  bytesUploaded: number;
  totalBytes: number;
};

class DropboxApiError extends Error {
  body: string;
  constructor(message: string, body: string) {
    super(message);
    this.body = body;
  }
}

// Web版のblob: URLはSafari(WebKit)で特に、作成から時間が経つ・他の非同期処理を挟むと
// fetch()が「Load failed」で失敗することがある(WebKitの既知の挙動)。1回失敗しても
// すぐ諦めず数回リトライすることで実用上ほぼ回避できる。
export async function fetchBlobWithRetry(uri: string, retries = 2): Promise<Blob> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(uri);
      return await response.blob();
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`ファイルの読み込みに失敗しました: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function getDropboxAccessToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('dropbox-token');
  if (error) {
    throw new Error(`Dropboxトークンの取得に失敗しました: ${error.message}`);
  }
  if (!data?.accessToken) {
    throw new Error(`Dropboxトークンの取得に失敗しました: ${JSON.stringify(data)}`);
  }
  return data.accessToken as string;
}

async function loadSession(key: string): Promise<UploadSessionState | null> {
  const raw = await AsyncStorage.getItem(SESSION_STORE_PREFIX + key);
  return raw ? (JSON.parse(raw) as UploadSessionState) : null;
}

async function saveSession(key: string, state: UploadSessionState): Promise<void> {
  await AsyncStorage.setItem(SESSION_STORE_PREFIX + key, JSON.stringify(state));
}

async function clearSessionInternal(key: string): Promise<void> {
  await AsyncStorage.removeItem(SESSION_STORE_PREFIX + key);
}

export function clearUploadSession(resumeKey: string): Promise<void> {
  return clearSessionInternal(resumeKey);
}

// React NativeのfetchはBlob/ArrayBufferボディに対応していないため、
// チャンクを一度ローカルの一時ファイルに書き出し、FileSystem.uploadAsync(ネイティブ実装)で送信する。
async function writeChunkToTempFile(
  fileUri: string,
  position: number,
  length: number
): Promise<string> {
  const base64Chunk = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
    position,
    length,
  });
  const tempUri = `${FileSystem.cacheDirectory}${TEMP_CHUNK_FILENAME}`;
  await FileSystem.writeAsStringAsync(tempUri, base64Chunk, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return tempUri;
}

async function callDropboxContentFromFile(
  endpoint: 'upload_session/start' | 'upload_session/append_v2' | 'upload_session/finish',
  accessToken: string,
  apiArg: unknown,
  chunkFileUri: string
): Promise<any> {
  const result = await FileSystem.uploadAsync(
    `https://content.dropboxapi.com/2/files/${endpoint}`,
    chunkFileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(apiArg),
      },
    }
  );

  if (result.status < 200 || result.status >= 300) {
    throw new DropboxApiError(`Dropbox API error (${endpoint}): ${result.status}`, result.body);
  }
  return JSON.parse(result.body);
}

// Web版: ブラウザのfetchはBlobボディに対応しているため、一時ファイルを介さず直接送信できる。
async function callDropboxContentFromBlob(
  endpoint: 'upload_session/start' | 'upload_session/append_v2' | 'upload_session/finish',
  accessToken: string,
  apiArg: unknown,
  chunkBlob: Blob
): Promise<any> {
  const response = await fetch(`https://content.dropboxapi.com/2/files/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(apiArg),
    },
    body: chunkBlob,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new DropboxApiError(`Dropbox API error (${endpoint}): ${response.status}`, bodyText);
  }
  return JSON.parse(bodyText);
}

// append_v2/finish で offset がずれていた場合、Dropboxはエラー本文に正しいoffsetを返す。
// リトライ時にそれへ同期させることで、二重送信や取り残しを防ぐ。
function parseCorrectOffset(errorBody: string): number | null {
  try {
    const parsed = JSON.parse(errorBody);
    const correctOffset =
      parsed?.error?.correct_offset ?? parsed?.error?.reason?.correct_offset ?? null;
    return typeof correctOffset === 'number' ? correctOffset : null;
  } catch {
    return null;
  }
}

export async function uploadFileToDropboxChunked({
  fileUri,
  destPath,
  resumeKey,
  onProgress,
  webBlob: providedWebBlob,
}: {
  fileUri: string;
  destPath: string;
  resumeKey: string;
  onProgress?: (progress: UploadProgress) => void;
  // Web版: 呼び出し元が処理済みのBlobを既に保持している場合はこれを直接使う(fileUriの
  // blob: URLを改めてfetchし直すと、Safariでは既にURLが失効していて失敗することがあるため)。
  webBlob?: Blob;
}): Promise<{ path: string }> {
  const isWeb = Platform.OS === 'web';

  // Web版: fileUriはブラウザのblob: URL。fetchでBlobとして取得し、以降はslice()でチャンク分割する
  // (expo-file-systemはWebで未対応のため、native版のような一時ファイル書き出しは不要かつ不可能)。
  const webBlob = isWeb ? providedWebBlob ?? (await fetchBlobWithRetry(fileUri)) : null;

  let totalSize = 0;
  if (isWeb) {
    totalSize = webBlob!.size;
  } else {
    const info = await FileSystem.getInfoAsync(fileUri);
    totalSize = info.exists ? info.size : 0;
  }
  if (totalSize <= 0) {
    throw new Error('ファイルサイズを取得できませんでした');
  }

  const accessToken = await getDropboxAccessToken();

  let session: UploadSessionState | null = await loadSession(resumeKey);

  async function sendChunk(
    endpoint: 'upload_session/start' | 'upload_session/append_v2' | 'upload_session/finish',
    apiArg: unknown,
    position: number,
    length: number
  ): Promise<any> {
    if (isWeb) {
      return callDropboxContentFromBlob(endpoint, accessToken, apiArg, webBlob!.slice(position, position + length));
    }
    const chunkUri = await writeChunkToTempFile(fileUri, position, length);
    try {
      return await callDropboxContentFromFile(endpoint, accessToken, apiArg, chunkUri);
    } finally {
      await FileSystem.deleteAsync(chunkUri, { idempotent: true });
    }
  }

  if (!session) {
    const firstLength = Math.min(CHUNK_SIZE, totalSize);
    const startResult = await sendChunk('upload_session/start', { close: false }, 0, firstLength);
    session = {
      sessionId: startResult.session_id,
      offset: firstLength,
      totalSize,
      destPath,
    };
    await saveSession(resumeKey, session);
    onProgress?.({ bytesUploaded: session.offset, totalBytes: totalSize });
  }

  // ファイル全体がCHUNK_SIZE以下の場合、start呼び出し1回でoffsetが既にtotalSizeまで進む。
  // その場合も残りバイト数0でfinishを呼ぶ必要があるため、"offset < totalSize"ではなく
  // 「finishが成功するまで」をループ条件にする(以前はここが原因でoffset===totalSizeの
  // ケースがfinishを一度も呼ばずループを抜け、「アップロードが完了しませんでした」に
  // なっていた)。
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const remaining: number = session.totalSize - session.offset;
    const isLast: boolean = remaining <= CHUNK_SIZE;
    const length: number = Math.max(0, Math.min(CHUNK_SIZE, remaining));

    try {
      if (!isLast) {
        await sendChunk(
          'upload_session/append_v2',
          { cursor: { session_id: session.sessionId, offset: session.offset }, close: false },
          session.offset,
          length
        );
        session = { ...session, offset: session.offset + length };
        await saveSession(resumeKey, session);
        onProgress?.({ bytesUploaded: session.offset, totalBytes: session.totalSize });
      } else {
        const finishResult = await sendChunk(
          'upload_session/finish',
          {
            cursor: { session_id: session.sessionId, offset: session.offset },
            commit: { path: session.destPath, mode: 'add', autorename: true },
          },
          session.offset,
          length
        );
        await clearSessionInternal(resumeKey);
        onProgress?.({ bytesUploaded: session.totalSize, totalBytes: session.totalSize });
        return { path: finishResult.path_lower ?? session.destPath };
      }
    } catch (err) {
      if (err instanceof DropboxApiError) {
        const correctOffset = parseCorrectOffset(err.body);
        if (correctOffset !== null && correctOffset !== session.offset) {
          session = { ...session, offset: correctOffset };
          await saveSession(resumeKey, session);
          continue;
        }
      }
      throw err;
    }
  }
}

export async function createDropboxSharedLink(path: string): Promise<string> {
  const accessToken = await getDropboxAccessToken();

  const response = await fetch(
    'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    }
  );

  if (response.ok) {
    const data = await response.json();
    return data.url as string;
  }

  const errorBody = await response.text();
  if (errorBody.includes('shared_link_already_exists')) {
    const listResponse = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, direct_only: true }),
    });
    const listData = await listResponse.json();
    if (listData?.links?.[0]?.url) {
      return listData.links[0].url as string;
    }
  }

  throw new Error(`共有リンクの作成に失敗しました: ${errorBody}`);
}
