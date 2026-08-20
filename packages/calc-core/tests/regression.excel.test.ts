import { BillingCalculator } from '../src/calculator';
import { Decimal } from '../src/decimal-config';
import { RatePlan } from '../src/models';
import {
  chugokuJuryoA,
  chugokuSimple,
  chugokuSmart,
  fuelAdjustment,
  jaDenkiJuryoA,
  jaDenkiJuryoS,
  renewableLevy
} from './fixtures';
import fixtureJson from './excel-lookup.fixture.json';

type LookupTable = Record<string, number>;
const fixture = fixtureJson as unknown as {
  source: { document: string; locator: string; effectiveFrom: string; note: string };
  plans: { ja_denki_juryo_a: LookupTable; ja_denki_juryo_s: LookupTable };
};

const calculator = new BillingCalculator();

function billFor(plan: RatePlan, usageKwh: number): Decimal {
  const result = calculator.calculate({ usageKwh, plan, fuelAdjustment, renewableLevy });
  if (result.status !== 'ok') throw new Error(`計算不能: ${result.reason}`);
  return result.bill.total;
}

/**
 * Excel が浮動小数点で計算しているため、厳密値がちょうど整数になる点でのみ
 * ROUNDDOWN が 1 円下振れする。該当する 52 点を明示的に列挙し、
 * 「差は必ず +1 円」かつ「厳密値が整数」であることをテストで固定する。
 * ここに列挙のない点は Excel と 1 円の差もあってはならない。
 */
const EXCEL_FLOAT_DISCREPANCY_KWH = new Set([
  18, 33, 38, 48, 58, 68, 113, 125, 225, 250, 275, 300, 320, 340, 360, 400, 420, 440, 480, 500,
  520, 540, 580, 600, 620, 640, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 920, 940,
  960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140, 1160, 1180, 1200
]);

describe('公式試算表との回帰テスト（0〜1200kWh 全点）', () => {
  const cases: Array<[string, RatePlan, Record<string, number>]> = [
    ['JAでんき 従量電灯A', jaDenkiJuryoA, fixture.plans.ja_denki_juryo_a],
    ['JAでんき 従量電灯S', jaDenkiJuryoS, fixture.plans.ja_denki_juryo_s]
  ];

  describe.each(cases)('%s', (_name, plan, expected) => {
    const points = Object.keys(expected).map(Number).sort((a, b) => a - b);

    it('1201 点すべてを検証対象にしている', () => {
      expect(points).toHaveLength(1201);
      expect(points[0]).toBe(0);
      expect(points[points.length - 1]).toBe(1200);
    });

    it('Excel の浮動小数点誤差点を除き、差異は 0 円', () => {
      const mismatches: Array<{ kwh: number; excel: number; actual: string }> = [];
      for (const kwh of points) {
        if (EXCEL_FLOAT_DISCREPANCY_KWH.has(kwh) && plan.planId === 'ja_denki_juryo_s') continue;
        const actual = billFor(plan, kwh);
        if (!actual.equals(expected[String(kwh)])) {
          mismatches.push({ kwh, excel: expected[String(kwh)], actual: actual.toString() });
        }
      }
      expect(mismatches).toEqual([]);
    });
  });

  it('従量電灯A は 1201 点すべてが Excel と完全一致する（誤差点なし）', () => {
    const expected = fixture.plans.ja_denki_juryo_a;
    const mismatches = Object.keys(expected)
      .map(Number)
      .filter(kwh => !billFor(jaDenkiJuryoA, kwh).equals(expected[String(kwh)]));
    expect(mismatches).toEqual([]);
  });

  it('従量電灯S の誤差点は必ず Excel より 1 円高く、厳密値は整数になる', () => {
    const expected = fixture.plans.ja_denki_juryo_s;
    for (const kwh of EXCEL_FLOAT_DISCREPANCY_KWH) {
      const actual = billFor(jaDenkiJuryoS, kwh);
      expect(actual.minus(expected[String(kwh)]).toNumber()).toBe(1);

      // 厳密値が整数であること = Excel 側が切り捨てで 1 円落としたことの根拠
      const result = calculator.calculate({
        usageKwh: kwh,
        plan: jaDenkiJuryoS,
        fuelAdjustment,
        renewableLevy
      });
      if (result.status !== 'ok') throw new Error('計算不能');
      const exact = result.bill.energyChargeTotal
        .plus(result.bill.fuelAdjustment)
        .plus(result.bill.renewableLevy);
      expect(exact.isInteger()).toBe(true);
    }
  });
});

describe('公式試算表 明細シートとの突合（348kWh）', () => {
  // 出典: シート「シミュレーション結果」AI13/AK13/AM13/AO13/AR13
  it.each<[string, RatePlan, number]>([
    ['中国電力 従量電灯A', chugokuJuryoA, 10711],
    ['中国電力 スマートコース', chugokuSmart, 10543],
    ['中国電力 シンプルコース', chugokuSimple, 10718],
    ['JAでんき 従量電灯A', jaDenkiJuryoA, 10275],
    ['JAでんき 従量電灯S', jaDenkiJuryoS, 10515]
  ])('%s = %d 円', (_name, plan, expected) => {
    expect(billFor(plan, 348).toNumber()).toBe(expected);
  });
});
