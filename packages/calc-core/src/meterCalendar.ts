import { Decimal } from './decimal-config.js';
import { countMeterPeriodDays, countMonthDays } from './japaneseHolidays.js';
import { CalendarInput, HolidayUsageRatio } from './touAllocation.js';

/**
 * 毎月の検針日が決まっているとき、各月の検針期間とその内訳を作る。
 *
 * 1か月ぶんの検針票しかないお客様の年間試算では、残りの11か月の
 * 日付は誰も入力していない。検針日が毎月同じ日だと仮定して、実際のカレンダー
 * （土日・祝日）から数える。
 *
 * 検針期間は「前月の検針日 〜 当月の検針日の前日」で、検針票の月は当月。
 * 画面の既定（前月6日〜当月5日）と同じ並びにしてある。
 */

/** 検針日として受け付ける範囲。1日にすると期間が前月に収まり、検針票の月と食い違う。29日以降は月によって無い */
export const MIN_READING_DAY = 2;
export const MAX_READING_DAY = 28;

/** 検針日が分からないときの既定。月の中ごろとみなす */
export const DEFAULT_READING_DAY = 15;

export function isValidReadingDay(day: number): boolean {
  return Number.isInteger(day) && day >= MIN_READING_DAY && day <= MAX_READING_DAY;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 検針票の月（year, month）の検針期間。検針日が範囲外なら null */
export function meterPeriodOf(
  year: number,
  month: number,
  readingDay: number
): { start: string; end: string } | null {
  if (!isValidReadingDay(readingDay)) return null;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return {
    start: `${prevYear}-${pad(prevMonth)}-${pad(readingDay)}`,
    end: `${year}-${pad(month)}-${pad(readingDay - 1)}`
  };
}

/**
 * 夜トクへの振り替えに渡す検針期間の内訳。
 * 休日電力使用割合は利用者の選択をそのまま引き継ぐ。
 */
export function meterCalendarOf(
  year: number,
  month: number,
  readingDay: number,
  holidayUsageRatio: HolidayUsageRatio
): CalendarInput | null {
  const period = meterPeriodOf(year, month, readingDay);
  if (!period) return null;
  // 検針日は2〜28日に絞ってあり、日付は必ず実在し、期間も約1か月に収まる。
  // 日数の数え上げ（実在しない日付・長すぎる期間で null を返す）は失敗しない
  const counts = countMeterPeriodDays(period.start, period.end)!;
  const julyDays = countMonthDays(period.start, period.end, 7)!;
  const octoberDays = countMonthDays(period.start, period.end, 10)!;
  return { ...counts, holidayUsageRatio, julyDays, octoberDays };
}

/**
 * 検針期間のうち、夏季単価（7/1〜9/30）にかかる日数の割合。
 *
 * 8月・9月の検針は期間の全体が夏季。7月の検針は期間のうち7月の分、
 * 10月の検針は期間のうち10月に入る前の分が夏季。それ以外の月は夏季にかからない。
 * 時間帯別電灯の夏季按分（④「時間帯別結果」R14）と同じ考え方。
 */
export function summerFractionOf(year: number, month: number, readingDay: number): Decimal | null {
  if (!isValidReadingDay(readingDay)) return null;
  if (month === 8 || month === 9) return new Decimal(1);
  if (month !== 7 && month !== 10) return new Decimal(0);

  const calendar = meterCalendarOf(year, month, readingDay, 'same')!;
  const days = new Decimal(calendar.days);
  return month === 7
    ? new Decimal(calendar.julyDays).dividedBy(days)
    : new Decimal(1).minus(new Decimal(calendar.octoberDays).dividedBy(days));
}
