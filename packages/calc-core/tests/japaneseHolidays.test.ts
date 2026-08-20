import { countMeterPeriodDays, countMonthDays, holidaysOf } from '../src/japaneseHolidays';

describe('国民の祝日', () => {
  it('2026年の固定祝日を含む', () => {
    const h = holidaysOf(2026);
    for (const key of ['1-1', '2-11', '2-23', '4-29', '5-3', '5-4', '5-5', '8-11', '11-3', '11-23']) {
      expect(h.has(key)).toBe(true);
    }
  });

  it('入力シートの注記にある「そのほか」も含む', () => {
    const h = holidaysOf(2026);
    for (const key of ['1-2', '1-3', '1-4', '5-1', '5-2', '12-30', '12-31']) {
      expect(h.has(key)).toBe(true);
    }
  });

  it('ハッピーマンデーは第n月曜になる', () => {
    // 2026年1月1日は木曜。第2月曜は1月12日。
    expect(holidaysOf(2026).has('1-12')).toBe(true);
    // 2026年7月第3月曜は7月20日
    expect(holidaysOf(2026).has('7-20')).toBe(true);
    // 2026年9月第3月曜は9月21日
    expect(holidaysOf(2026).has('9-21')).toBe(true);
    // 2026年10月第2月曜は10月12日
    expect(holidaysOf(2026).has('10-12')).toBe(true);
  });

  it('春分・秋分は年によって変わる', () => {
    expect(holidaysOf(2026).has('3-20')).toBe(true);
    expect(holidaysOf(2026).has('9-23')).toBe(true);
    expect(holidaysOf(2027).has('3-21')).toBe(true);
  });
});

describe('検針期間の日数内訳', () => {
  it('両端を含めて数える', () => {
    const r = countMeterPeriodDays('2026-03-05', '2026-04-04')!;
    expect(r.days).toBe(31);
  });

  it('土日と祝日を分けて数える', () => {
    // 2026-06-01(月) 〜 2026-06-30(火)。6月に祝日はない。
    const r = countMeterPeriodDays('2026-06-01', '2026-06-30')!;
    expect(r.days).toBe(30);
    expect(r.weekendDays).toBe(8);
    expect(r.holidayDays).toBe(0);
    expect(r.days - r.weekendDays - r.holidayDays).toBe(22);
  });

  it('土日と重なる祝日は祝日日数から除く', () => {
    // 2026-05-02(土)・5-3(日)は土日に含まれ、5-4(月)・5-5(火)が祝日として残る
    const r = countMeterPeriodDays('2026-05-01', '2026-05-05')!;
    expect(r.days).toBe(5);
    expect(r.weekendDays).toBe(2);
    expect(r.holidayDays).toBe(3); // 5/1(金), 5/4(月), 5/5(火)
  });

  it('年をまたぐ期間も数えられる', () => {
    const r = countMeterPeriodDays('2025-12-20', '2026-01-19')!;
    expect(r.days).toBe(31);
    expect(r.holidayDays).toBeGreaterThan(0);
  });

  it('開始日が終了日より後なら null', () => {
    expect(countMeterPeriodDays('2026-04-05', '2026-04-04')).toBeNull();
  });

  it('不正な日付は null', () => {
    expect(countMeterPeriodDays('2026-02-30', '2026-03-05')).toBeNull();
    expect(countMeterPeriodDays('2026/04/01', '2026-04-30')).toBeNull();
    expect(countMeterPeriodDays('2026-13-01', '2026-13-05')).toBeNull();
  });

  it('異常に長い期間は null', () => {
    expect(countMeterPeriodDays('2024-01-01', '2026-01-01')).toBeNull();
  });
});

describe('特定の月に属する日数', () => {
  it('7月検針の7月日数', () => {
    // 6/5〜7/4 なら 7月は4日
    expect(countMonthDays('2026-06-05', '2026-07-04', 7)).toBe(4);
  });

  it('10月検針の10月日数', () => {
    // 9/12〜10/11 なら 10月は11日
    expect(countMonthDays('2026-09-12', '2026-10-11', 10)).toBe(11);
  });

  it('該当月がなければ0', () => {
    expect(countMonthDays('2026-01-01', '2026-01-31', 7)).toBe(0);
  });

  it('不正な入力は null', () => {
    expect(countMonthDays('2026-04-05', '2026-04-04', 4)).toBeNull();
    expect(countMonthDays('bad', '2026-04-04', 4)).toBeNull();
  });
});
