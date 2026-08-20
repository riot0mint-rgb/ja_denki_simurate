import { BillingCalculator } from '../src/calculator';
import { lookupFuelAdjustment, lookupRenewableLevy, RatePeriod } from '../src/monthlyRates';
import { RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';

const calculator = new BillingCalculator();
const JULY: RatePeriod = { year: 2026, month: 7 };

function run(plan: RatePlan, usage: UsageInput, provider: 'chugoku' | 'au' = 'chugoku') {
  return calculator.calculate({
    usage,
    plan,
    fuelAdjustment: lookupFuelAdjustment(JULY, provider)!.value,
    renewableLevy: lookupRenewableLevy(JULY)!.value
  });
}
function bill(plan: RatePlan, usage: UsageInput, provider: 'chugoku' | 'au' = 'chugoku') {
  const r = run(plan, usage, provider);
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
}

describe('最低料金型（従量電灯A/S）', () => {
  it('15kWh までは電力量料金が発生しない', () => {
    for (const kwh of [0, 1, 14, 15]) {
      expect(bill(F.jaDenkiJuryoA, { totalKwh: kwh }).energySubtotal.toNumber()).toBe(0);
    }
  });

  it('各段階の課金kWhの合計は 使用量-15（二重計上も欠落もない）', () => {
    for (const kwh of [16, 50, 120, 121, 300, 301, 1200]) {
      const b = bill(F.jaDenkiJuryoA, { totalKwh: kwh });
      const sum = b.lines.reduce((a, l) => a.plus(l.quantity!), b.lines[0].quantity!.times(0));
      expect(sum.toNumber()).toBe(kwh - 15);
    }
  });
});

describe('契約容量型（従量電灯B）', () => {
  it('段階は 0kWh から始まる（15kWh の控除がない）', () => {
    const b = bill(F.chugokuJuryoB, { totalKwh: 100, contractKva: 6 });
    expect(b.lines[0].quantity!.toNumber()).toBe(100);
  });

  it('使用量0で基本料金が半額になる', () => {
    const zero = bill(F.chugokuJuryoB, { totalKwh: 0, contractKva: 6 });
    const some = bill(F.chugokuJuryoB, { totalKwh: 1, contractKva: 6 });
    expect(zero.baseCharge.times(2).toNumber()).toBe(some.baseCharge.toNumber());
    expect(zero.notes.some(n => n.includes('半額'))).toBe(true);
  });

  it('契約容量が未入力なら unsupported', () => {
    const r = run(F.chugokuJuryoB, { totalKwh: 100 });
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') expect(r.reason).toContain('ご契約容量');
  });

  it('再エネ賦課金に切り捨てを適用しない（元資料どおり）', () => {
    const b = bill(F.chugokuJuryoB, { totalKwh: 100, contractKva: 6 });
    expect(b.renewableLevy.toNumber()).toBeCloseTo(418, 6);
    expect(b.renewableLevy.isInteger()).toBe(true);
    const b2 = bill(F.chugokuJuryoB, { totalKwh: 101, contractKva: 6 });
    expect(b2.renewableLevy.isInteger()).toBe(false);
  });
});

describe('季節別型（低圧電力）', () => {
  it('夏季とその他季で単価が変わる', () => {
    const summer = bill(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 100, otherKwh: 0 } });
    const other = bill(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 100 } });
    expect(summer.energySubtotal.toNumber()).toBe(2680);
    expect(other.energySubtotal.toNumber()).toBe(2551);
  });

  it('季節別使用量が未入力なら unsupported', () => {
    const r = run(F.chugokuLowVoltage, { contractKw: 6 });
    expect(r.status).toBe('unsupported');
  });

  it('負の使用量は unsupported（夏季・その他季とも）', () => {
    expect(run(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: -1, otherKwh: 0 } }).status)
      .toBe('unsupported');
    expect(run(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: NaN } }).status)
      .toBe('unsupported');
  });

  it('契約電力が未入力なら unsupported', () => {
    const r = run(F.chugokuLowVoltage, { seasonal: { summerKwh: 100, otherKwh: 0 } });
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') expect(r.reason).toContain('ご契約電力');
  });

  it('契約電力が0以下なら unsupported', () => {
    expect(run(F.chugokuLowVoltage, { contractKw: 0, seasonal: { summerKwh: 1, otherKwh: 0 } }).status)
      .toBe('unsupported');
  });
});

describe('時間帯別型（電化Style / 夜トク）', () => {
  const usage = (tou: Record<string, number>): UsageInput => ({ contractKw: 6, tou });

  it('4区分すべてに単価が適用される', () => {
    const b = bill(F.chugokuDenkaStyle, usage({ dayOther: 10, daySummer: 20, night: 30, holiday: 40 }));
    expect(b.totalKwh.toNumber()).toBe(100);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(
      44.4 * 10 + 46.46 * 20 + 30.35 * 30 + 30.35 * 40,
      6
    );
  });

  it('契約電力が10kWを超えると基本料金が増える', () => {
    const at10 = bill(F.jaDenkiYotoku, { contractKw: 10, tou: { night: 100 } });
    const at12 = bill(F.jaDenkiYotoku, { contractKw: 12, tou: { night: 100 } });
    expect(at12.baseCharge.minus(at10.baseCharge).toNumber()).toBeCloseTo(458.37 * 2, 6);
  });

  it('夜トクは電化Styleと同じ単価で基本料金だけが安い', () => {
    const u = usage({ dayOther: 100, night: 200, holiday: 50 });
    const style = bill(F.chugokuDenkaStyle, u);
    const yotoku = bill(F.jaDenkiYotoku, u);
    expect(yotoku.energySubtotal.toNumber()).toBe(style.energySubtotal.toNumber());
    expect(style.baseCharge.minus(yotoku.baseCharge).toNumber()).toBeCloseTo(121, 6);
  });

  it('ナイトホリデーは基本料金が元資料にないため unsupported', () => {
    const r = run(F.chugokuNightHoliday, usage({ dayOther: 100, night: 200 }));
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') {
      expect(r.reason).toContain('基本料金');
      expect(r.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it('時間帯別使用量が未入力なら unsupported', () => {
    const r = run(F.jaDenkiYotoku, { contractKw: 6 });
    expect(r.status).toBe('unsupported');
  });

  it('負の時間帯使用量は unsupported', () => {
    const r = run(F.jaDenkiYotoku, usage({ night: -5 }));
    expect(r.status).toBe('unsupported');
  });

  it('契約電力が未入力なら unsupported', () => {
    const r = run(F.jaDenkiYotoku, { tou: { night: 100 } });
    expect(r.status).toBe('unsupported');
  });
});

describe('契約電力＋一律単価型（深夜電力B）', () => {
  it('使用量があれば通常計算', () => {
    const b = bill(F.chugokuMidnightB, { totalKwh: 100, contractKw: 4 });
    expect(b.baseCharge.toNumber()).toBeCloseTo(375.92 * 4, 6);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(3034, 6);
    expect(b.notes).toEqual([]);
  });

  it('使用量0で請求額全体が半額になる（基本料金だけではない）', () => {
    const b = bill(F.chugokuMidnightB, { totalKwh: 0, contractKw: 4 });
    expect(b.total.toNumber()).toBe(751.5);
    expect(b.notes.some(n => n.includes('半額'))).toBe(true);
  });

  it('契約電力が未入力なら unsupported', () => {
    expect(run(F.chugokuMidnightB, { totalKwh: 100 }).status).toBe('unsupported');
  });
});

describe('一律単価型（シンプルコース）', () => {
  // 判定は (従量料金 + 燃料費調整額) で行うため、閾値を跨ぐ使用量は燃調の改定で動く。
  // 26年7月適用: (38.21 - 9.57) × 使用量 < 1844.7 → 64kWh まで最低月額料金
  it('64kWh までは最低月額料金 1,845円', () => {
    for (const kwh of [0, 10, 50, 64]) {
      const b = bill(F.chugokuSimple, { totalKwh: kwh });
      expect(b.total.toNumber()).toBe(1845);
      expect(b.notes.length).toBe(1);
    }
  });

  it('65kWh から通常計算に切り替わる', () => {
    const b = bill(F.chugokuSimple, { totalKwh: 65 });
    expect(b.notes).toEqual([]);
    expect(b.total.toNumber()).toBeGreaterThan(1845);
  });
});

describe('入力検証（CLAUDE.md ルール8）', () => {
  it.each([NaN, -1, Infinity])('%p は unsupported', v => {
    expect(run(F.jaDenkiJuryoA, { totalKwh: v }).status).toBe('unsupported');
  });

  it('使用量そのものが無ければ unsupported', () => {
    expect(run(F.jaDenkiJuryoA, {}).status).toBe('unsupported');
  });
});

describe('出典と内訳', () => {
  it('計算結果はプランの出典を持ち回る', () => {
    const b = bill(F.jaDenkiYotoku, { contractKw: 6, tou: { night: 100 } });
    expect(b.sources[0].verificationStatus).toBe('verified');
    expect(b.sources[0].effectiveFrom).toBe('2026-07');
  });

  it('計算式に主要項目が並ぶ', () => {
    const f = bill(F.jaDenkiYotoku, { contractKw: 6, tou: { night: 100 } }).formula;
    expect(f).toContain('基本料金');
    expect(f).toContain('ナイトタイム');
    expect(f).toContain('燃料費調整額');
    expect(f).toContain('再エネ賦課金');
  });

  it('割引がある場合は計算式に現れる', () => {
    const withDiscount = {
      ...F.jaDenkiYotoku,
      allElectricDiscount: { rate: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('0.08'), capYen: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('3300') }
    };
    const b = bill(withDiscount as RatePlan, {
      contractKw: 6,
      tou: { night: 1000 },
      allElectricDiscount: true
    });
    expect(b.discount.isNegative()).toBe(true);
    expect(b.formula).toContain('割引');
    expect(b.notes.some(n => n.includes('電化住宅割'))).toBe(true);
  });

  it('電化住宅割は上限額でクリップされる', () => {
    const withDiscount = {
      ...F.jaDenkiYotoku,
      allElectricDiscount: { rate: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('0.08'), capYen: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('3300') }
    };
    const b = bill(withDiscount as RatePlan, {
      contractKw: 6,
      tou: { night: 100000 },
      allElectricDiscount: true
    });
    expect(b.discount.toNumber()).toBe(-3300);
  });
});
