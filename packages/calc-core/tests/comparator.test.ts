import { BillingCalculator } from '../src/calculator';
import { BillingComparator, DiscountTerms } from '../src/comparator';
import { Decimal } from '../src/decimal-config';
import { availablePeriods, lookupFuelAdjustment, lookupRenewableLevy, periodKey, RatePeriod, DEFAULT_PERIOD } from '../src/monthlyRates';
import { MonthlyBill, RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';

const calculator = new BillingCalculator();
const comparator = new BillingComparator();
const APRIL: RatePeriod = { year: 2026, month: 4 };
const JULY: RatePeriod = { year: 2026, month: 7 };

function bill(plan: RatePlan, usage: UsageInput, period: RatePeriod = JULY): MonthlyBill {
  const r = calculator.calculate({
    usage,
    plan,
    fuelAdjustment: lookupFuelAdjustment(period)!.value,
    renewableLevy: lookupRenewableLevy(period)!.value
  });
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
}

const NONE: DiscountTerms = {
  gasSetDiscountMonthly: new Decimal('0'),
  firstYearSpecialDiscount: new Decimal('0')
};
const OFFICIAL: DiscountTerms = {
  gasSetDiscountMonthly: new Decimal('110'),
  firstYearSpecialDiscount: new Decimal('3000')
};

function compareAt(kwh: number, discounts = NONE, period = APRIL) {
  return comparator.compare(
    bill(F.chugokuJuryoA, { totalKwh: kwh }, period),
    [bill(F.jaDenkiJuryoA, { totalKwh: kwh }, period), bill(F.jaDenkiJuryoS, { totalKwh: kwh }, period)],
    discounts
  );
}

describe('推奨プランの選択', () => {
  it('217kWh で従量電灯A と S が同額（26年4月適用）', () => {
    const a = bill(F.jaDenkiJuryoA, { totalKwh: 217 }, APRIL).total;
    const s = bill(F.jaDenkiJuryoS, { totalKwh: 217 }, APRIL).total;
    expect(a.toNumber()).toBe(s.toNumber());
  });

  it('0〜1200kWh のすべてで推奨＝実際に最安', () => {
    for (let kwh = 0; kwh <= 1200; kwh += 1) {
      const r = compareAt(kwh);
      const cheapest = r.candidates.reduce((b, c) =>
        c.monthlyCharge.lessThan(b.monthlyCharge) ? c : b
      );
      expect(r.recommended.monthlyCharge.toNumber()).toBe(cheapest.monthlyCharge.toNumber());
    }
  });

  it('216kWh以下はS、218kWh以上はA', () => {
    for (const kwh of [0, 50, 150, 216]) expect(compareAt(kwh).recommended.planId).toBe('ja_denki_juryo_s');
    for (const kwh of [218, 300, 1200]) expect(compareAt(kwh).recommended.planId).toBe('ja_denki_juryo_a');
  });

  it('分岐点は燃調の改定で動くため定数で持たない', () => {
    const aprilA = bill(F.jaDenkiJuryoA, { totalKwh: 217 }, APRIL).total;
    const julyA = bill(F.jaDenkiJuryoA, { totalKwh: 217 }, JULY).total;
    expect(julyA.equals(aprilA)).toBe(false);
  });
});

describe('削減額の算出', () => {
  it('月額削減額は 現行 − JAでんき（26年4月・348kWh）', () => {
    const r = compareAt(348);
    expect(r.currentMonthlyCharge.toNumber()).toBe(10711);
    expect(r.recommended.monthlyCharge.toNumber()).toBe(10275);
    expect(r.recommended.monthlySavings.toNumber()).toBe(436);
  });

  it('セット割は年額にのみ加算（試算表 I23 = I18*12 + I20*12）', () => {
    expect(compareAt(348, OFFICIAL).annualSavings.toNumber()).toBe((436 + 110) * 12);
  });

  it('初年度合計は年間 + 特別割引（試算表 I28）', () => {
    expect(compareAt(348, OFFICIAL).firstYearSavings.toNumber()).toBe(6552 + 3000);
  });

  it('割引なしなら年間は月額×12', () => {
    expect(compareAt(348).annualSavings.toNumber()).toBe(436 * 12);
  });

  it('現行より高い場合は削減額が負', () => {
    const r = comparator.compare(
      bill(F.jaDenkiJuryoS, { totalKwh: 1000 }),
      [bill(F.jaDenkiJuryoA, { totalKwh: 1000 })],
      NONE
    );
    expect(r.recommended.monthlySavings.isPositive()).toBe(true);
    const r2 = comparator.compare(
      bill(F.jaDenkiJuryoA, { totalKwh: 100 }),
      [bill(F.jaDenkiJuryoS, { totalKwh: 100 })],
      NONE
    );
    expect(r2.recommended.monthlySavings.isPositive()).toBe(true);
  });
});

describe('削減率', () => {
  it('現行が0円なら0%（NaN / Infinity を出さない）', () => {
    const zero = bill(F.chugokuJuryoA, { totalKwh: 0 });
    zero.total = new Decimal('0');
    const r = comparator.compare(zero, [bill(F.jaDenkiJuryoA, { totalKwh: 0 })], NONE);
    expect(r.savingsPercent.toNumber()).toBe(0);
    expect(r.savingsPercent.isFinite()).toBe(true);
  });

  it('削減時は正の値', () => {
    expect(compareAt(348).savingsPercent.greaterThan(0)).toBe(true);
  });
});

describe('時間帯別プランの比較', () => {
  it('電化Style → 夜トク の削減額は使用量に依らず基本料金の差（同一単価のため）', () => {
    const u = (n: number): UsageInput => ({ contractKw: 6, tou: { night: n } });
    const savings = [100, 500, 1000].map(n =>
      comparator
        .compare(bill(F.chugokuDenkaStyle, u(n)), [bill(F.jaDenkiYotoku, u(n))], NONE)
        .recommended.monthlySavings.toNumber()
    );
    expect(new Set(savings).size).toBe(1);
    expect(savings[0]).toBe(121);
  });
});

describe('入力の妥当性', () => {
  it('候補が空なら例外', () => {
    expect(() => comparator.compare(bill(F.chugokuJuryoA, { totalKwh: 100 }), [], NONE)).toThrow();
  });
});

describe('月次レート表', () => {
  it('既定は26年7月適用', () => {
    expect(periodKey(DEFAULT_PERIOD)).toBe('2026-07');
  });

  it('収録月は新しい順に並び、賦課金も揃っている', () => {
    const periods = availablePeriods();
    expect(periods.length).toBeGreaterThan(0);
    expect(periodKey(periods[0])).toBe('2026-07');
    for (const p of periods) {
      expect(lookupFuelAdjustment(p)).not.toBeNull();
      expect(lookupRenewableLevy(p)).not.toBeNull();
    }
  });

  it('auでんきの収録月も引ける', () => {
    expect(availablePeriods('au').map(periodKey)).toContain('2026-07');
  });
});

describe('ナイトホリデー → JAでんき夜トクプラン', () => {
  // ナイトホリデーは基本料金を持たず、夜トクプランは持つ。単価もすべて夜トクのほうが
  // 安いため、使用量が増えるほど削減額が開く。電化Style→夜トク（単価が同じで基本料金
  // の差だけ）とは性質が違う。
  const tou = (dayOther: number, night: number, holiday: number) => ({
    contractKw: 6,
    tou: { dayOther, daySummer: 0, night, holiday }
  });

  const compareNightHoliday = (dayOther: number, night: number, holiday: number) =>
    comparator.compare(
      bill(F.chugokuNightHoliday, tou(dayOther, night, holiday), JULY),
      [bill(F.jaDenkiYotoku, tou(dayOther, night, holiday), JULY)],
      NONE
    );

  it('削減になる', () => {
    const r = compareNightHoliday(150, 300, 80);
    expect(r.recommended.monthlySavings.greaterThan(0)).toBe(true);
  });

  it('使用量が増えるほど削減額が大きくなる', () => {
    const light = compareNightHoliday(50, 100, 20);
    const heavy = compareNightHoliday(300, 600, 150);
    expect(
      heavy.recommended.monthlySavings.greaterThan(light.recommended.monthlySavings)
    ).toBe(true);
  });

  it('最低月額料金が効く低使用量でも計算できる', () => {
    const current = bill(F.chugokuNightHoliday, tou(0, 5, 0), JULY);
    expect(current.total.toNumber()).toBe(1845);
  });

  /**
   * ナイトホリデーは基本料金を取らず、夜トクプランは 1,897.72円/契約 を取る。
   * 単価は夜トクのほうが安い（デイ ▲2.52〜2.98円、ナイト ▲4.30円）ので、
   * 使用量が少ないうちは基本料金の差を取り返せず**切り替えると高くなる**。
   *
   * 電化Style → 夜トク が「単価は同じで基本料金だけ安い＝常に削減」なのとは
   * 性質が真逆。営業現場で取り違えると、安くならないお客様に切替を勧めてしまう。
   */
  it('使用量が少ないと切り替えで高くなる', () => {
    const r = compareNightHoliday(30, 60, 10);
    expect(r.recommended.monthlySavings.lessThan(0)).toBe(true);
  });

  it('損益が反転する使用量が存在する（400〜600kWhの間）', () => {
    const at400 = compareNightHoliday(110, 230, 60).recommended.monthlySavings;
    const at600 = compareNightHoliday(170, 340, 90).recommended.monthlySavings;
    expect(at400.lessThan(0)).toBe(true);
    expect(at600.greaterThan(0)).toBe(true);
  });
});
