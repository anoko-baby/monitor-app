// 案件番号の表示フォーマット、案件名候補、繰り返し期限からの回次・タスク生成ロジック(仕様書 v1.8 3.3.1〜3.3.3, 5章)。

export function formatCampaignNo(campaignNo: number): string {
  return `A-${String(campaignNo).padStart(4, '0')}`;
}

// パス使用不可文字(/ \ : * ? " < > |)を「-」に置換する(仕様書 v1.8 6.1)。
// supabase/functions/dropbox-create-campaign-folders/index.ts と同じロジック(要同期)。
export function sanitizeDropboxPathSegment(segment: string): string {
  return segment.replace(/[/\\:*?"<>|]/g, '-').trim();
}

// 回次フォルダ名(例: 第2回_20260910)。dropbox-create-campaign-foldersが作成時に使った命名と
// 同じロジックで、アップロード時にクライアント側からも同じフォルダ名を再現するために使う。
export function formatCycleFolderName(cycleNo: number, mediaDueDate: string): string {
  return sanitizeDropboxPathSegment(`第${cycleNo}回_${mediaDueDate.replaceAll('-', '')}`);
}

// 提出ファイル名(例: 02_001_IMG_1234.jpg)(仕様書 v1.8 6.1)。
export function formatSubmissionFileName(
  cycleNo: number,
  sequenceNo: number,
  originalFilename: string
): string {
  const cyclePart = String(cycleNo).padStart(2, '0');
  const seqPart = String(sequenceNo).padStart(3, '0');
  return `${cyclePart}_${seqPart}_${sanitizeDropboxPathSegment(originalFilename)}`;
}

export function suggestCampaignTitle(productLabel: string, monitorName: string): string {
  return `${productLabel} モニター(${monitorName}様)`;
}

function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [year, month] = dateStr.split('-').map((v) => parseInt(v, 10));
  return { year, month };
}

// 指定した「開始月+オフセット月数」の月に対して、日にちを月末に丸め込んだ上で YYYY-MM-DD を返す。
// 月末日指定(29〜31日)が存在しない月では、その月の末日に丸める(仕様書 v1.8 3.3.2)。
function resolveMonthlyDate(startMonth: string, offsetMonths: number, day: number): string {
  const { year, month } = parseYearMonth(startMonth);
  const totalMonthIndex = (month - 1) + offsetMonths;
  const targetYear = year + Math.floor(totalMonthIndex / 12);
  const targetMonth0 = ((totalMonthIndex % 12) + 12) % 12;
  const lastDayOfMonth = new Date(targetYear, targetMonth0 + 1, 0).getDate();
  const clampedDay = Math.min(day, lastDayOfMonth);
  const mm = String(targetMonth0 + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export type GeneratedCycle = { cycleNo: number; label: string };
export type GeneratedTask = { cycleNo: number; type: 'media' | 'sns'; dueDate: string };

export type GenerateCyclesInput =
  | {
      recurrenceType: 'once';
      onceMediaDueDate: string;
      snsRequired: boolean;
      snsOnceDueDate?: string;
    }
  | {
      recurrenceType: 'monthly';
      cyclesCount: number;
      startMonth: string;
      mediaDeadlineDay: number;
      snsRequired: boolean;
      snsFrequency?: 'every_cycle' | 'once';
      snsDeadlineDay?: number;
      snsOnceDueDate?: string;
    };

// 案件登録時に、繰り返し期限設定から回次・タスク(データ提出/SNS投稿)をまとめて生成する。
// 「案件全体で1回」のSNSタスクは第1回に属するタスクとして生成する(cyclesとは独立した置き場が
// 仕様書のDB設計に無いため。この解釈はM5実装時の判断)。
export function generateCyclesAndTasks(
  input: GenerateCyclesInput
): { cycles: GeneratedCycle[]; tasks: GeneratedTask[] } {
  if (input.recurrenceType === 'once') {
    const cycles: GeneratedCycle[] = [{ cycleNo: 1, label: '第1回' }];
    const tasks: GeneratedTask[] = [{ cycleNo: 1, type: 'media', dueDate: input.onceMediaDueDate }];
    if (input.snsRequired && input.snsOnceDueDate) {
      tasks.push({ cycleNo: 1, type: 'sns', dueDate: input.snsOnceDueDate });
    }
    return { cycles, tasks };
  }

  const cycles: GeneratedCycle[] = [];
  const tasks: GeneratedTask[] = [];

  for (let i = 0; i < input.cyclesCount; i++) {
    const cycleNo = i + 1;
    cycles.push({ cycleNo, label: `第${cycleNo}回` });
    tasks.push({
      cycleNo,
      type: 'media',
      dueDate: resolveMonthlyDate(input.startMonth, i, input.mediaDeadlineDay),
    });

    if (input.snsRequired && input.snsFrequency === 'every_cycle' && input.snsDeadlineDay) {
      tasks.push({
        cycleNo,
        type: 'sns',
        dueDate: resolveMonthlyDate(input.startMonth, i, input.snsDeadlineDay),
      });
    }
  }

  if (input.snsRequired && input.snsFrequency === 'once' && input.snsOnceDueDate) {
    tasks.push({ cycleNo: 1, type: 'sns', dueDate: input.snsOnceDueDate });
  }

  return { cycles, tasks };
}

export type CycleDotStatus = 'completed' | 'submitted' | 'pending' | 'overdue' | 'cancelled';

// 回次内の全タスク(データ/SNS)のステータスから、スナップボタン・ドット1個分の表示状態を決める(仕様書 v1.8 14.4)。
// rejected(差し戻し)は専用の見た目が無いため、期限超過でなければ pending 扱いにする。
export function deriveCycleStatus(
  taskStatuses: { status: string; dueDate: string }[]
): CycleDotStatus {
  if (taskStatuses.length === 0) return 'pending';

  const active = taskStatuses.filter((t) => t.status !== 'cancelled');
  if (active.length === 0) return 'cancelled';

  if (active.every((t) => t.status === 'approved')) return 'completed';

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = active.some(
    (t) => (t.status === 'pending' || t.status === 'rejected') && t.dueDate < today
  );
  if (isOverdue) return 'overdue';

  if (active.some((t) => t.status === 'submitted')) return 'submitted';

  return 'pending';
}
