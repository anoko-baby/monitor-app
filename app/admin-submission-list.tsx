import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { TextField } from '../components/TextField';
import { formatCampaignNo } from '../lib/campaigns';
import { getThumbnailSignedUrl } from '../lib/mediaPipeline';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 50;

type Row = {
  cycleId: string;
  campaignId: string;
  campaignNo: number;
  campaignTitle: string;
  monitorName: string;
  productLabel: string;
  cycleNo: number;
  cyclesCount: number;
  mediaTaskId: string | null;
  mediaStatus: string | null;
  mediaDueDate: string | null;
  mediaSubmittedAt: string | null;
  snsTaskId: string | null;
  snsStatus: string | null;
  snsDueDate: string | null;
  snsSubmittedAt: string | null;
  thumbUrl: string | null;
  hasStarred: boolean;
};

type StatusFilter = 'all' | 'pending' | 'submitted' | 'approved' | 'rejected' | 'overdue';
type TaskTypeFilter = 'all' | 'media' | 'sns';
type SortKey = 'due_date' | 'submitted_at' | 'monitor_name';

const STATUS_LABEL: Record<string, string> = {
  pending: '未提出',
  submitted: '提出済',
  approved: '確認済',
  rejected: '差し戻し',
  cancelled: 'キャンセル',
};

function isOverdue(status: string | null, dueDate: string | null): boolean {
  if (!status || !dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return (status === 'pending' || status === 'rejected') && dueDate < today;
}

function statusText(status: string | null, dueDate: string | null): string {
  if (!status) return '-';
  if (isOverdue(status, dueDate)) return '期限超過';
  return STATUS_LABEL[status] ?? status;
}

function matchesStatusFilter(filter: StatusFilter, status: string | null, dueDate: string | null): boolean {
  if (filter === 'all') return true;
  if (!status) return false;
  if (filter === 'overdue') return isOverdue(status, dueDate);
  return status === filter;
}

// 全提出一覧(仕様書 v1.8 3.6.2)。回次単位の1行にデータ/SNS両タスクのステータスを並べて表示する。
export default function AdminSubmissionList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [monitorFilter, setMonitorFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>('all');
  const [starOnly, setStarOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('due_date');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  async function load() {
    setLoading(true);

    let query = supabase.from('submission_list_view').select('*');
    if (monitorFilter) query = query.ilike('monitor_name', `%${monitorFilter}%`);
    if (brandFilter) query = query.ilike('product_brand', `%${brandFilter}%`);
    if (productFilter) query = query.ilike('product_title', `%${productFilter}%`);
    if (starOnly) query = query.eq('has_starred', true);

    const { data } = await query.limit(500);

    const mapped: Row[] = (data ?? []).map((r) => ({
      cycleId: r.cycle_id!,
      campaignId: r.campaign_id!,
      campaignNo: r.campaign_no!,
      campaignTitle: r.campaign_title ?? '',
      monitorName: r.monitor_name ?? '(モニター不明)',
      productLabel: [r.product_brand, r.product_title, r.product_sku].filter(Boolean).join(' / '),
      cycleNo: r.cycle_no!,
      cyclesCount: r.cycles_count!,
      mediaTaskId: r.media_task_id,
      mediaStatus: r.media_status,
      mediaDueDate: r.media_due_date,
      mediaSubmittedAt: r.media_submitted_at,
      snsTaskId: r.sns_task_id,
      snsStatus: r.sns_status,
      snsDueDate: r.sns_due_date,
      snsSubmittedAt: r.sns_submitted_at,
      thumbUrl: null,
      hasStarred: r.has_starred ?? false,
    }));

    const withThumbs = await Promise.all(
      mapped.map(async (row, index) => {
        const thumbnailPath = (data ?? [])[index]?.thumbnail_path;
        return { ...row, thumbUrl: thumbnailPath ? await getThumbnailSignedUrl(thumbnailPath) : null };
      })
    );

    setRows(withThumbs);
    setVisibleCount(PAGE_SIZE);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorFilter, brandFilter, productFilter, starOnly]);

  const filtered = useMemo(() => {
    let list = rows;

    if (statusFilter !== 'all') {
      list = list.filter((r) => {
        if (taskTypeFilter === 'media') return matchesStatusFilter(statusFilter, r.mediaStatus, r.mediaDueDate);
        if (taskTypeFilter === 'sns') return matchesStatusFilter(statusFilter, r.snsStatus, r.snsDueDate);
        return (
          matchesStatusFilter(statusFilter, r.mediaStatus, r.mediaDueDate) ||
          matchesStatusFilter(statusFilter, r.snsStatus, r.snsDueDate)
        );
      });
    }

    if (taskTypeFilter === 'sns') {
      list = list.filter((r) => r.snsTaskId);
    }

    if (keyword) {
      const kw = keyword.trim().toLowerCase();
      const campaignNoMatch = kw.match(/^a-?(\d+)$/i);
      list = list.filter((r) => {
        if (campaignNoMatch && r.campaignNo === parseInt(campaignNoMatch[1], 10)) return true;
        return (
          r.campaignTitle.toLowerCase().includes(kw) ||
          r.monitorName.toLowerCase().includes(kw) ||
          r.productLabel.toLowerCase().includes(kw) ||
          formatCampaignNo(r.campaignNo).toLowerCase().includes(kw)
        );
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === 'monitor_name') return a.monitorName.localeCompare(b.monitorName);
      const aVal = sortKey === 'due_date' ? a.mediaDueDate : a.mediaSubmittedAt;
      const bVal = sortKey === 'due_date' ? b.mediaDueDate : b.mediaSubmittedAt;
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });

    return sorted;
  }, [rows, statusFilter, taskTypeFilter, keyword, sortKey]);

  const visibleRows = filtered.slice(0, visibleCount);

  function openTask(taskId: string | null) {
    if (!taskId) return;
    router.push({ pathname: '/admin-submission-detail', params: { taskId } });
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="px-6 pt-6"
        style={{ maxHeight: 320 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-heading text-title-lg text-ink mb-4">全提出一覧</Text>

        <TextField label="キーワード検索(案件番号・案件名・モニター名・商品名)" value={keyword} onChangeText={setKeyword} />
        <TextField label="モニター名" value={monitorFilter} onChangeText={setMonitorFilter} />
        <View className="flex-row" style={{ gap: 8 }}>
          <View className="flex-1">
            <TextField label="ブランド" value={brandFilter} onChangeText={setBrandFilter} />
          </View>
          <View className="flex-1">
            <TextField label="商品名" value={productFilter} onChangeText={setProductFilter} />
          </View>
        </View>

        <Text className="font-body text-caption text-ink-soft mb-1">タスク種別</Text>
        <View className="flex-row mb-3" style={{ gap: 8 }}>
          {(['all', 'media', 'sns'] as TaskTypeFilter[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => setTaskTypeFilter(v)}
              className={`rounded-control border px-3 py-2 ${
                taskTypeFilter === v ? 'border-accent bg-accent' : 'border-line bg-surface'
              }`}
            >
              <Text className={`font-body text-caption ${taskTypeFilter === v ? 'text-white' : 'text-ink'}`}>
                {v === 'all' ? '全て' : v === 'media' ? 'データ' : 'SNS'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="font-body text-caption text-ink-soft mb-1">ステータス</Text>
        <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
          {(['all', 'pending', 'submitted', 'approved', 'rejected', 'overdue'] as StatusFilter[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => setStatusFilter(v)}
              className={`rounded-control border px-3 py-2 ${
                statusFilter === v ? 'border-accent bg-accent' : 'border-line bg-surface'
              }`}
            >
              <Text className={`font-body text-caption ${statusFilter === v ? 'text-white' : 'text-ink'}`}>
                {v === 'all' ? '全て' : v === 'overdue' ? '期限超過' : STATUS_LABEL[v]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="font-body text-caption text-ink-soft mb-1">並び順</Text>
        <View className="flex-row mb-3" style={{ gap: 8 }}>
          {(['due_date', 'submitted_at', 'monitor_name'] as SortKey[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => setSortKey(v)}
              className={`rounded-control border px-3 py-2 ${
                sortKey === v ? 'border-accent bg-accent' : 'border-line bg-surface'
              }`}
            >
              <Text className={`font-body text-caption ${sortKey === v ? 'text-white' : 'text-ink'}`}>
                {v === 'due_date' ? '期限日' : v === 'submitted_at' ? '提出日' : 'モニター名'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-row items-center justify-between mb-4">
          <Text className="font-body text-body text-ink">★のみ表示</Text>
          <Switch value={starOnly} onValueChange={setStarOnly} />
        </View>
      </ScrollView>

      <FlatList
        className="px-6"
        data={visibleRows}
        keyExtractor={(item) => item.cycleId}
        ListEmptyComponent={
          !loading ? (
            <Text className="font-body text-caption text-ink-soft mt-4">該当する提出がありません</Text>
          ) : null
        }
        ListFooterComponent={
          filtered.length > visibleRows.length ? (
            <Pressable onPress={() => setVisibleCount((c) => c + PAGE_SIZE)} className="items-center py-4">
              <Text className="font-body text-caption text-accent-ink">もっと見る</Text>
            </Pressable>
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
              <View style={{ width: 56, height: 56, borderRadius: 8, marginRight: 12 }} className="bg-line" />
            )}
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <Text className="font-body text-caption text-ink-soft">{formatCampaignNo(item.campaignNo)}</Text>
                {item.hasStarred && <Text className="font-body text-caption text-status-rejected">★</Text>}
              </View>
              <Text className="font-body-medium text-body text-ink" numberOfLines={1}>
                {item.monitorName}
              </Text>
              <Text className="font-body text-caption text-ink-soft" numberOfLines={1}>
                {item.productLabel || '(商品情報なし)'} ・ 第{item.cycleNo}回/全{item.cyclesCount}回
              </Text>
              <View className="flex-row mt-1" style={{ gap: 12 }}>
                <Pressable onPress={() => openTask(item.mediaTaskId)}>
                  <Text className="font-body text-caption text-accent-ink">
                    📷 {statusText(item.mediaStatus, item.mediaDueDate)}
                    {item.mediaDueDate ? `(${item.mediaDueDate})` : ''}
                  </Text>
                </Pressable>
                {item.snsTaskId && (
                  <Pressable onPress={() => openTask(item.snsTaskId)}>
                    <Text className="font-body text-caption text-accent-ink">
                      📱 {statusText(item.snsStatus, item.snsDueDate)}
                      {item.snsDueDate ? `(${item.snsDueDate})` : ''}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}
