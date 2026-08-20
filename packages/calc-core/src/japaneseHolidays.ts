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

/**
 * 祝日が日曜と重なったとき、その後の最初の平日を振替休日にする（祝日法第3条第2項）。
 *
 * これが無いと、たとえば 2026年5月3日（憲法記念日）が日曜のため
 * 5月6日が休日でありながら平日として数えられ、ホリデータイムの按分がずれる。
 * ゴールデンウィークのように祝日が続く並びでは、連続する祝日を飛ばした先が振替になる。
 *
 * 振替の対象も、振替先を送る判定も、**国民の祝日だけ**で行う。
 * 条文が「その日後においてその日に最も近い『国民の祝日』でない日」と定めているため。
 *
 * 入力シートの注記にある「そのほか」（1/2〜1/4・5/1・5/2・12/30・12/31）は
 * 年末年始の慣行であって祝日法の対象ではない。これを飛ばす対象に含めると、
 * 元日が日曜の年に 1/2〜1/4 を飛び越えて **1/5 という存在しない休日を生やす**
 * （2034年・2023年で確認）。法どおり 1/2 が振替になり、それは既に「そのほか」にある。
 */
function substituteHolidays(year: number, statutory: Set<string>): string[] {
  const key = (m: number, d: number) => `${m}-${d}`;
  const out: string[] = [];
  for (const k of statutory) {
    const [m, d] = k.split('-').map(Number);
    // 祝日の日付は必ずその月に収まる（春分20〜21日・秋分22〜23日・第n月曜は最大21日）
    // ため、実在しない日付の判定は置いていない
    const date = new Date(Date.UTC(year, m - 1, d));
    if (date.getUTCDay() !== 0) continue;
    // 祝日が続く場合はその先の最初の非祝日まで送る
    const next = new Date(date);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (statutory.has(key(next.getUTCMonth() + 1, next.getUTCDate())));
    out.push(key(next.getUTCMonth() + 1, next.getUTCDate()));
  }
  return out;
}

/**
 * 前後を国民の祝日に挟まれた日を休日にする（祝日法第3条第3項「国民の休日」）。
 *
 * 敬老の日と秋分の日が中1日で並ぶ年に効く。2026年は 9/21（敬老の日）と
 * 9/23（秋分の日）の間の 9/22 が該当する。これが無いと 9月の検針期間で
 * ホリデータイムが1日ぶん少なく見積もられる。
 *
 * 振替休日と同じく、判定に使うのは国民の祝日だけ。「そのほか」を含めると
 * 年末年始に挟まれた日を勝手に休日にしてしまう。
 */
function bridgeHolidays(year: number, statutory: Set<string>): string[] {
  const key = (m: number, d: number) => `${m}-${d}`;
  const out: string[] = [];
  for (const k of statutory) {
    const [m, d] = k.split('-').map(Number);
    const middle = new Date(Date.UTC(year, m - 1, d + 1));
    const after = new Date(Date.UTC(year, m - 1, d + 2));
    const middleKey = key(middle.getUTCMonth() + 1, middle.getUTCDate());
    const afterKey = key(after.getUTCMonth() + 1, after.getUTCDate());
    if (!statutory.has(middleKey) && statutory.has(afterKey)) out.push(middleKey);
  }
  return out;
}

/** その年の国民の祝日・そのほかの日（月日の集合） */
export function holidaysOf(year: number): Set<string> {
  const key = (m: number, d: number) => `${m}-${d}`;
  const statutory = new Set([
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
    key(11, 23)                             // 勤労感謝の日
  ]);
  // 入力シートの注記にある「そのほか」。祝日法の対象ではないが休みとして数える
  const others = [key(1, 2), key(1, 3), key(1, 4), key(5, 1), key(5, 2), key(12, 30), key(12, 31)];
  // 国民の休日は祝日どうしの間に生まれるので、振替より先に求める
  const bridged = bridgeHolidays(year, statutory);
  const withBridged = new Set([...statutory, ...bridged]);
  return new Set([
    ...withBridged,
    ...others,
    ...substituteHolidays(year, withBridged)
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
  // 0（1970-01-01）を偽値として弾かないよう null で判定する。countMonthDays と揃える
  if (start === null || end === null || start > end) return null;

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
