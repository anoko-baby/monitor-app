import { useEffect, useState } from 'react';
import { FlatList, Image, Text, View } from 'react-native';

import { getThumbnailSignedUrl } from '../lib/mediaPipeline';
import { supabase } from '../lib/supabase';

type HistoryRow = {
  taskId: string;
  type: 'media' | 'sns';
  status: string;
  submittedAt: string | null;
  campaignTitle: string;
  cycleLabel: string;
  thumbUrl: string | null;
};

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: '未提出',
  submitted: '提出済',
  approved: '確認済',
  rejected: '差し戻し',
  cancelled: 'キャンセル',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// モニター側 提出履歴(仕様書 v1.8 画面一覧8)。自分の全提出を時系列一覧(サムネイル付き)で表示する。
export default function SubmissionHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, type, status, due_date, submitted_at, cycle_id')
      .neq('status', 'pending')
      .order('submitted_at', { ascending: false });

    const cycleIds = Array.from(new Set((tasks ?? []).map((t) => t.cycle_id)));
    const { data: cycles } = cycleIds.length
      ? await supabase.from('cycles').select('id, label, campaign_id').in('id', cycleIds)
      : { data: [] as any[] };
    const cycleById = new Map((cycles ?? []).map((c) => [c.id, c]));

    const campaignIds = Array.from(new Set((cycles ?? []).map((c) => c.campaign_id)));
    const { data: campaigns } = campaignIds.length
      ? await supabase.from('campaigns').select('id, title').in('id', campaignIds)
      : { data: [] as any[] };
    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

    const taskIds = (tasks ?? []).map((t) => t.id);
    const { data: submissions } = taskIds.length
      ? await supabase.from('submissions').select('id, task_id').in('task_id', taskIds)
      : { data: [] as any[] };
    const submissionByTaskId = new Map((submissions ?? []).map((s) => [s.task_id, s.id]));

    const submissionIds = (submissions ?? []).map((s) => s.id);
    const { data: files } = submissionIds.length
      ? await supabase
          .from('submission_files')
          .select('id, submission_id, thumbnail_url')
          .in('submission_id', submissionIds)
      : { data: [] as any[] };
    const firstThumbBySubmission = new Map<string, string | null>();
    for (const f of files ?? []) {
      if (!firstThumbBySubmission.has(f.submission_id)) {
        firstThumbBySubmission.set(f.submission_id, f.thumbnail_url);
      }
    }

    const withThumbs = await Promise.all(
      (tasks ?? []).map(async (t) => {
        const cycle = cycleById.get(t.cycle_id);
        const campaign = cycle ? campaignById.get(cycle.campaign_id) : null;
        const submissionId = submissionByTaskId.get(t.id);
        const thumbPath = submissionId ? firstThumbBySubmission.get(submissionId) : null;
        const thumbUrl = thumbPath ? await getThumbnailSignedUrl(thumbPath) : null;
        return {
          taskId: t.id,
          type: t.type,
          status: t.status,
          submittedAt: t.submitted_at,
          campaignTitle: campaign?.title ?? '(案件情報なし)',
          cycleLabel: cycle?.label ?? '',
          thumbUrl,
        };
      })
    );

    setRows(withThumbs);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <View className="flex-1 bg-bg px-6 pt-6">
      <FlatList
        data={rows}
        keyExtractor={(item) => item.taskId}
        ListEmptyComponent={
          !loading ? (
            <Text className="font-body text-caption text-ink-soft">まだ提出はありません</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View className="bg-surface rounded-card border-hairline border-line px-4 py-3 mb-2 flex-row items-center">
            {item.thumbUrl ? (
              <Image
                source={{ uri: item.thumbUrl }}
                style={{ width: 56, height: 56, borderRadius: 8, marginRight: 12 }}
              />
            ) : (
              <View
                style={{ width: 56, height: 56, borderRadius: 8, marginRight: 12 }}
                className="bg-line items-center justify-center"
              >
                <Text className="font-body text-tiny text-ink-soft">{item.type === 'sns' ? 'SNS' : ''}</Text>
              </View>
            )}
            <View className="flex-1">
              <Text className="font-body-medium text-body text-ink" numberOfLines={1}>
                {item.campaignTitle}
              </Text>
              <Text className="font-body text-caption text-ink-soft">
                {item.cycleLabel} ・ {item.type === 'media' ? 'データ' : 'SNS'} ・{' '}
                {TASK_STATUS_LABEL[item.status]}
              </Text>
              <Text className="font-body text-tiny text-ink-soft">{formatDate(item.submittedAt)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
