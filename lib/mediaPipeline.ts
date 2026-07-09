import { removeLocation } from '@xoi/gps-metadata-remover';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { createDropboxSharedLink, uploadFileToDropboxChunked, UploadProgress } from './dropbox';
import { supabase } from './supabase';

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
  thumbnailPath: string;
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
async function stripGpsMetadata(fileUri: string): Promise<void> {
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
  } finally {
    handle.close();
  }
}

// HEICは選択時にJPEGへ変換してからGPS除去する(HEICのまま無劣化でGPSのみ除去する手段が無いため。
// Azusaさんと合意した方針)。compress:1・リサイズなしで実質的な画質劣化は生じない。
async function convertHeicToJpeg(uri: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return result.uri;
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
async function generateVideoThumbnail(uri: string): Promise<string> {
  const frame = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000, quality: 0.8 });
  return generatePhotoThumbnail(frame.uri, frame.width, frame.height);
}

async function uploadThumbnail(localUri: string, storagePath: string): Promise<void> {
  const file = new File(localUri);
  const bytes = await file.bytes();
  const { error } = await supabase.storage.from(THUMBNAILS_BUCKET).upload(storagePath, bytes, {
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

  const thumbnailLocalUri =
    asset.kind === 'photo'
      ? await generatePhotoThumbnail(workingUri, asset.width, asset.height)
      : await generateVideoThumbnail(workingUri);

  const thumbnailStoragePath = `${submissionId}/${workingFileName.replace(/\.[^.]+$/, '')}_thumb.jpg`;
  await uploadThumbnail(thumbnailLocalUri, thumbnailStoragePath);

  await stripGpsMetadata(workingUri);

  const { path: dropboxPath } = await uploadFileToDropboxChunked({
    fileUri: workingUri,
    destPath: dropboxDestPath,
    resumeKey: `${submissionId}:${workingFileName}`,
    onProgress,
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
