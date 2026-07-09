import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { clearUploadSession, createDropboxSharedLink, uploadFileToDropboxChunked } from '../lib/dropbox';

type Status = 'idle' | 'picked' | 'uploading' | 'interrupted' | 'linking' | 'done' | 'error';

type PickedVideo = {
  uri: string;
  fileName: string;
  fileSize: number;
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// M1で作った検証用画面。本体UIには組み込まず、開発時の回帰確認用に残している。
export default function UploadTestScreen() {
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0); // 0-1
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resumeKey = video ? video.uri : null;
  const destPath = video ? `/anoko_monitor_test/${Date.now()}_${video.fileName}` : null;

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('写真/動画へのアクセス許可が必要です');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setVideo({
      uri: asset.uri,
      fileName: asset.fileName ?? `video_${Date.now()}.mov`,
      fileSize: asset.fileSize ?? 0,
    });
    setStatus('picked');
    setProgress(0);
    setUploadedBytes(0);
    setSharedUrl(null);
    setErrorMessage(null);
  }

  async function startOrResumeUpload() {
    if (!video || !resumeKey || !destPath) return;
    setStatus('uploading');
    setErrorMessage(null);

    try {
      const result = await uploadFileToDropboxChunked({
        fileUri: video.uri,
        destPath,
        resumeKey,
        onProgress: ({ bytesUploaded, totalBytes }) => {
          setUploadedBytes(bytesUploaded);
          setProgress(totalBytes > 0 ? bytesUploaded / totalBytes : 0);
        },
      });

      setStatus('linking');
      const url = await createDropboxSharedLink(result.path);
      setSharedUrl(url);
      setStatus('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus('interrupted');
    }
  }

  async function resetAll() {
    if (resumeKey) await clearUploadSession(resumeKey);
    setVideo(null);
    setStatus('idle');
    setProgress(0);
    setUploadedBytes(0);
    setSharedUrl(null);
    setErrorMessage(null);
  }

  return (
    <View className="flex-1 bg-bg px-6 py-8">
      <Text className="text-title-lg text-ink font-medium mb-2">
        Dropboxアップロード検証
      </Text>
      <Text className="text-body text-ink-soft mb-8">
        500MB以上の動画で、進捗表示・機内モードからの再開・共有リンク生成を確認します。
      </Text>

      {!video && (
        <Pressable
          onPress={pickVideo}
          className="bg-accent rounded-control py-4 items-center"
        >
          <Text className="text-white text-title font-medium">動画を選択する</Text>
        </Pressable>
      )}

      {video && (
        <View className="bg-surface rounded-card border-hairline border-line p-4 mb-6">
          <Text className="text-body text-ink" numberOfLines={1}>
            {video.fileName}
          </Text>
          <Text className="text-caption text-ink-soft mt-1">
            {formatBytes(video.fileSize)}
          </Text>
        </View>
      )}

      {video && (status === 'picked' || status === 'interrupted') && (
        <Pressable
          onPress={startOrResumeUpload}
          className="bg-accent rounded-control py-4 items-center mb-3"
        >
          <Text className="text-white text-title font-medium">
            {status === 'interrupted' ? '再開する' : 'アップロードを開始する'}
          </Text>
        </Pressable>
      )}

      {(status === 'uploading' || status === 'linking') && (
        <View className="mb-6">
          <View className="h-2 bg-line rounded-full overflow-hidden">
            <View
              className="h-2 bg-accent rounded-full"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </View>
          <Text className="text-caption text-ink-soft mt-2">
            {status === 'linking'
              ? '共有リンクを作成しています…'
              : `${formatBytes(uploadedBytes)} / ${formatBytes(video?.fileSize ?? 0)}(${Math.round(progress * 100)}%)`}
          </Text>
        </View>
      )}

      {status === 'interrupted' && errorMessage && (
        <View className="bg-status-overdue/10 rounded-card p-4 mb-4">
          <Text className="text-caption text-status-overdue">
            アップロードが中断されました。通信状態を確認して「再開する」を押してください。
          </Text>
          <Text className="text-tiny text-ink-soft mt-1">{errorMessage}</Text>
        </View>
      )}

      {status === 'done' && sharedUrl && (
        <View className="bg-surface rounded-card border-hairline border-line p-4">
          <Text className="text-body text-ink mb-3">アップロード完了・共有リンクを作成しました</Text>
          <Pressable
            onPress={() => Linking.openURL(sharedUrl)}
            className="bg-accent rounded-control py-3 items-center mb-2"
          >
            <Text className="text-white text-body font-medium">リンクを開く</Text>
          </Pressable>
          <Text className="text-tiny text-ink-soft" numberOfLines={1}>
            {sharedUrl}
          </Text>
        </View>
      )}

      {video && (
        <Pressable onPress={resetAll} className="mt-6 items-center">
          <Text className="text-caption text-ink-soft">やり直す(別の動画を選ぶ)</Text>
        </Pressable>
      )}
    </View>
  );
}
