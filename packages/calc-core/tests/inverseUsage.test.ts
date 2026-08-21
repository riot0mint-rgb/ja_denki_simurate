import { Decimal } from '../src/decimal-config';
import { estimateUsageFromBill } from '../src/inverseUsage';
import { BillingCalculator } from '../src/calculator';
import { RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';

/**
 * 電気料金から使用量を逆算する（かんたん試算）。
 *
 * 「入れた金額に戻せること」を期待値にする。逆算した使用量で計算し直して
 * 元の金額に戻らないなら、その逆算は使えない。
 */
const calculator = new BillingCalculator();

// 2026年7月の中国エリア（燃調・賦課金）
const FUEL = { minimumCharge: new Decimal('-143.77'), unitPriceYenPerKwh: new Decimal('-9.57') };
const LEVY = { unitPriceYenPerKwh: new Decimal('4.18') };

const billOf = (plan: RatePlan, usage: UsageInput) => {
  const r = calculator.calculate({ usage, plan, fuelAdjustment: FUEL, renewableLevy: LEVY });
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill.total.toNumber();
};

const estimate = (plan: RatePlan, targetYen: number, usage: UsageInput = {}) =>
  estimateUsageFromBill({
    targetYen,
    plan,
    usage,
    fuelAdjustment: FUEL,
    renewableLevy: LEVY
  });

describe('電気料金からの使用量の逆算', () => {
  // 1kWh あたり数十円動くので、入力額ぴったりの使用量は無いことが多い。
  // 「いちばん近い使用量」に着地し、その使用量での請求額を返せていればよい
  it('逆算した使用量での請求額が、入力額にいちばん近い', () => {
    for (const yen of [3000, 5000, 8000, 11413, 15000, 24000]) {
      const r = estimate(F.chugokuJuryoA, yen);
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      const back = billOf(F.chugokuJuryoA, { totalKwh: r.estimate.kwh });
      expect(back).toBe(r.estimate.billYen);
      // 隣の使用量のほうが近いことはない
      const diff = Math.abs(back - yen);
      for (const near of [r.estimate.kwh - 1, r.estimate.kwh + 1]) {
        if (near < 0) continue;
        expect(Math.abs(billOf(F.chugokuJuryoA, { totalKwh: near }) - yen)).toBeGreaterThanOrEqual(
          diff
        );
      }
      // 1kWh ぶんの単価より大きくずれることはない
      expect(diff).toBeLessThan(50);
    }
  });

  it('ぴったりの使用量があるときは exact を立てる', () => {
    const yen = billOf(F.chugokuJuryoA, { totalKwh: 348 });
    const r = estimate(F.chugokuJuryoA, yen);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.exact).toBe(true);
    expect(r.estimate.billYen).toBe(yen);
  });

  // 348kWh は元資料の基準ケース。金額から戻したときに 348 付近に着地する
  it('元資料の基準ケースを往復できる', () => {
    const yen = billOf(F.chugokuJuryoA, { totalKwh: 348 });
    const r = estimate(F.chugokuJuryoA, yen);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.rangeKwh.min).toBeLessThanOrEqual(348);
    expect(r.estimate.rangeKwh.max).toBeGreaterThanOrEqual(348);
  });

  it('契約容量が要るプランでも逆算できる', () => {
    const usage = { contractKva: 6 };
    const yen = billOf(F.chugokuJuryoB, { ...usage, totalKwh: 400 });
    const r = estimate(F.chugokuJuryoB, yen, usage);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.rangeKwh.min).toBeLessThanOrEqual(400);
    expect(r.estimate.rangeKwh.max).toBeGreaterThanOrEqual(400);
  });

  // 最低料金や基本料金があるため、いくら安くてもそこまでしか下がらない
  it('下限を下回る金額は計算不可として返す（推測しない）', () => {
    const floorYen = billOf(F.chugokuJuryoA, { totalKwh: 0 });
    const r = estimate(F.chugokuJuryoA, floorYen - 1);
    expect(r.status).toBe('unsupported');
    if (r.status !== 'unsupported') return;
    expect(r.reason).toContain('下回りません');
    expect(r.nextSteps.length).toBeGreaterThan(0);
  });

  // 最低料金ちょうどの請求額。0kWh に着地するので手前の kWh が無い
  it('下限ちょうどの金額は 0kWh になる', () => {
    const floorYen = billOf(F.chugokuJuryoA, { totalKwh: 0 });
    const r = estimate(F.chugokuJuryoA, floorYen);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.rangeKwh.min).toBe(0);
    expect(r.estimate.exact).toBe(true);
    expect(r.estimate.billYen).toBe(floorYen);
  });

  // 最低月額料金のプランは、下回る範囲がすべて同じ請求額になる。
  // 「1,844円でした」からは使用量を1つに決められないので、幅を返す
  it('最低月額料金の範囲は使用量の幅として返す', () => {
    const r = estimate(F.chugokuSimple, 1844);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.billYen).toBe(1844);
    expect(r.estimate.rangeKwh.min).toBe(0);
    expect(r.estimate.rangeKwh.max).toBeGreaterThan(50);
    // 幅の中のどの使用量でも同じ請求額になる
    for (const kwh of [r.estimate.rangeKwh.min, r.estimate.kwh, r.estimate.rangeKwh.max]) {
      expect(billOf(F.chugokuSimple, { totalKwh: kwh })).toBe(1844);
    }
  });

  // 最低月額料金をわずかに超える金額。手前の kWh（最低月額料金の範囲）のほうが
  // 近いので、そちらに着地し、範囲は下へ 0kWh まで広がる
  it('最低月額料金をわずかに超える金額は、その範囲に着地する', () => {
    const r = estimate(F.chugokuSimple, 1845);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.billYen).toBe(1844);
    expect(r.estimate.exact).toBe(false);
    expect(r.estimate.rangeKwh.min).toBe(0);
  });

  it('上限を超える金額は計算不可として返す', () => {
    const r = estimate(F.chugokuJuryoA, 5_000_000);
    expect(r.status).toBe('unsupported');
  });

  it('0円・負の金額・NaN は受け付けない', () => {
    for (const yen of [0, -1, NaN, Infinity]) {
      expect(estimate(F.chugokuJuryoA, yen).status).toBe('unsupported');
    }
  });

  // 円未満を切り捨てているので、同じ請求額になる使用量に幅がある
  it('同じ金額になる使用量の幅を返す', () => {
    const r = estimate(F.chugokuJuryoA, 10000);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.estimate.rangeKwh.min).toBeLessThanOrEqual(r.estimate.kwh);
    expect(r.estimate.kwh).toBeLessThanOrEqual(r.estimate.rangeKwh.max);
    for (const kwh of [r.estimate.rangeKwh.min, r.estimate.kwh, r.estimate.rangeKwh.max]) {
      expect(billOf(F.chugokuJuryoA, { totalKwh: kwh })).toBe(r.estimate.billYen);
    }
  });

  // 時間帯別プランは月の内訳が金額からは決まらない
  it('時間帯別プランは逆算に対応しないと返す', () => {
    const r = estimate(F.chugokuDenkaStyle, 12000, { contractKw: 6 });
    expect(r.status).toBe('unsupported');
    if (r.status !== 'unsupported') return;
    expect(r.reason).toContain('逆算に対応していません');
  });

  it('金額を上げると使用量も上がる（単調性）', () => {
    let previous = 0;
    for (const yen of [3000, 6000, 9000, 12000, 20000]) {
      const r = estimate(F.chugokuJuryoA, yen);
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.estimate.kwh).toBeGreaterThan(previous);
      previous = r.estimate.kwh;
    }
  });
});
