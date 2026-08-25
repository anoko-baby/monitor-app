import { removeLocation } from '@xoi/gps-metadata-remover';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { createDropboxSharedLink, fetchBlobWithRetry, uploadFileToDropboxChunked, UploadProgress } from './dropbox';
import { supabase } from './supabase';

const isWeb = Platform.OS === 'web';

// 提出ファイル1件分の処理: HEIC→JPEG変換(無劣化狙い) → サムネイル生成・保存 → GPS位置情報除去
// (バイト単位の書き換えのみ・再エンコードなし) → Dropboxへアップロード(仕様書 v1.8 3.4.1, 6.2, 6.3)。

export type PickedAsset = {
  uri: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  kind: 'photo' | 'video';
  width: number | null;
  height: number | null;
  durationMs: number | null;
};

export type ProcessedFileResult = {
  kind: 'photo' | 'video';
  dropboxPath: string;
  dropboxSharedUrl: string;
  // Web版はHEIC画像など、ブラウザがデコードできない形式でサムネイル生成に失敗することがあるため null を許容する
  thumbnailPath: string | null;
  fileSize: number;
  durationSec: number | null;
  originalFilename: string;
};

const HEIC_EXTENSION_RE = /\.heic$/i;
const THUMBNAILS_BUCKET = 'thumbnails';

function isHeic(fileName: string): boolean {
  return HEIC_EXTENSION_RE.test(fileName);
}

// --- base64 / ASCII <-> bytes ---
// atob/btoaがHermesで確実に使えるか不明なため、@xoi/gps-metadata-removerが要求する
// read/writeアダプタ用に自前で実装する(標準的なbase64デコードのみ)。
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const value = BASE64_CHARS.indexOf(clean[i]);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function asciiToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

// GPSタグのみをバイト単位でゼロ埋めする(再エンコードなし)。JPEG/PNG/TIFF/MOV/MP4に対応。
// ネイティブでは対象ファイルをその場で書き換える(戻り値は元と同じURI)。
// Web版はexpo-file-systemのFile/FileHandleが未対応のため、blob: URLの中身をメモリ上の
// Uint8Arrayとして読み書きし、処理後に新しいBlob/blob: URLを作って返す(呼び出し元は
// 戻り値のURIを以後の処理で使うこと)。
// Web版は戻り値に処理済みBlobも含める。呼び出し元(アップロード処理)がこのURLを改めて
// fetchし直さずに済むようにするため(Safariではblob: URLの再fetchが「Load failed」で
// 失敗することがある)。
async function stripGpsMetadata(fileUri: string): Promise<{ uri: string; blob: Blob | null }> {
  if (isWeb) {
    const blob = await fetchBlobWithRetry(fileUri);
    const buffer = new Uint8Array(await blob.arrayBuffer());

    const read = async (size: number, offset: number): Promise<ArrayBuffer> => {
      return buffer.buffer.slice(offset, offset + size);
    };
    const write = async (value: string, offset: number, encoding: string): Promise<void> => {
      const bytes = encoding === 'base64' ? base64ToBytes(value) : asciiToBytes(value);
      buffer.set(bytes, offset);
    };
    await removeLocation(fileUri, read, write);

    const newBlob = new Blob([buffer], { type: blob.type });
    return { uri: URL.createObjectURL(newBlob), blob: newBlob };
  }

  const file = new File(fileUri);
  const handle = file.open();
  try {
    const read = async (size: number, offset: number): Promise<ArrayBuffer> => {
      handle.offset = offset;
      const bytes = handle.readBytes(size);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    };
    const write = async (value: string, offset: number, encoding: string): Promise<void> => {
      const bytes = encoding === 'base64' ? base64ToBytes(value) : asciiToBytes(value);
      handle.offset = offset;
      handle.writeBytes(bytes);
    };
    await removeLocation(fileUri, read, write);
    return { uri: fileUri, blob: null };
  } finally {
    handle.close();
  }
}

// HEICは選択時にJPEGへ変換してからGPS除去する(HEICのまま無劣化でGPSのみ除去する手段が無いため。
// Azusaさんと合意した方針)。compress:1・リサイズなしで実質的な画質劣化は生じない。
// Web版はブラウザ(Safari以外)がHEICをデコードできないことが多く、変換に失敗する場合がある。
// その場合は元のHEICファイルのまま後続処理(GPS除去・アップロード)を続行する(サムネイルは生成できない)。
async function convertHeicToJpeg(uri: string): Promise<string> {
  try {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
    return result.uri;
  } catch (err) {
    if (isWeb) return uri;
    throw err;
  }
}

// サムネイルは長辺400pxのJPEG(仕様書 v1.8 6.3)。アップロードする本体とは別の派生ファイルなので再圧縮してよい。
async function generatePhotoThumbnail(
  uri: string,
  width: number | null,
  height: number | null
): Promise<string> {
  const context =
    width && height && height > width
      ? ImageManipulator.manipulate(uri).resize({ height: 400 })
      : ImageManipulator.manipulate(uri).resize({ width: 400 });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return result.uri;
}

// 動画のサムネイルは先頭1秒のフレーム画像(仕様書 v1.8 6.3)。
// expo-video-thumbnailsはWeb未対応のため、Web版は<video>+<canvas>で自前にフレームを取り出す。
async function generateVideoThumbnail(uri: string): Promise<string> {
  if (isWeb) {
    const { uri: frameUri, width, height } = await captureVideoFrameOnWeb(uri, 1);
    return generatePhotoThumbnail(frameUri, width, height);
  }
  const frame = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000, quality: 0.8 });
  return generatePhotoThumbnail(frame.uri, frame.width, frame.height);
}

function captureVideoFrameOnWeb(
  uri: string,
  atSeconds: number
): Promise<{ uri: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = uri;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(atSeconds, Math.max(video.duration - 0.1, 0));
    };
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('動画フレームの取得に失敗しました'));
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('動画フレームの取得に失敗しました'));
          return;
        }
        resolve({ uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
      }, 'image/jpeg');
    };
    video.onerror = () => reject(new Error('動画の読み込みに失敗しました'));
  });
}

async function uploadThumbnail(localUri: string, storagePath: string): Promise<void> {
  const body = isWeb ? await fetchBlobWithRetry(localUri) : await new File(localUri).bytes();
  const { error } = await supabase.storage.from(THUMBNAILS_BUCKET).upload(storagePath, body, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    throw new Error(`サムネイルのアップロードに失敗しました: ${error.message}`);
  }
}

// thumbnailsバケットは非公開のため、表示側はこの関数で都度署名付きURLを取得する。
export async function getThumbnailSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(THUMBNAILS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function processAndUploadFile({
  asset,
  submissionId,
  dropboxDestPath,
  onProgress,
}: {
  asset: PickedAsset;
  submissionId: string;
  dropboxDestPath: string;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<ProcessedFileResult> {
  let workingUri = asset.uri;
  let workingFileName = asset.fileName;

  if (asset.kind === 'photo' && isHeic(asset.fileName)) {
    workingUri = await convertHeicToJpeg(workingUri);
    workingFileName = workingFileName.replace(HEIC_EXTENSION_RE, '.jpg');
  }

  let thumbnailStoragePath: string | null = null;
  try {
    const thumbnailLocalUri =
      asset.kind === 'photo'
        ? await generatePhotoThumbnail(workingUri, asset.width, asset.height)
        : await generateVideoThumbnail(workingUri);

    thumbnailStoragePath = `${submissionId}/${workingFileName.replace(/\.[^.]+$/, '')}_thumb.jpg`;
    await uploadThumbnail(thumbnailLocalUri, thumbnailStoragePath);
  } catch (err) {
    // Web版はブラウザがデコードできない形式(主にHEIC)でサムネイル生成に失敗することがある。
    // 本体ファイルの提出自体は継続し、サムネイルなしで進める(ネイティブでは元々発生しない想定なので再throw)。
    if (!isWeb) throw err;
    thumbnailStoragePath = null;
  }

  const stripped = await stripGpsMetadata(workingUri);
  workingUri = stripped.uri;

  const { path: dropboxPath } = await uploadFileToDropboxChunked({
    fileUri: workingUri,
    destPath: dropboxDestPath,
    resumeKey: `${submissionId}:${workingFileName}`,
    onProgress,
    webBlob: stripped.blob ?? undefined,
  });
  const dropboxSharedUrl = await createDropboxSharedLink(dropboxPath);

  return {
    kind: asset.kind,
    dropboxPath,
    dropboxSharedUrl,
    thumbnailPath: thumbnailStoragePath,
    fileSize: asset.fileSize,
    durationSec: asset.durationMs ? Math.round(asset.durationMs / 1000) : null,
    originalFilename: asset.fileName,
  };
}
