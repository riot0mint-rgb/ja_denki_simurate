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

describe('国民の休日（祝日法第3条第3項）', () => {
  const has = (year: number, key: string) => holidaysOf(year).has(key);

  it('祝日に前後を挟まれた日は休日になる', () => {
    // 2026年は 9/21 敬老の日 と 9/23 秋分の日 の間の 9/22
    expect(has(2026, '9-21')).toBe(true);
    expect(has(2026, '9-22')).toBe(true);
    expect(has(2026, '9-23')).toBe(true);
    // 2032年は 9/20 と 9/22 の間の 9/21
    expect(has(2032, '9-21')).toBe(true);
  });

  it('祝日が離れている年には作らない', () => {
    // 2025年は 9/15 敬老の日 と 9/23 秋分の日 で中1日ではない
    expect(has(2025, '9-16')).toBe(false);
    expect(has(2025, '9-22')).toBe(false);
  });

  it('「そのほか」に挟まれた日は休日にしない', () => {
    // 1/2 と 1/4 は「そのほか」。間の 1/3 は元から「そのほか」だが、
    // 12/31 と 1/2 に挟まれた 1/1 のような判定を持ち込まない
    expect(has(2026, '12-29')).toBe(false);
  });

  it('国民の休日も検針期間の祝日日数に数える', () => {
    // 2026-09-06〜10-05 には 9/21・9/22・9/23 が入る（すべて平日）
    expect(countMeterPeriodDays('2026-09-06', '2026-10-05')?.holidayDays).toBe(3);
  });
});

describe('振替休日（祝日法第3条第2項）', () => {
  const has = (year: number, key: string) => holidaysOf(year).has(key);

  it('日曜と重なった祝日は翌日が振替になる', () => {
    // 2025-11-23 勤労感謝の日は日曜
    expect(has(2025, '11-24')).toBe(true);
    // 2025-02-23 天皇誕生日も日曜
    expect(has(2025, '2-24')).toBe(true);
  });

  it('祝日が続く並びでは、その先の最初の非休日が振替になる', () => {
    // 2026-05-03 憲法記念日が日曜。5/4・5/5 も祝日なので 5/6 が振替
    expect(has(2026, '5-6')).toBe(true);
  });

  it('春分・秋分が日曜でも振替になる', () => {
    // 2027-03-21 春分の日は日曜
    expect(has(2027, '3-22')).toBe(true);
  });

  it('「そのほか」の日からは振替を作らない（元資料に無い休日を生やさない）', () => {
    // 2026-01-04 は日曜だが年末年始の慣行であって国民の祝日ではない
    expect(has(2026, '1-4')).toBe(true);
    expect(has(2026, '1-5')).toBe(false);
  });

  it('元日が日曜でも 1/5 のような存在しない休日を生やさない', () => {
    // 条文は「国民の祝日でない日」まで送る。1/2 は「そのほか」であって祝日ではないので
    // そこが振替になる。1/2〜1/4 を飛び越えてはいけない
    expect(has(2034, '1-1')).toBe(true);
    expect(has(2034, '1-2')).toBe(true);
    expect(has(2034, '1-5')).toBe(false);
    expect(has(2023, '1-5')).toBe(false);
  });

  it('土曜と重なった祝日には振替を作らない', () => {
    // 2026-08-11 山の日は火曜。振替が生まれていないこと
    expect(has(2026, '8-12')).toBe(false);
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
