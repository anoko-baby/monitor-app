import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

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
}: {
  fileUri: string;
  destPath: string;
  resumeKey: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<{ path: string }> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('ファイルが見つかりませんでした');
  }
  const totalSize = info.size ?? 0;
  if (totalSize <= 0) {
    throw new Error('ファイルサイズを取得できませんでした');
  }

  const accessToken = await getDropboxAccessToken();

  let session: UploadSessionState | null = await loadSession(resumeKey);

  if (!session) {
    const firstLength = Math.min(CHUNK_SIZE, totalSize);
    const chunkUri = await writeChunkToTempFile(fileUri, 0, firstLength);
    try {
      const startResult = await callDropboxContentFromFile(
        'upload_session/start',
        accessToken,
        { close: false },
        chunkUri
      );
      session = {
        sessionId: startResult.session_id,
        offset: firstLength,
        totalSize,
        destPath,
      };
      await saveSession(resumeKey, session);
      onProgress?.({ bytesUploaded: session.offset, totalBytes: totalSize });
    } finally {
      await FileSystem.deleteAsync(chunkUri, { idempotent: true });
    }
  }

  while (session.offset < session.totalSize) {
    const remaining: number = session.totalSize - session.offset;
    const isLast: boolean = remaining <= CHUNK_SIZE;
    const length: number = Math.min(CHUNK_SIZE, remaining);
    const chunkUri = await writeChunkToTempFile(fileUri, session.offset, length);

    try {
      if (!isLast) {
        await callDropboxContentFromFile(
          'upload_session/append_v2',
          accessToken,
          { cursor: { session_id: session.sessionId, offset: session.offset }, close: false },
          chunkUri
        );
        session = { ...session, offset: session.offset + length };
        await saveSession(resumeKey, session);
        onProgress?.({ bytesUploaded: session.offset, totalBytes: session.totalSize });
      } else {
        const finishResult = await callDropboxContentFromFile(
          'upload_session/finish',
          accessToken,
          {
            cursor: { session_id: session.sessionId, offset: session.offset },
            commit: { path: session.destPath, mode: 'add', autorename: true },
          },
          chunkUri
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
    } finally {
      await FileSystem.deleteAsync(chunkUri, { idempotent: true });
    }
  }

  throw new Error('アップロードが完了しませんでした');
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
