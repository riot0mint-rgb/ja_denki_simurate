import {
  DEFAULT_READING_DAY,
  MAX_READING_DAY,
  MIN_READING_DAY,
  isValidReadingDay,
  meterCalendarOf,
  meterPeriodOf,
  summerFractionOf
} from '../src/meterCalendar';
import { countMeterPeriodDays } from '../src/japaneseHolidays';

describe('検針日の範囲', () => {
  it('2〜28日の整数だけ受け付ける', () => {
    expect([MIN_READING_DAY, MAX_READING_DAY, DEFAULT_READING_DAY]).toEqual([2, 28, 15]);
    for (const ok of [2, 6, 15, 28]) expect(isValidReadingDay(ok)).toBe(true);
    for (const ng of [1, 29, 0, -3, 15.5, NaN, Infinity]) expect(isValidReadingDay(ng)).toBe(false);
  });
});

describe('meterPeriodOf', () => {
  it('前月の検針日〜当月の検針日の前日', () => {
    expect(meterPeriodOf(2026, 7, 6)).toEqual({ start: '2026-06-06', end: '2026-07-05' });
    expect(meterPeriodOf(2026, 10, 28)).toEqual({ start: '2026-09-28', end: '2026-10-27' });
  });

  it('1月は前年の12月から始まる', () => {
    expect(meterPeriodOf(2026, 1, 6)).toEqual({ start: '2025-12-06', end: '2026-01-05' });
  });

  it('検針日が範囲外なら null', () => {
    expect(meterPeriodOf(2026, 7, 1)).toBeNull();
    expect(meterPeriodOf(2026, 7, 29)).toBeNull();
  });
});

describe('meterCalendarOf', () => {
  it('実際のカレンダーから日数・土日・祝日を数える', () => {
    const c = meterCalendarOf(2026, 7, 6, 'more')!;
    const direct = countMeterPeriodDays('2026-06-06', '2026-07-05')!;
    expect(c).toMatchObject({ ...direct, holidayUsageRatio: 'more' });
    expect(c.days).toBe(30);
    // 6/6〜7/5 のうち7月は 7/1〜7/5 の5日
    expect(c.julyDays).toBe(5);
    expect(c.octoberDays).toBe(0);
  });

  it('月ごとに土日・祝日の日数が違う', () => {
    // 2026年の海の日は7/20。8月検針（7/6〜8/5）には入り、7月検針（6/6〜7/5）には入らない
    const jul = meterCalendarOf(2026, 7, 6, 'same')!;
    const aug = meterCalendarOf(2026, 8, 6, 'same')!;
    expect(aug.holidayDays).toBe(jul.holidayDays + 1);
  });

  it('10月検針は期間のうち10月の日数を数える', () => {
    const c = meterCalendarOf(2026, 10, 6, 'same')!;
    expect(c.octoberDays).toBe(5);
    expect(c.julyDays).toBe(0);
  });

  it('検針日が範囲外なら null', () => {
    expect(meterCalendarOf(2026, 7, 29, 'same')).toBeNull();
  });
});

describe('summerFractionOf（夏季単価にかかる検針期間の割合）', () => {
  it('8月・9月の検針は期間の全体が夏季', () => {
    expect(summerFractionOf(2026, 8, 6)!.toString()).toBe('1');
    expect(summerFractionOf(2026, 9, 28)!.toString()).toBe('1');
  });

  it('夏季にかからない月は 0', () => {
    for (const month of [1, 2, 3, 4, 5, 6, 11, 12]) {
      expect(summerFractionOf(2026, month, 15)!.toString()).toBe('0');
    }
  });

  it('7月の検針は期間のうち7月の分（検針日6日なら 5/30）', () => {
    expect(summerFractionOf(2026, 7, 6)!.toFixed(6)).toBe((5 / 30).toFixed(6));
    // 検針日2日なら 7/1 の1日だけ
    expect(summerFractionOf(2026, 7, 2)!.toFixed(6)).toBe((1 / 30).toFixed(6));
  });

  it('10月の検針は期間のうち10月に入る前の分（検針日6日なら 25/30）', () => {
    expect(summerFractionOf(2026, 10, 6)!.toFixed(6)).toBe((25 / 30).toFixed(6));
    expect(summerFractionOf(2026, 10, 28)!.toFixed(6)).toBe((3 / 30).toFixed(6));
  });

  it('検針日が範囲外なら null', () => {
    expect(summerFractionOf(2026, 8, 1)).toBeNull();
    expect(summerFractionOf(2026, 7, 31)).toBeNull();
  });
});
