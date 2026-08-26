// 案件番号の表示フォーマット、案件名候補、繰り返し期限からの回次・タスク生成ロジック(仕様書 v1.8 3.3.1〜3.3.3, 5章)。

export function formatCampaignNo(campaignNo: number): string {
  return `A-${String(campaignNo).padStart(4, '0')}`;
}

// パス使用不可文字(/ \ : * ? " < > |)を「-」に置換する(仕様書 v1.8 6.1)。
// 末尾の「.」やスペースはWindowsのファイル/フォルダ名として不正(Dropboxのデスクトップアプリが
// ローカル同期時に末尾を「_」へ勝手に置き換えてしまい紛らわしい表示になる)ため、あわせて除去する。
// supabase/functions/_shared/dropbox.ts と同じロジック(要同期)。
export function sanitizeDropboxPathSegment(segment: string): string {
  return segment
    .replace(/[/\\:*?"<>|]/g, '-')
    .trim()
    .replace(/[.\s]+$/, '');
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

// バリエーションの表示名。SKU(商品番号)は見ただけでは何を指すかわからないため、
// Shopifyのバリエーション名(title、例:「フリー」「S / ピンク」)を優先し、無ければ
// サイズ・カラーの組み合わせ、それも無ければSKUにフォールバックする(実機フィードバック)。
export function variantLabel(v: {
  title?: string | null;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
}): string {
  if (v.title) return v.title;
  const sizeColor = [v.color, v.size].filter(Boolean).join(' / ');
  if (sizeColor) return sizeColor;
  return v.sku || '(バリエーション)';
}

// モニターの表示名。招待直後(本登録前)はnameがnullなのでinstagram_handleにフォールバックする。
// supabase/functions/_shared/profiles.ts の monitorDisplayName と同じロジック(要同期)。
export function monitorDisplayName(m: { name: string | null; instagramHandle?: string | null } | null | undefined): string {
  if (!m) return '(モニター不明)';
  return m.name ?? (m.instagramHandle ? `@${m.instagramHandle}(本登録前)` : '(名前未登録)');
}

// 月齢(整数)を「n歳nヶ月」形式のラベルにする。
export function formatAgeMonths(months: number | null | undefined): string {
  if (months === null || months === undefined) return '-';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return years > 0 ? `${years}歳${rem}ヶ月` : `${months}ヶ月`;
}

// 生年月(YYYY-MM-DD, 日は無視)と基準日から月齢を計算し「n歳nヶ月」形式のラベルを返す。
// 子ども一覧の「現在の年齢」表示、提出フォームの「撮影時点の年齢」表示の両方で使う。
export function computeAgeLabel(birthMonth: string, atDate: string): { months: number; label: string } {
  const [by, bm] = birthMonth.split('-').map(Number);
  const [ay, am] = atDate.split('-').map(Number);
  const months = Math.max(0, (ay - by) * 12 + (am - bm));
  return { months, label: formatAgeMonths(months) };
}

// ヘッダー等に表示する本人の呼び名。ニックネームがあれば優先し、無ければmonitorDisplayNameにフォールバックする。
export function profileDisplayName(p: {
  name: string | null;
  nickname: string | null;
  instagramHandle?: string | null;
}): string {
  return p.nickname || monitorDisplayName({ name: p.name, instagramHandle: p.instagramHandle });
}

// 子どもの呼び名の表示形式(例: そら → そらちゃん)。
export function childDisplayName(callName: string): string {
  return `${callName}ちゃん`;
}

// 今日時点(ローカル日付)のYYYY-MM-DD文字列。
export function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
