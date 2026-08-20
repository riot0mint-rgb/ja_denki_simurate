/**
 * 検針期間から日数・土日日数・国民の祝日日数を算出する。
 *
 * ④の入力シートは「日数」「土日日数」「国民の祝日・そのほかの日数」を手入力させるが、
 * 検針期間の開始日と終了日が分かれば機械的に決まる。祝日の一覧は入力シート K5:N13 と
 * 注記「そのほかに該当する日 1/2、1/3、1/4、5/1、5/2、12/30、12/31」から取った。
 *
 * 土日と重なった祝日は土日日数に含まれるため祝日日数からは除く。
 * 入力シートの注記「土曜日と国民の祝日・そのほかが重なっている日は引く」と同じ扱い。
 */

/** その年の春分の日（1980〜2099年に有効な近似式） */
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** その年の秋分の日（1980〜2099年に有効な近似式） */
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** その月の第 n 月曜日の日 */
function nthMonday(year: number, month: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (nth - 1) * 7;
}

/** その年の国民の祝日・そのほかの日（月日の集合） */
export function holidaysOf(year: number): Set<string> {
  const key = (m: number, d: number) => `${m}-${d}`;
  return new Set([
    key(1, 1),                              // 元日
    key(1, nthMonday(year, 1, 2)),          // 成人の日
    key(2, 11),                             // 建国記念の日
    key(2, 23),                             // 天皇誕生日
    key(3, vernalEquinoxDay(year)),         // 春分の日
    key(4, 29),                             // 昭和の日
    key(5, 3),                              // 憲法記念日
    key(5, 4),                              // みどりの日
    key(5, 5),                              // こどもの日
    key(7, nthMonday(year, 7, 3)),          // 海の日
    key(8, 11),                             // 山の日
    key(9, nthMonday(year, 9, 3)),          // 敬老の日
    key(9, autumnalEquinoxDay(year)),       // 秋分の日
    key(10, nthMonday(year, 10, 2)),        // スポーツの日
    key(11, 3),                             // 文化の日
    key(11, 23),                            // 勤労感謝の日
    // 入力シートの注記にある「そのほか」
    key(1, 2), key(1, 3), key(1, 4), key(5, 1), key(5, 2), key(12, 30), key(12, 31)
  ]);
}

export interface MeterPeriodDays {
  /** 検針期間の日数（両端を含む） */
  days: number;
  /** 土曜・日曜の日数 */
  weekendDays: number;
  /** 国民の祝日・そのほかの日数（土日と重なる日は除く） */
  holidayDays: number;
}

/**
 * 検針期間（開始日〜終了日、両端を含む）の日数内訳。
 * 日付は 'YYYY-MM-DD' 形式。開始日が終了日より後の場合は null を返す。
 */
export function countMeterPeriodDays(startDate: string, endDate: string): MeterPeriodDays | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return null;

  // 検針期間は通常1か月程度。異常に長い入力は誤りとみなす。
  const spanDays = Math.round((end - start) / 86400000) + 1;
  if (spanDays > 400) return null;

  let days = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  const holidayCache = new Map<number, Set<string>>();

  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    const year = d.getUTCFullYear();
    const dow = d.getUTCDay();
    days += 1;
    if (dow === 0 || dow === 6) {
      weekendDays += 1;
      continue;
    }
    if (!holidayCache.has(year)) holidayCache.set(year, holidaysOf(year));
    if (holidayCache.get(year)!.has(`${d.getUTCMonth() + 1}-${d.getUTCDate()}`)) {
      holidayDays += 1;
    }
  }
  return { days, weekendDays, holidayDays };
}

function parseDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);
  // 2月30日のような存在しない日付を弾く
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return t;
}

/**
 * 検針期間のうち 7 月に属する日数と 10 月に属する日数。
 * 時間帯別電灯の夏季按分（結果シート R4 / R5）に使う。
 */
export function countMonthDays(startDate: string, endDate: string, month: number): number | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start === null || end === null || start > end) return null;
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    if (new Date(t).getUTCMonth() + 1 === month) count += 1;
  }
  return count;
}
