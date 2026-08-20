import { BillingCalculator } from '../src/calculator';
import { Decimal } from '../src/decimal-config';
import { lookupFuelAdjustment, lookupRenewableLevy, RatePeriod } from '../src/monthlyRates';
import { RatePlan, UsageInput } from '../src/models';
import { CalendarInput, allocateFromFamilyTime, allocateFromEconomyNight } from '../src/touAllocation';
import * as F from './fixtures';

const calculator = new BillingCalculator();

function bill(plan: RatePlan, usage: UsageInput, period: RatePeriod) {
  const r = calculator.calculate({
    usage,
    plan,
    fuelAdjustment: lookupFuelAdjustment(period)!.value,
    renewableLevy: lookupRenewableLevy(period)!.value
  });
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
}

/**
 * ④の入力シートに実際に入っている値をそのまま使う唯一の検証ケース。
 * 対象年月 2026年1月・契約6kVA・検針28日（土日8・祝日1）・休日割合「同じくらい」・電化住宅割あり
 * デイタイム夏季0 / デイタイムその他季23 / ファミリータイム152 / ナイトタイム376
 */
const CASE_PERIOD: RatePeriod = { year: 2026, month: 1 };
const CASE_CALENDAR: CalendarInput = {
  days: 28,
  weekendDays: 8,
  holidayDays: 1,
  holidayUsageRatio: 'same',
  // ④の実データは1月検針。7月・10月にかからないので 0
  julyDays: 0,
  octoberDays: 0
};
const CASE_FAMILY = { daySummer: 0, dayOther: 23, family: 152, night: 376 };

describe('④ファミリータイムⅡ 実データとの突合', () => {
  it('中国電力 ファミリータイムⅡ = 15,876円', () => {
    // 出典: ④'ファミリーⅡ結果'!H18
    const b = bill(
      F.chugokuFamilyTime2,
      { contractKva: 6, familyTime: CASE_FAMILY, allElectricDiscount: true },
      CASE_PERIOD
    );
    expect(b.total.toNumber()).toBe(15876);
    expect(b.discount.toNumber()).toBeCloseTo(-1674.7968, 4);
  });

  it('夜トクへ振り替えた時間帯配分が元資料と一致する', () => {
    // 出典: ④'ファミリーⅡ結果'!G26:G29
    const a = allocateFromFamilyTime(
      {
        daySummerKwh: new Decimal(0),
        dayOtherKwh: new Decimal(23),
        familyKwh: new Decimal(152),
        nightKwh: new Decimal(376)
      },
      CASE_CALENDAR
    );
    expect(a.bands.daySummer.toNumber()).toBeCloseTo(0, 6);
    expect(a.bands.dayOther.toNumber()).toBeCloseTo(67.17857142857143, 8);
    expect(a.bands.night.toNumber()).toBeCloseTo(306.7142857142857, 8);
    expect(a.bands.holiday.toNumber()).toBeCloseTo(177.10714285714283, 8);
    // 4区分の合計は元の総使用量に戻る
    const sum = a.bands.daySummer.plus(a.bands.dayOther).plus(a.bands.night).plus(a.bands.holiday);
    expect(sum.toNumber()).toBeCloseTo(551, 8);
  });

  it('JAでんき 夜トクプラン = 16,180円 / 中国電力 電化Style = 16,301円', () => {
    // 出典: ④'ファミリーⅡ結果'!H33 / L33
    const a = allocateFromFamilyTime(
      {
        daySummerKwh: new Decimal(0),
        dayOtherKwh: new Decimal(23),
        familyKwh: new Decimal(152),
        nightKwh: new Decimal(376)
      },
      CASE_CALENDAR
    );
    const usage: UsageInput = {
      contractKw: 6,
      tou: {
        daySummer: a.bands.daySummer.toNumber(),
        dayOther: a.bands.dayOther.toNumber(),
        night: a.bands.night.toNumber(),
        holiday: a.bands.holiday.toNumber()
      }
    };
    expect(bill(F.jaDenkiYotoku, usage, CASE_PERIOD).total.toNumber()).toBe(16180);
    expect(bill(F.chugokuDenkaStyle, usage, CASE_PERIOD).total.toNumber()).toBe(16301);
  });

  it('この条件では夜トクへの乗り換えで割高になる（元資料 H35 = +304）', () => {
    const current = bill(
      F.chugokuFamilyTime2,
      { contractKva: 6, familyTime: CASE_FAMILY, allElectricDiscount: true },
      CASE_PERIOD
    ).total;
    expect(16180 - current.toNumber()).toBe(304);
  });
});

describe('ファミリータイムⅠ', () => {
  it('基本料金と単価が元資料どおり', () => {
    const b = bill(
      F.chugokuFamilyTime1,
      { contractKva: 6, familyTime: { dayOther: 100, family: 100, night: 100 } },
      CASE_PERIOD
    );
    expect(b.baseCharge.toNumber()).toBe(2577.1);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(42.57 * 100 + 42.33 * 100 + 30.34 * 100, 6);
  });

  it('10kVA超過分が基本料金に加算される', () => {
    const at10 = bill(F.chugokuFamilyTime1, { contractKva: 10, familyTime: { night: 100 } }, CASE_PERIOD);
    const at12 = bill(F.chugokuFamilyTime1, { contractKva: 12, familyTime: { night: 100 } }, CASE_PERIOD);
    expect(at12.baseCharge.minus(at10.baseCharge).toNumber()).toBeCloseTo(481.77 * 2, 6);
  });

  it('電化住宅割は上限3,300円でクリップされる', () => {
    const b = bill(
      F.chugokuFamilyTime1,
      { contractKva: 6, familyTime: { night: 10000 }, allElectricDiscount: true },
      CASE_PERIOD
    );
    expect(b.discount.toNumber()).toBe(-3300);
  });

  it('電化住宅割なしなら割引は0', () => {
    const b = bill(F.chugokuFamilyTime1, { contractKva: 6, familyTime: { night: 100 } }, CASE_PERIOD);
    expect(b.discount.toNumber()).toBe(0);
    expect(b.notes).toEqual([]);
  });

  it('使用量が未入力なら unsupported', () => {
    const r = calculator.calculate({
      usage: { contractKva: 6 },
      plan: F.chugokuFamilyTime1,
      fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
      renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
    });
    expect(r.status).toBe('unsupported');
  });

  it('負の使用量は unsupported', () => {
    const r = calculator.calculate({
      usage: { contractKva: 6, familyTime: { night: -1 } },
      plan: F.chugokuFamilyTime1,
      fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
      renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
    });
    expect(r.status).toBe('unsupported');
  });

  it('契約容量が未入力なら unsupported', () => {
    const r = calculator.calculate({
      usage: { familyTime: { night: 100 } },
      plan: F.chugokuFamilyTime1,
      fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
      renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
    });
    expect(r.status).toBe('unsupported');
  });
});

describe('時間帯別電灯（エコノミーナイト）', () => {
  const usage = (day: number, night: number): UsageInput => ({
    contractKva: 6,
    economyNight: { dayKwh: day, nightKwh: night }
  });

  it('昼間時間は 90 / 220 kWh で段階が変わる', () => {
    const b = bill(F.chugokuEconomyNight, usage(300, 0), CASE_PERIOD);
    expect(b.lines[0].quantity!.toNumber()).toBe(90);
    expect(b.lines[1].quantity!.toNumber()).toBe(130);
    expect(b.lines[2].quantity!.toNumber()).toBe(80);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(
      38.22 * 90 + 43.82 * 130 + 44.86 * 80,
      6
    );
  });

  it('昼間が90kWh以下なら第1段階のみ', () => {
    const b = bill(F.chugokuEconomyNight, usage(50, 0), CASE_PERIOD);
    expect(b.lines[0].quantity!.toNumber()).toBe(50);
    expect(b.lines[1].quantity!.toNumber()).toBe(0);
    expect(b.lines[2].quantity!.toNumber()).toBe(0);
  });

  it('夜間は一律単価', () => {
    const b = bill(F.chugokuEconomyNight, usage(0, 400), CASE_PERIOD);
    expect(b.lines[3].amount.toNumber()).toBeCloseTo(30.34 * 400, 6);
  });

  it('基本料金は 1,578.72円（10kVAまで）', () => {
    expect(bill(F.chugokuEconomyNight, usage(0, 0), CASE_PERIOD).baseCharge.toNumber()).toBe(1578.72);
  });

  it('10kVA超過分が基本料金に加算される', () => {
    const b = bill(
      F.chugokuEconomyNight,
      { contractKva: 13, economyNight: { dayKwh: 100, nightKwh: 100 } },
      CASE_PERIOD
    );
    expect(b.baseCharge.toNumber()).toBeCloseTo(1578.72 + 480.37 * 3, 6);
    expect(b.formula).toContain('kVA超過分');
  });

  it('使用量が未入力なら unsupported', () => {
    const r = calculator.calculate({
      usage: { contractKva: 6 },
      plan: F.chugokuEconomyNight,
      fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
      renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
    });
    expect(r.status).toBe('unsupported');
  });

  it('負の使用量は unsupported', () => {
    for (const u of [usage(-1, 0), usage(0, -1)]) {
      const r = calculator.calculate({
        usage: u,
        plan: F.chugokuEconomyNight,
        fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
        renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
      });
      expect(r.status).toBe('unsupported');
    }
  });

  it('契約容量が未入力なら unsupported', () => {
    const r = calculator.calculate({
      usage: { economyNight: { dayKwh: 100, nightKwh: 100 } },
      plan: F.chugokuEconomyNight,
      fuelAdjustment: lookupFuelAdjustment(CASE_PERIOD)!.value,
      renewableLevy: lookupRenewableLevy(CASE_PERIOD)!.value
    });
    expect(r.status).toBe('unsupported');
  });
});

describe('時間帯別電灯の夜トク振替', () => {
  const usage = { dayKwh: new Decimal(200), nightKwh: new Decimal(400) };

  it('4区分の合計は元の総使用量に戻る', () => {
    for (const ratio of ['same', 'more', 'much_more'] as const) {
      const a = allocateFromEconomyNight(usage, { ...CASE_CALENDAR, holidayUsageRatio: ratio }, 1);
      const sum = a.bands.daySummer.plus(a.bands.dayOther).plus(a.bands.night).plus(a.bands.holiday);
      expect(sum.toNumber()).toBeCloseTo(600, 6);
    }
  });

  it('1月はデイタイムが全量その他季', () => {
    const a = allocateFromEconomyNight(usage, CASE_CALENDAR, 1);
    expect(a.bands.daySummer.toNumber()).toBe(0);
    expect(a.bands.dayOther.greaterThan(0)).toBe(true);
  });

  it('8月・9月はデイタイムが全量夏季', () => {
    for (const month of [8, 9]) {
      const a = allocateFromEconomyNight(usage, CASE_CALENDAR, month);
      expect(a.bands.dayOther.toNumber()).toBeCloseTo(0, 6);
      expect(a.bands.daySummer.greaterThan(0)).toBe(true);
    }
  });

  it('7月は検針期間の7月日数の割合だけ夏季になる', () => {
    const a = allocateFromEconomyNight(usage, { ...CASE_CALENDAR, julyDays: 7 }, 7);
    const dayTotal = a.bands.daySummer.plus(a.bands.dayOther);
    expect(a.bands.daySummer.dividedBy(dayTotal).toNumber()).toBeCloseTo(7 / 28, 8);
  });

  it('10月は10月分を除いた割合が夏季になる', () => {
    const a = allocateFromEconomyNight(usage, { ...CASE_CALENDAR, octoberDays: 11 }, 10);
    const dayTotal = a.bands.daySummer.plus(a.bands.dayOther);
    expect(a.bands.daySummer.dividedBy(dayTotal).toNumber()).toBeCloseTo(1 - 11 / 28, 8);
  });

  // 以前は julyDays/octoberDays を省略でき、省略時に 0 とみなしていた。
  // 7月検針でデイタイムが全量その他季単価（44.40円）になり、夏季単価（46.46円）
  // より安く出る — JAでんき側だけ安くなるので削減額が過大に見えた。
  // 型で必須にしたので、0 は「その月にかからない」を表す明示的な値になった
  it('7月・10月の日数が0なら夏季分も0（明示された0として扱う）', () => {
    expect(allocateFromEconomyNight(usage, CASE_CALENDAR, 7).bands.daySummer.toNumber()).toBe(0);
    const oct = allocateFromEconomyNight(usage, CASE_CALENDAR, 10);
    expect(oct.bands.dayOther.toNumber()).toBeCloseTo(0, 6);
  });

  it('按分の途中経過を返す', () => {
    const a = allocateFromEconomyNight(usage, CASE_CALENDAR, 1);
    expect(a.steps.map(s => s.label)).toContain('平日数');
  });
});

describe('ファミリータイムの夜トク振替', () => {
  const usage = {
    daySummerKwh: new Decimal(50),
    dayOtherKwh: new Decimal(50),
    familyKwh: new Decimal(200),
    nightKwh: new Decimal(300)
  };

  it('休日割合を上げるとホリデータイムが増える', () => {
    const same = allocateFromFamilyTime(usage, CASE_CALENDAR);
    const more = allocateFromFamilyTime(usage, { ...CASE_CALENDAR, holidayUsageRatio: 'more' });
    const much = allocateFromFamilyTime(usage, { ...CASE_CALENDAR, holidayUsageRatio: 'much_more' });
    expect(more.bands.holiday.greaterThan(same.bands.holiday)).toBe(true);
    expect(much.bands.holiday.greaterThan(more.bands.holiday)).toBe(true);
  });

  it('どの休日割合でも合計は総使用量に戻る', () => {
    for (const ratio of ['same', 'more', 'much_more'] as const) {
      const a = allocateFromFamilyTime(usage, { ...CASE_CALENDAR, holidayUsageRatio: ratio });
      const sum = a.bands.daySummer.plus(a.bands.dayOther).plus(a.bands.night).plus(a.bands.holiday);
      expect(sum.toNumber()).toBeCloseTo(600, 6);
    }
  });

  it('デイタイムは元の夏季／その他季の比率で分かれる', () => {
    const a = allocateFromFamilyTime(usage, CASE_CALENDAR);
    expect(a.bands.daySummer.toNumber()).toBeCloseTo(a.bands.dayOther.toNumber(), 8);
  });

  it('デイタイムが0ならデイタイム配分も0', () => {
    const a = allocateFromFamilyTime(
      { ...usage, daySummerKwh: new Decimal(0), dayOtherKwh: new Decimal(0) },
      CASE_CALENDAR
    );
    expect(a.bands.daySummer.toNumber()).toBe(0);
    expect(a.bands.dayOther.toNumber()).toBe(0);
  });
});
