import { BillingCalculator } from '../src/calculator';
import { BillingComparator, DiscountTerms } from '../src/comparator';
import { Decimal } from '../src/decimal-config';
import { RatePlan } from '../src/models';
import {
  chugokuJuryoA,
  chugokuSmart,
  fuelAdjustment,
  jaDenkiJuryoA,
  jaDenkiJuryoS,
  renewableLevy
} from './fixtures';

const calculator = new BillingCalculator();
const comparator = new BillingComparator();

function entry(plan: RatePlan, usageKwh: number) {
  const result = calculator.calculate({ usageKwh, plan, fuelAdjustment, renewableLevy });
  if (result.status !== 'ok') throw new Error('計算不能');
  return { planId: plan.planId, planName: plan.planName, bill: result.bill };
}

/** 公式試算表 シート「シミュレーション結果」I20 / I25 */
const OFFICIAL_DISCOUNTS: DiscountTerms = {
  gasSetDiscountMonthly: new Decimal('110'),
  firstYearSpecialDiscount: new Decimal('3000')
};

const NO_DISCOUNTS: DiscountTerms = {
  gasSetDiscountMonthly: new Decimal('0'),
  firstYearSpecialDiscount: new Decimal('0')
};

function compareAt(usageKwh: number, discounts: DiscountTerms = NO_DISCOUNTS) {
  return comparator.compare(
    entry(chugokuJuryoA, usageKwh),
    [entry(jaDenkiJuryoA, usageKwh), entry(jaDenkiJuryoS, usageKwh)],
    discounts
  );
}

describe('推奨プランの分岐点', () => {
  it('217kWh で従量電灯A と 従量電灯S が同額になる', () => {
    const a = entry(jaDenkiJuryoA, 217).bill.total;
    const s = entry(jaDenkiJuryoS, 217).bill.total;
    expect(a.toNumber()).toBe(s.toNumber());
  });

  it('217kWh 以下では従量電灯S が安い', () => {
    for (const kwh of [16, 50, 100, 150, 200, 216]) {
      const a = entry(jaDenkiJuryoA, kwh).bill.total;
      const s = entry(jaDenkiJuryoS, kwh).bill.total;
      expect(s.lessThan(a)).toBe(true);
    }
  });

  it('218kWh 以上では従量電灯A が安い', () => {
    for (const kwh of [218, 250, 300, 400, 600, 1200]) {
      const a = entry(jaDenkiJuryoA, kwh).bill.total;
      const s = entry(jaDenkiJuryoS, kwh).bill.total;
      expect(a.lessThan(s)).toBe(true);
    }
  });

  it('推奨プランは常に実際に最も安いプランと一致する', () => {
    for (let kwh = 0; kwh <= 1200; kwh += 1) {
      const result = compareAt(kwh);
      const cheapest = result.candidates.reduce((best, c) =>
        c.monthlyCharge.lessThan(best.monthlyCharge) ? c : best
      );
      expect(result.recommended.monthlyCharge.toNumber()).toBe(cheapest.monthlyCharge.toNumber());
    }
  });

  it('218kWh 以上では従量電灯A を推奨する', () => {
    for (const kwh of [218, 300, 500, 1200]) {
      expect(compareAt(kwh).recommended.planId).toBe('ja_denki_juryo_a');
    }
  });

  it('216kWh 以下では従量電灯S を推奨する', () => {
    for (const kwh of [0, 50, 150, 216]) {
      expect(compareAt(kwh).recommended.planId).toBe('ja_denki_juryo_s');
    }
  });
});

describe('削減額の算出', () => {
  it('月額削減額は 現行 − JAでんき（正なら安くなる）', () => {
    const result = compareAt(348);
    // 出典: シミュレーション結果 AI13=10711, AO13=10275
    expect(result.currentMonthlyCharge.toNumber()).toBe(10711);
    expect(result.recommended.monthlyCharge.toNumber()).toBe(10275);
    expect(result.recommended.monthlySavings.toNumber()).toBe(436);
  });

  it('セット割は年額計算にのみ加算される（試算表 I23 = I18*12 + I20*12）', () => {
    const result = compareAt(348, OFFICIAL_DISCOUNTS);
    expect(result.annualSavings.toNumber()).toBe((436 + 110) * 12);
    expect(result.annualSavings.toNumber()).toBe(6552);
  });

  it('初年度合計は年間削減額 + 特別割引（試算表 I28）', () => {
    const result = compareAt(348, OFFICIAL_DISCOUNTS);
    expect(result.firstYearSavings.toNumber()).toBe(6552 + 3000);
  });

  it('割引なしなら年間は月額×12 のまま', () => {
    const result = compareAt(348);
    expect(result.annualSavings.toNumber()).toBe(436 * 12);
    expect(result.firstYearSavings.toNumber()).toBe(436 * 12);
  });

  it('現行より高くなる場合は削減額が負になる', () => {
    // シンプルコースは低使用量域で最低月額料金が効くため、
    // 逆に現行が安いケースを人工的に作る
    const result = comparator.compare(entry(jaDenkiJuryoS, 100), [entry(jaDenkiJuryoA, 100)], NO_DISCOUNTS);
    expect(result.recommended.monthlySavings.isNegative()).toBe(true);
  });
});

describe('削減率', () => {
  it('現行が 0 円なら 0% を返す（NaN / Infinity を出さない）', () => {
    const zeroBill = entry(chugokuJuryoA, 0);
    zeroBill.bill.total = new Decimal('0');
    const result = comparator.compare(zeroBill, [entry(jaDenkiJuryoA, 0)], NO_DISCOUNTS);
    expect(result.savingsPercent.toNumber()).toBe(0);
    expect(result.savingsPercent.isFinite()).toBe(true);
  });

  it('削減時は正の値になる', () => {
    const result = compareAt(348);
    expect(result.savingsPercent.greaterThan(0)).toBe(true);
    expect(result.savingsPercent.toDecimalPlaces(2).toNumber()).toBeCloseTo(4.07, 2);
  });
});

describe('入力の妥当性', () => {
  it('候補が空なら例外を投げる', () => {
    expect(() => comparator.compare(entry(chugokuJuryoA, 100), [], NO_DISCOUNTS)).toThrow();
  });

  it('スマートコースからの乗り換えも比較できる', () => {
    const result = comparator.compare(
      entry(chugokuSmart, 348),
      [entry(jaDenkiJuryoA, 348), entry(jaDenkiJuryoS, 348)],
      NO_DISCOUNTS
    );
    // 出典: シミュレーション結果 AK13=10543
    expect(result.currentMonthlyCharge.toNumber()).toBe(10543);
    expect(result.recommended.monthlySavings.toNumber()).toBe(10543 - 10275);
  });
});
