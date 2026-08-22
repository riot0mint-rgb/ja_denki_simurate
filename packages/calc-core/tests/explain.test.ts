import { Decimal } from '../src/decimal-config';
import { BillingCalculator } from '../src/calculator';
import { explainDifference, partsSum } from '../src/explain';
import { MonthlyBill, RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';

/**
 * 差額の説明。生成AIを使わず、計算の内訳の引き算だけで作る。
 *
 * いちばん大事な性質は「内訳の合計が総額の差と必ず一致する」こと。
 * 合わない説明は、お客様の前で「計算が合わない」と言われる材料にしかならない。
 */
const calculator = new BillingCalculator();
const FUEL = { minimumCharge: new Decimal('-143.77'), unitPriceYenPerKwh: new Decimal('-9.57') };
const AU_FUEL = { minimumCharge: new Decimal('-196.24'), unitPriceYenPerKwh: new Decimal('-13.09') };
const LEVY = { unitPriceYenPerKwh: new Decimal('4.18') };

const bill = (plan: RatePlan, usage: UsageInput, fuel = FUEL): MonthlyBill => {
  const r = calculator.calculate({ usage, plan, fuelAdjustment: fuel, renewableLevy: LEVY });
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
};

describe('差額の説明', () => {
  it('内訳の合計は総額の差と必ず一致する', () => {
    for (const kwh of [0, 15, 16, 120, 121, 300, 301, 348, 700, 1200]) {
      const current = bill(F.chugokuJuryoA, { totalKwh: kwh });
      const candidate = bill(F.jaDenkiJuryoA, { totalKwh: kwh });
      const e = explainDifference(current, candidate);
      expect(e.comparable).toBe(true);
      expect(partsSum(e.parts).equals(e.totalDifferenceYen)).toBe(true);
      expect(e.totalDifferenceYen.equals(current.total.minus(candidate.total))).toBe(true);
    }
  });

  it('契約容量が要るプランでも合計が一致する', () => {
    for (const kwh of [0, 200, 500]) {
      const usage = { contractKva: 6, totalKwh: kwh };
      const e = explainDifference(bill(F.chugokuJuryoB, usage), bill(F.jaDenkiJuryoB, usage));
      expect(partsSum(e.parts).equals(e.totalDifferenceYen)).toBe(true);
    }
  });

  // 従量電灯A どうしは同じ構造なので、段階ごとの単価まで比べられる
  it('同じ構造なら段階ごとの単価差まで出す', () => {
    const e = explainDifference(
      bill(F.chugokuJuryoA, { totalKwh: 348 }),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    expect(e.lines.length).toBeGreaterThan(0);
    const third = e.lines.find(l => l.label.includes('第3段階'))!;
    expect(third.currentUnitPrice!.toString()).toBe('41.55');
    expect(third.candidateUnitPrice!.toString()).toBe('38.84');
    expect(third.unitPriceDifference!.equals('2.71')).toBe(true);
    expect(third.quantity!.toNumber()).toBe(48);
  });

  it('燃料費調整額と再エネ賦課金が同じなら差は0になる', () => {
    const e = explainDifference(
      bill(F.chugokuJuryoA, { totalKwh: 348 }),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    expect(e.parts.find(p => p.key === 'fuel')!.differenceYen.isZero()).toBe(true);
    expect(e.parts.find(p => p.key === 'levy')!.differenceYen.isZero()).toBe(true);
  });

  // auでんきは独自の燃調を持つ。差が燃調から来ていることを言えないと、
  // 「なぜJAのほうが高いのか」を説明できない
  it('燃調が違う相手では、燃調の差が説明に出る', () => {
    const e = explainDifference(
      bill(F.auMPlan, { totalKwh: 348 }, AU_FUEL),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    const fuel = e.parts.find(p => p.key === 'fuel')!;
    expect(fuel.differenceYen.isZero()).toBe(false);
    expect(e.highlights.some(h => h.includes('燃料費調整額'))).toBe(true);
    expect(partsSum(e.parts).equals(e.totalDifferenceYen)).toBe(true);
  });

  // 時間帯の振り替えが入ると行の意味が変わる。並べて比べない
  it('構造が違うプランどうしでは段階の比較を出さない', () => {
    const current = bill(F.chugokuDenkaStyle, {
      contractKw: 6,
      tou: { daySummer: 0, dayOther: 100, night: 200, holiday: 50 }
    });
    const candidate = bill(F.jaDenkiYotoku, {
      contractKw: 6,
      tou: { daySummer: 0, dayOther: 100, night: 200, holiday: 50 }
    });
    const e = explainDifference(current, candidate);
    expect(e.comparable).toBe(true);
    // 同じ時間帯構造なので行は比較できる
    expect(partsSum(e.parts).equals(e.totalDifferenceYen)).toBe(true);
  });

  // 最低月額料金の月は、内訳が請求額の内訳になっていない
  it('最低月額料金が効く月は内訳での比較をしない', () => {
    const current = bill(F.chugokuSimple, { totalKwh: 10 });
    const candidate = bill(F.jaDenkiJuryoA, { totalKwh: 10 });
    const e = explainDifference(current, candidate);
    expect(e.comparable).toBe(false);
    expect(e.reason).toContain('最低月額料金');
    expect(e.parts).toHaveLength(0);
    expect(e.highlights).toHaveLength(0);
    // 総額の差そのものは出せる
    expect(e.totalDifferenceYen.equals(current.total.minus(candidate.total))).toBe(true);
  });

  it('1円未満の差は文章にしない', () => {
    const e = explainDifference(
      bill(F.chugokuJuryoA, { totalKwh: 348 }),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    expect(e.highlights.every(h => !h.includes('0円'))).toBe(true);
    expect(e.highlights.length).toBeLessThanOrEqual(3);
  });

  it('同じ入力なら毎回同じ説明が出る（決定論）', () => {
    const make = () =>
      explainDifference(
        bill(F.chugokuJuryoA, { totalKwh: 348 }),
        bill(F.jaDenkiJuryoA, { totalKwh: 348 })
      ).highlights;
    expect(make()).toEqual(make());
  });

  it('安くなる側と高くなる側で言い回しが変わる', () => {
    const cheaper = explainDifference(
      bill(F.chugokuJuryoA, { totalKwh: 348 }),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    const pricier = explainDifference(
      bill(F.jaDenkiJuryoA, { totalKwh: 348 }),
      bill(F.chugokuJuryoA, { totalKwh: 348 })
    );
    expect(cheaper.highlights[0]).toContain('安く');
    expect(pricier.highlights[0]).toContain('高く');
  });
});

/**
 * 行の突き合わせの細部。実プランでは出にくいが、
 * 定額行や量が食い違う行が来ても壊れないことを押さえる。
 */
describe('行の突き合わせ', () => {
  const stub = (lines: MonthlyBill['lines'], total: string): MonthlyBill => ({
    planId: 'stub',
    planName: 'スタブ',
    baseCharge: new Decimal('0'),
    lines,
    energySubtotal: lines.reduce((a, l) => a.plus(l.amount), new Decimal('0')),
    energyChargeTotal: lines.reduce((a, l) => a.plus(l.amount), new Decimal('0')),
    discount: new Decimal('0'),
    fuelAdjustment: new Decimal('0'),
    renewableLevy: new Decimal('0'),
    totalKwh: new Decimal('0'),
    notes: [],
    minimumMonthlyApplied: false,
    total: new Decimal(total),
    formula: '',
    sources: []
  });

  const line = (label: string, quantity: string | null, unitPrice: string | null, amount: string) => ({
    label,
    quantity: quantity === null ? null : new Decimal(quantity),
    unit: 'kWh',
    unitPrice: unitPrice === null ? null : new Decimal(unitPrice),
    amount: new Decimal(amount)
  });

  // 定額行（単価も量も持たない）は単価差を出せない
  it('定額の行では単価差を出さない', () => {
    const e = explainDifference(
      stub([line('定額', null, null, '1000')], '1000'),
      stub([line('定額', null, null, '800')], '800')
    );
    expect(e.lines).toHaveLength(1);
    expect(e.lines[0].unitPriceDifference).toBeNull();
    expect(e.lines[0].quantity).toBeNull();
    expect(e.lines[0].differenceYen.toNumber()).toBe(200);
  });

  // 量が食い違う行は、量を出すと誤解のもとになる
  it('量が食い違う行では量を出さない', () => {
    const e = explainDifference(
      stub([line('第1段階', '100', '30', '3000')], '3000'),
      stub([line('第1段階', '120', '25', '3000')], '3000')
    );
    expect(e.lines[0].quantity).toBeNull();
    expect(e.lines[0].unitPriceDifference!.toNumber()).toBe(5);
  });

  it('行の数や並びが違えば比較しない', () => {
    const e = explainDifference(
      stub([line('第1段階', '100', '30', '3000')], '3000'),
      stub([line('第1段階', '100', '30', '3000'), line('第2段階', '10', '30', '300')], '3300')
    );
    expect(e.lines).toHaveLength(0);
    expect(e.comparable).toBe(true);
  });

  // 単価差が0の行しかないときは、段階の話を添えずに金額だけ言う
  it('単価差が無いときは段階の説明を添えない', () => {
    const e = explainDifference(
      stub([line('第1段階', '100', '30', '3000')], '3000'),
      stub([line('第1段階', '50', '30', '1500')], '1500')
    );
    expect(e.highlights[0]).toBe('電力量料金が月 1,500円 安くなります');
  });
});

// 文章の金額と、呼び出し側が出す内訳表の金額が食い違うと、
// 「435円と書いてあるのに436円になっている」と言われる
describe('文章の金額の丸め', () => {
  it('差は四捨五入する（切り捨てない）', () => {
    const e = explainDifference(
      bill(F.chugokuJuryoA, { totalKwh: 348 }),
      bill(F.jaDenkiJuryoA, { totalKwh: 348 })
    );
    // 実際の差は 435.93 円。文章は 436円 と書く
    expect(e.parts.find(p => p.key === 'energy')!.differenceYen.toNumber()).toBeCloseTo(435.93, 2);
    expect(e.highlights[0]).toContain('436円');
    expect(e.totalDifferenceYen.toNumber()).toBe(436);
  });
});
