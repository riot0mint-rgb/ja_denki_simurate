import { Decimal } from '../src/decimal-config';
import { MonthlyDemandProfile } from '../src/demandProfile';
import { totalKwhOf, usageForMonth } from '../src/annualUsage';
import { UsageInput } from '../src/models';
import { meterCalendarOf } from '../src/meterCalendar';

const SOURCE = {
  document: 'テスト用',
  locator: 'テスト用',
  effectiveFrom: '2026-01',
  verificationStatus: 'verified' as const,
  verifiedAt: '2026-10-14'
};

/** 1月が2、7月が3、ほかは1。倍率が読み取りやすい形 */
const PROFILE: MonthlyDemandProfile = {
  id: 'test',
  label: 'テスト',
  description: 'テスト',
  monthlyIndex: [2, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1].map(v => new Decimal(v)),
  source: SOURCE
};

const OCT_2026 = { year: 2026, month: 10 };
const at = (year: number, month: number) => ({ year, month });

describe('基準月', () => {
  it('入力した月はそのまま（同じ参照）返す。丸めも区分の振り直しもしない', () => {
    const base: UsageInput = { tou: { daySummer: 10.5, dayOther: 20.5, night: 30, holiday: 5 }, contractKw: 6 };
    expect(
      usageForMonth({ form: 'tou', base, baseMonth: OCT_2026, target: OCT_2026, profile: PROFILE })
    ).toBe(base);
  });
});

describe('総使用量だけのプラン', () => {
  const base: UsageInput = { totalKwh: 300, contractKva: 10 };

  it('季節の指数の比で増減させる（他の入力は引き継ぐ）', () => {
    // 基準10月（指数1）→ 1月（指数2）
    const jan = usageForMonth({ form: 'total', base, baseMonth: OCT_2026, target: at(2026, 1), profile: PROFILE });
    expect(jan).toEqual({ totalKwh: 600, contractKva: 10 });
    const jul = usageForMonth({ form: 'total', base, baseMonth: OCT_2026, target: at(2026, 7), profile: PROFILE });
    expect(jul?.totalKwh).toBe(900);
  });

  it('基準月が重い月なら、ほかの月は減る', () => {
    const jan = { year: 2026, month: 1 };
    const out = usageForMonth({ form: 'total', base, baseMonth: jan, target: OCT_2026, profile: PROFILE });
    expect(out?.totalKwh).toBe(150);
  });

  it('profile が null なら増減させない（毎月おなじ）', () => {
    const out = usageForMonth({ form: 'total', base, baseMonth: OCT_2026, target: at(2026, 1), profile: null });
    expect(out?.totalKwh).toBe(300);
  });

  it('整数 kWh に丸める', () => {
    const out = usageForMonth({
      form: 'total',
      base: { totalKwh: 333 },
      baseMonth: at(2026, 1),
      target: at(2026, 2),
      profile: PROFILE
    });
    expect(out?.totalKwh).toBe(167); // 166.5 の四捨五入
  });

  it('検針日が不正でも総使用量だけのプランには関係しない', () => {
    const out = usageForMonth({
      form: 'total',
      base,
      baseMonth: OCT_2026,
      target: at(2026, 1),
      profile: null,
      readingDay: 31
    });
    expect(out?.totalKwh).toBe(300);
  });
});

describe('低圧電力（夏季／その他季）', () => {
  const base: UsageInput = { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 400 }, totalKwh: 400 };

  it('夏季にかからない月は全量がその他季', () => {
    const out = usageForMonth({ form: 'seasonal', base, baseMonth: OCT_2026, target: at(2026, 1), profile: null });
    expect(out?.seasonal).toEqual({ summerKwh: 0, otherKwh: 400 });
    expect(out?.totalKwh).toBe(400);
    expect(out?.contractKw).toBe(6);
  });

  it('8月・9月は全量が夏季（基準月がその他季でも振り直す）', () => {
    const out = usageForMonth({ form: 'seasonal', base, baseMonth: OCT_2026, target: at(2026, 8), profile: null });
    expect(out?.seasonal).toEqual({ summerKwh: 400, otherKwh: 0 });
  });

  it('季節をまたぐ7月は検針日から夏季の割合を数える（検針日6日なら 5/30）', () => {
    const out = usageForMonth({
      form: 'seasonal',
      base,
      baseMonth: OCT_2026,
      target: at(2026, 7),
      profile: null,
      readingDay: 6
    });
    // 400 × 5/30 = 66.67 → 67
    expect(out?.seasonal).toEqual({ summerKwh: 67, otherKwh: 333 });
  });

  it('使用量の増減と区分の振り分けは両立する（7月は指数3倍）', () => {
    const out = usageForMonth({
      form: 'seasonal',
      base,
      baseMonth: OCT_2026,
      target: at(2026, 7),
      profile: PROFILE,
      readingDay: 6
    });
    // 総量 1200 → 夏季 1200 × 5/30 = 200
    expect(out?.seasonal).toEqual({ summerKwh: 200, otherKwh: 1000 });
    expect(out?.totalKwh).toBe(1200);
  });

  it('検針日を省略すると月の中ごろ（15日）とみなす', () => {
    const out = usageForMonth({ form: 'seasonal', base, baseMonth: OCT_2026, target: at(2026, 7), profile: null });
    // 6/15〜7/14 → 7月は14日 / 30日
    expect(out?.seasonal?.summerKwh).toBe(187);
  });

  it('検針日が範囲外なら組み立てない', () => {
    for (const readingDay of [1, 29, 15.5]) {
      expect(
        usageForMonth({ form: 'seasonal', base, baseMonth: OCT_2026, target: at(2026, 7), profile: null, readingDay })
      ).toBeNull();
    }
  });
});

describe('電化Style・ナイトホリデー（4区分）', () => {
  const base: UsageInput = {
    contractKw: 6,
    allElectricDiscount: true,
    tou: { daySummer: 0, dayOther: 100, night: 200, holiday: 50 }
  };

  it('区分の割合は入力した月のまま、全体の量だけ季節で動く', () => {
    const out = usageForMonth({ form: 'tou', base, baseMonth: OCT_2026, target: at(2026, 1), profile: PROFILE });
    expect(out?.tou).toEqual({ daySummer: 0, dayOther: 200, night: 400, holiday: 100 });
    expect(out?.contractKw).toBe(6);
    expect(out?.allElectricDiscount).toBe(true);
  });

  it('デイタイムは月ごとに夏季／その他季へ振り直す（8月は全量が夏季）', () => {
    const out = usageForMonth({ form: 'tou', base, baseMonth: OCT_2026, target: at(2026, 8), profile: null });
    expect(out?.tou).toEqual({ daySummer: 100, dayOther: 0, night: 200, holiday: 50 });
  });

  it('基準月が夏季と その他季に分かれていても、デイタイムの合計から振り直す', () => {
    const mixed: UsageInput = { ...base, tou: { daySummer: 30, dayOther: 70, night: 200, holiday: 50 } };
    const out = usageForMonth({ form: 'tou', base: mixed, baseMonth: OCT_2026, target: at(2026, 12), profile: null });
    expect(out?.tou).toEqual({ daySummer: 0, dayOther: 100, night: 200, holiday: 50 });
  });

  it('Decimal で渡された使用量も扱える', () => {
    const decimalBase: UsageInput = {
      contractKw: 6,
      tou: { daySummer: new Decimal('0'), dayOther: new Decimal('100.4'), night: new Decimal('200'), holiday: new Decimal('50') }
    };
    const out = usageForMonth({ form: 'tou', base: decimalBase, baseMonth: OCT_2026, target: at(2026, 12), profile: null });
    expect(out?.tou).toEqual({ daySummer: 0, dayOther: 100, night: 200, holiday: 50 });
  });

  it('検針日が範囲外なら組み立てない', () => {
    expect(
      usageForMonth({ form: 'tou', base, baseMonth: OCT_2026, target: at(2026, 7), profile: null, readingDay: 40 })
    ).toBeNull();
  });
});

describe('ファミリータイム（夜トクへ振り替える）', () => {
  const calendar = meterCalendarOf(2026, 10, 6, 'more')!;
  const base: UsageInput = {
    contractKva: 10,
    allElectricDiscount: true,
    calendar,
    familyTime: { daySummer: 0, dayOther: 120, family: 80, night: 250 }
  };

  it('4区分を季節の指数で動かし、検針期間は月ごとの実際のカレンダーに替える', () => {
    const out = usageForMonth({
      form: 'family',
      base,
      baseMonth: OCT_2026,
      target: at(2026, 1),
      profile: PROFILE,
      readingDay: 6
    });
    expect(out?.familyTime).toEqual({ daySummer: 0, dayOther: 240, family: 160, night: 500 });
    expect(out?.calendar).toEqual(meterCalendarOf(2026, 1, 6, 'more'));
    expect(out?.allElectricDiscount).toBe(true);
    expect(out?.contractKva).toBe(10);
  });

  it('休日電力使用割合は入力のまま引き継ぐ', () => {
    const out = usageForMonth({ form: 'family', base, baseMonth: OCT_2026, target: at(2026, 3), profile: null, readingDay: 6 });
    expect(out?.calendar?.holidayUsageRatio).toBe('more');
  });

  it('デイタイムの夏季／その他季は月ごとに振り直す（7月、検針日6日なら 5/30）', () => {
    const out = usageForMonth({ form: 'family', base, baseMonth: OCT_2026, target: at(2026, 7), profile: null, readingDay: 6 });
    expect(out?.familyTime?.daySummer).toBe(20);
    expect(out?.familyTime?.dayOther).toBe(100);
  });

  it('元の入力に検針期間の情報が無ければ組み立てない（推測しない）', () => {
    const noCalendar: UsageInput = { ...base, calendar: undefined };
    expect(usageForMonth({ form: 'family', base: noCalendar, baseMonth: OCT_2026, target: at(2026, 1), profile: null })).toBeNull();
  });
});

describe('時間帯別電灯（エコノミーナイト）', () => {
  const calendar = meterCalendarOf(2026, 10, 6, 'same')!;
  const base: UsageInput = { contractKva: 8, calendar, economyNight: { dayKwh: 200, nightKwh: 300 } };

  it('昼間・夜間を季節の指数で動かし、検針期間を月ごとに替える', () => {
    const out = usageForMonth({
      form: 'economy_night',
      base,
      baseMonth: OCT_2026,
      target: at(2026, 1),
      profile: PROFILE,
      readingDay: 6
    });
    expect(out?.economyNight).toEqual({ dayKwh: 400, nightKwh: 600 });
    expect(out?.calendar).toEqual(meterCalendarOf(2026, 1, 6, 'same'));
  });

  it('元の入力に検針期間の情報が無ければ組み立てない', () => {
    expect(
      usageForMonth({ form: 'economy_night', base: { ...base, calendar: undefined }, baseMonth: OCT_2026, target: at(2026, 1), profile: null })
    ).toBeNull();
  });
});

describe('totalKwhOf（画面に出す総使用量）', () => {
  it('形式ごとに該当の欄を合計する', () => {
    expect(totalKwhOf('total', { totalKwh: 123 })).toBe(123);
    expect(totalKwhOf('total', {})).toBe(0);
    expect(totalKwhOf('seasonal', { seasonal: { summerKwh: 10, otherKwh: 20 } })).toBe(30);
    expect(totalKwhOf('seasonal', {})).toBe(0);
    expect(totalKwhOf('tou', { tou: { daySummer: 1, dayOther: 2, night: 3, holiday: 4 } })).toBe(10);
    expect(totalKwhOf('tou', {})).toBe(0);
    expect(totalKwhOf('family', { familyTime: { daySummer: 1, dayOther: 2, family: 3, night: 4 } })).toBe(10);
    expect(totalKwhOf('family', {})).toBe(0);
    expect(totalKwhOf('economy_night', { economyNight: { dayKwh: 5, nightKwh: 6 } })).toBe(11);
    expect(totalKwhOf('economy_night', {})).toBe(0);
  });

  it('Decimal の使用量も足せる', () => {
    expect(totalKwhOf('tou', { tou: { night: new Decimal('1.5'), holiday: new Decimal('2.5') } })).toBe(4);
  });
});
