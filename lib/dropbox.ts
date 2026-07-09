import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

// Dropbox upload_session はこの単位でチャンク分割する(仕様書 v1.8 6.2)
const CHUNK_SIZE = 8 * 1024 * 1024;
const SESSION_STORE_PREFIX = 'dropbox_upload_session:';

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

async function callDropboxContent(
  endpoint: 'upload_session/start' | 'upload_session/append_v2' | 'upload_session/finish',
  accessToken: string,
  apiArg: unknown,
  body: Blob
): Promise<any> {
  const response = await fetch(`https://content.dropboxapi.com/2/files/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify(apiArg),
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new DropboxApiError(`Dropbox API error (${endpoint}): ${response.status}`, errorBody);
  }
  return response.json();
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
  const file = new File(fileUri);
  const totalSize = file.size ?? 0;
  if (totalSize <= 0) {
    throw new Error('ファイルサイズを取得できませんでした');
  }

  const accessToken = await getDropboxAccessToken();

  let session: UploadSessionState | null = await loadSession(resumeKey);

  if (!session) {
    const firstChunkEnd = Math.min(CHUNK_SIZE, totalSize);
    const firstChunk = file.slice(0, firstChunkEnd);
    const startResult = await callDropboxContent(
      'upload_session/start',
      accessToken,
      { close: false },
      firstChunk
    );
    session = {
      sessionId: startResult.session_id,
      offset: firstChunkEnd,
      totalSize,
      destPath,
    };
    await saveSession(resumeKey, session);
    onProgress?.({ bytesUploaded: session.offset, totalBytes: totalSize });
  }

  while (session.offset < session.totalSize) {
    const remaining: number = session.totalSize - session.offset;
    const isLast: boolean = remaining <= CHUNK_SIZE;
    const chunkEnd: number = session.offset + Math.min(CHUNK_SIZE, remaining);
    const chunk = file.slice(session.offset, chunkEnd);

    try {
      if (!isLast) {
        await callDropboxContent(
          'upload_session/append_v2',
          accessToken,
          { cursor: { session_id: session.sessionId, offset: session.offset }, close: false },
          chunk
        );
        session = { ...session, offset: chunkEnd };
        await saveSession(resumeKey, session);
        onProgress?.({ bytesUploaded: session.offset, totalBytes: session.totalSize });
      } else {
        const finishResult = await callDropboxContent(
          'upload_session/finish',
          accessToken,
          {
            cursor: { session_id: session.sessionId, offset: session.offset },
            commit: { path: session.destPath, mode: 'add', autorename: true },
          },
          chunk
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
