import { BillingCalculator } from '../src/calculator';
import { RatePlan } from '../src/models';
import {
  chugokuSimple,
  fuelAdjustment,
  jaDenkiJuryoA,
  jaDenkiJuryoS,
  renewableLevy
} from './fixtures';

const calculator = new BillingCalculator();

function bill(plan: RatePlan, usageKwh: number) {
  const result = calculator.calculate({ usageKwh, plan, fuelAdjustment, renewableLevy });
  if (result.status !== 'ok') throw new Error(`計算不能: ${result.reason}`);
  return result.bill;
}

describe('境界値（期待値は公式試算表の早見表から転記）', () => {
  // 出典: JAでんき＿従量A料金早見表 / JAでんき＿従量Ｓ料金早見表
  it.each<[number, number, number]>([
    // kWh, JA従量A, JA従量S
    [0, 647, 557],
    [1, 647, 557],
    [14, 647, 557],
    [15, 647, 557],
    [16, 672, 582],
    [119, 3227, 3093],
    [120, 3252, 3117],
    [121, 3283, 3149],
    [216, 6193, 6191],
    [217, 6223, 6223],
    [218, 6254, 6255],
    [299, 8736, 8849],
    [301, 8797, 8915]
  ])('%d kWh: 従量電灯A=%d円 / 従量電灯S=%d円', (kwh, expectedA, expectedS) => {
    expect(bill(jaDenkiJuryoA, kwh).total.toNumber()).toBe(expectedA);
    expect(bill(jaDenkiJuryoS, kwh).total.toNumber()).toBe(expectedS);
  });
});

describe('最低料金の意味論', () => {
  it('15kWh までは最低料金のみで、電力量料金は発生しない', () => {
    for (const kwh of [0, 1, 7, 14, 15]) {
      const b = bill(jaDenkiJuryoA, kwh);
      expect(b.tierSubtotal.toNumber()).toBe(0);
      expect(b.energyChargeTotal.toNumber()).toBe(759.68);
    }
  });

  it('16kWh で第1段階が 1kWh だけ課金される', () => {
    const b = bill(jaDenkiJuryoA, 16);
    expect(b.tiers[0].chargedKwh.toNumber()).toBe(1);
    expect(b.tiers[0].charge.toNumber()).toBe(32.22);
    expect(b.tiers[1].chargedKwh.toNumber()).toBe(0);
    expect(b.tiers[2].chargedKwh.toNumber()).toBe(0);
  });

  it('段階ごとの課金 kWh の合計は 使用量-15 に一致する（二重計上・欠落がない）', () => {
    for (const kwh of [16, 50, 119, 120, 121, 250, 300, 301, 500, 1200]) {
      const b = bill(jaDenkiJuryoA, kwh);
      const summed = b.tiers.reduce((acc, t) => acc.plus(t.chargedKwh), b.tiers[0].chargedKwh.times(0));
      expect(summed.toNumber()).toBe(kwh - 15);
    }
  });

  it('301kWh で第3段階が 1kWh だけ課金される', () => {
    const b = bill(jaDenkiJuryoA, 301);
    expect(b.tiers[0].chargedKwh.toNumber()).toBe(105);
    expect(b.tiers[1].chargedKwh.toNumber()).toBe(180);
    expect(b.tiers[2].chargedKwh.toNumber()).toBe(1);
  });
});

describe('一律単価プラン（シンプルコース）の最低月額料金', () => {
  it('従量料金+燃調が 1,844.7 円未満なら 1,845 円になる', () => {
    for (const kwh of [0, 10, 50, 68]) {
      const b = bill(chugokuSimple, kwh);
      expect(b.minimumMonthlyApplied).toBe(true);
      expect(b.total.toNumber()).toBe(1845);
    }
  });

  it('69kWh から通常計算に切り替わる', () => {
    const b = bill(chugokuSimple, 69);
    expect(b.minimumMonthlyApplied).toBe(false);
    expect(b.total.toNumber()).toBeGreaterThan(1845);
  });

  it('0kWh から一律単価が適用される（15kWh の控除がない）', () => {
    const b = bill(chugokuSimple, 100);
    expect(b.tiers[0].chargedKwh.toNumber()).toBe(100);
    expect(b.energyChargeTotal.toNumber()).toBe(3821);
  });
});

describe('入力検証（CLAUDE.md ルール8）', () => {
  it.each([NaN, -1, -50, Infinity, -Infinity])('%p は unsupported を返す', value => {
    const result = calculator.calculate({
      usageKwh: value,
      plan: jaDenkiJuryoA,
      fuelAdjustment,
      renewableLevy
    });
    expect(result.status).toBe('unsupported');
    if (result.status === 'unsupported') {
      expect(result.reason).not.toBe('');
      expect(result.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it('0 は有効な使用量として計算する', () => {
    const result = calculator.calculate({
      usageKwh: 0,
      plan: jaDenkiJuryoA,
      fuelAdjustment,
      renewableLevy
    });
    expect(result.status).toBe('ok');
  });
});

describe('出典の伝播（CLAUDE.md ルール4）', () => {
  it('計算結果はプランの出典をそのまま持ち回る', () => {
    const b = bill(jaDenkiJuryoA, 348);
    expect(b.sources).toBe(jaDenkiJuryoA.sources);
    expect(b.sources[0].verificationStatus).toBe('verified');
    expect(b.sources[0].locator).toContain('基本項目');
  });
});

describe('計算過程の説明', () => {
  it('最低料金・各段階・燃調・賦課金・合計をすべて含む', () => {
    const f = bill(jaDenkiJuryoA, 348).formula;
    expect(f).toContain('最低料金');
    expect(f).toContain('第1段階');
    expect(f).toContain('第3段階');
    expect(f).toContain('燃料費調整額');
    expect(f).toContain('再エネ賦課金');
    expect(f).toContain('円未満切り捨て');
  });
});
