import { Decimal } from '../src/decimal-config';
import { CalendarInput, allocateFromEconomyNight } from '../src/touAllocation';

/**
 * ④「時間帯別結果」の按分式を、セル単位で固定する。
 *
 * ファミリー系は `familyTime.test.ts` が実データ（中電15,876円 / 夜トク16,180円）で
 * 押さえているが、時間帯別電灯は元資料の入力が全て0のため突合点が無い。
 * 金額で縛れない代わりに、**式の関係そのもの**を期待値に据える。
 *
 * 元資料の該当セル（'時間帯別結果'）:
 *
 *   R2  = 日数           R3  = 土日日数        R7  = R2 - R3 - R6（平日日数）
 *   T2  = 休日割合
 *   R8  = 全体の使用電力  T8  = R8/R2          V8  = T8*R3    X8  = V8*T2
 *   R9  = 昼間料金        T9  = R9/R2          V9  = T9*R7    X9  = V9/T2
 *   R10 = 夜間料金        T10 = R10/R2         V10 = T10*R7   X10 = V10/T2
 *   R12 = R8 - X8 - X9 - X10       （全体使用余り）
 *   T12 = R12 * (R3/R2)            （余りの土日割合）
 *   V12 = R12 - T12                （余りの平日分）
 *   R13 = X9                       （デイタイム。余りは足さない）
 *   R16 = X10 + V12                （ナイトタイム。平日の余りを全部受け取る）
 *   R17 = X8  + T12                （ホリデータイム。土日の余りを受け取る）
 */
describe('④時間帯別電灯 → 夜トクの按分（元資料の式を固定）', () => {
  const calendar = (over: Partial<CalendarInput> = {}): CalendarInput => ({
    days: 30,
    weekendDays: 8,
    holidayDays: 2,
    holidayUsageRatio: 'same',
    julyDays: 0,
    octoberDays: 0,
    ...over
  });

  const alloc = (day: number, night: number, cal: CalendarInput = calendar()) => {
    const r = allocateFromEconomyNight(
      { dayKwh: new Decimal(day), nightKwh: new Decimal(night) },
      cal,
      1
    );
    const step = (label: string) => r.steps.find(s => s.label === label)!.value;
    return {
      bands: r.bands,
      dayConverted: step('デイタイム平日換算'),
      nightConverted: step('ナイトタイム平日換算'),
      holidayConverted: step('休日換算'),
      remainder: step('按分の余り')
    };
  };

  // 有効桁の丸めで合計が 1e-25 ずれると、賦課金の切り捨てで1円安くなる。
  // しかも必ず乗り換え先が安くなる方向に出る
  it('合計は総使用量に厳密に一致する（丸め誤差も残さない）', () => {
    for (const days of [28, 29, 30, 31]) {
      for (const weekendDays of [8, 9, 10, 11]) {
        for (const holidayUsageRatio of ['same', 'more', 'much_more'] as const) {
          for (const [d, n] of [
            [26, 174],
            [123, 456],
            [37, 163]
          ]) {
            const cal = calendar({ days, weekendDays, holidayDays: 2, holidayUsageRatio });
            const { bands } = alloc(d, n, cal);
            const sum = Object.values(bands).reduce((a, v) => a.plus(v), new Decimal('0'));
            expect(sum.equals(d + n)).toBe(true);
          }
        }
      }
    }
  });

  it('4区分の合計は総使用量に戻る', () => {
    for (const [d, n] of [
      [200, 300],
      [0, 500],
      [500, 0],
      [123, 456]
    ]) {
      const { bands } = alloc(d, n);
      const sum = Object.values(bands).reduce((a, v) => a.plus(v), new Decimal('0'));
      expect(sum.toNumber()).toBeCloseTo(d + n, 6);
    }
  });

  // R13 = X9（余りを足さない）に対し R16 = X10 + V12（平日の余りを全部受け取る）。
  // 「デイタイムにも比例配分すべきでは」と直したくなる箇所なので、
  // 元資料がそうなっていることを明示して固定する
  it('平日の余りはナイトタイムだけが受け取る（デイタイムには回らない）', () => {
    const cal = calendar();
    const a = alloc(200, 400, cal);
    expect(a.remainder.greaterThan(0)).toBe(true);

    const weekendRemainder = a.remainder.times(cal.weekendDays).dividedBy(cal.days);
    const weekdayRemainder = a.remainder.minus(weekendRemainder);

    // デイタイムは換算値そのまま（R13 = X9）
    expect(a.bands.dayOther.plus(a.bands.daySummer).toNumber()).toBeCloseTo(
      a.dayConverted.toNumber(),
      6
    );
    // ナイトタイムは換算値 + 平日の余り（R16 = X10 + V12）
    expect(a.bands.night.toNumber()).toBeCloseTo(
      a.nightConverted.plus(weekdayRemainder).toNumber(),
      6
    );
  });

  it('土日の余りはホリデータイムが受け取る', () => {
    const cal = calendar();
    const a = alloc(200, 400, cal);
    const weekendRemainder = a.remainder.times(cal.weekendDays).dividedBy(cal.days);

    // R17 = X8 + T12
    expect(a.bands.holiday.toNumber()).toBeCloseTo(
      a.holidayConverted.plus(weekendRemainder).toNumber(),
      6
    );
  });

  it('休日割合を上げるとホリデータイムが増え、その分ほかが減る', () => {
    const same = alloc(200, 400, calendar({ holidayUsageRatio: 'same' })).bands;
    const much = alloc(200, 400, calendar({ holidayUsageRatio: 'much_more' })).bands;
    expect(much.holiday.greaterThan(same.holiday)).toBe(true);
    expect(much.night.lessThan(same.night)).toBe(true);
  });

  it('デイタイムの夏季分は対象月で決まる', () => {
    const cal = calendar({ julyDays: 15, octoberDays: 0 });
    const u = { dayKwh: new Decimal('200'), nightKwh: new Decimal('400') };

    // 1月は全量その他季
    expect(allocateFromEconomyNight(u, cal, 1).bands.daySummer.isZero()).toBe(true);
    // 8月は全量夏季
    expect(allocateFromEconomyNight(u, cal, 8).bands.dayOther.isZero()).toBe(true);
    // 7月は検針期間の7月日数の割合だけ夏季
    const july = allocateFromEconomyNight(u, cal, 7).bands;
    expect(july.daySummer.greaterThan(0)).toBe(true);
    expect(july.dayOther.greaterThan(0)).toBe(true);
  });
});
