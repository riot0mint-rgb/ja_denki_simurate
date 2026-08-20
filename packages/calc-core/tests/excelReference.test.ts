import { BillingCalculator } from '../src/calculator';
import { Decimal } from '../src/decimal-config';
import { lookupFuelAdjustment, lookupRenewableLevy, RatePeriod } from '../src/monthlyRates';
import { RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';
import lookup from './excel-lookup.fixture.json';

const calculator = new BillingCalculator();

function bill(plan: RatePlan, usage: UsageInput, period: RatePeriod, provider: 'chugoku' | 'au' = 'chugoku') {
  const fuel = lookupFuelAdjustment(period, provider);
  const levy = lookupRenewableLevy(period);
  if (!fuel || !levy) throw new Error(`単価が未収録: ${period.year}-${period.month}`);
  const r = calculator.calculate({
    usage,
    plan,
    fuelAdjustment: fuel.value,
    renewableLevy: levy.value
  });
  if (r.status !== 'ok') throw new Error(`計算不能: ${r.reason}`);
  return r.bill;
}

const JULY: RatePeriod = { year: 2026, month: 7 };
const APRIL: RatePeriod = { year: 2026, month: 4 };

/**
 * 元資料の明細シートは 1 ケースずつしか値を持たないため、
 * そのケースの入力と算出額をそのまま期待値に据える。
 */
describe('公式試算表 明細シートとの突合', () => {
  it('①従量電灯A系 348kWh（26年4月適用）', () => {
    // 出典: ①26年4月適用 'シミュレーション結果'!AI13/AK13/AM13/AO13/AR13
    const cases: Array<[RatePlan, number]> = [
      [F.chugokuJuryoA, 10711],
      [F.chugokuSmart, 10543],
      [F.chugokuSimple, 10718],
      [F.jaDenkiJuryoA, 10275],
      [F.jaDenkiJuryoS, 10515]
    ];
    for (const [plan, expected] of cases) {
      expect(bill(plan, { totalKwh: 348 }, APRIL).total.toNumber()).toBe(expected);
    }
  });

  it('②従量電灯B 6kVA・0kWh（基本料金半額）', () => {
    // 出典: ②明細 I16 / O16 = 1343
    const usage: UsageInput = { totalKwh: 0, contractKva: 6 };
    expect(bill(F.chugokuJuryoB, usage, JULY).total.toNumber()).toBe(1343);
    expect(bill(F.jaDenkiJuryoB, usage, JULY).total.toNumber()).toBe(1343);
  });

  it('⑤低圧電力 6kW・0kWh（基本料金半額）', () => {
    // 出典: ⑤明細 J15 = 3491 / P15 = 3398
    const usage: UsageInput = { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 0 } };
    expect(bill(F.chugokuLowVoltage, usage, JULY).total.toNumber()).toBe(3491);
    expect(bill(F.jaDenkiLowVoltage, usage, JULY).total.toNumber()).toBe(3398);
  });

  it('③電化Style vs 夜トク 6kW・0kWh（基本料金半額）', () => {
    // 出典: ③明細 VS電化Style J19 = 1009 / P19 = 948
    const usage: UsageInput = { contractKw: 6, tou: {} };
    expect(bill(F.chugokuDenkaStyle, usage, JULY).total.toNumber()).toBe(1009);
    expect(bill(F.jaDenkiYotoku, usage, JULY).total.toNumber()).toBe(948);
  });

  it('⑥深夜電力B 4kW・0kWh（請求額全体が半額）', () => {
    // 出典: ⑥'深夜電力B'!I11 = 751.5
    expect(bill(F.chugokuMidnightB, { totalKwh: 0, contractKw: 4 }, JULY).total.toNumber()).toBe(751.5);
  });

  it('auでんきMプラン 0kWh（従量料金と燃調を切り上げ）', () => {
    // 出典: ☆au Mプラン明細 I20 = 625
    expect(bill(F.auMPlan, { totalKwh: 0 }, JULY, 'au').total.toNumber()).toBe(625);
    // 出典: ☆au Mプラン明細 V20 = 588
    expect(bill(F.jaDenkiJuryoS, { totalKwh: 0 }, JULY).total.toNumber()).toBe(588);
  });
});

/**
 * 同じプランを複数の試算表が別々にモデル化しており、値が食い違う箇所がある。
 * 本実装は「そのプラン専用のシート」を正とし、差異をここで固定して監視する。
 * 詳細と確認依頼は ASSUMPTIONS.md に記載。
 */
describe('元資料どうしの矛盾（既知の逸脱）', () => {
  it('夜トクプランの基本料金半額: ③は適用、⑥は非適用。③を採る', () => {
    // ③明細 P9 = IF(使用量=0, 早見表E5/2, 早見表E5) → 0kWh で 948円
    // ⑥'深夜電力B'!I17 は 1897.72 を直接置いており半額の判定がない → 1897円
    const actual = bill(F.jaDenkiYotoku, { contractKw: 4, tou: {} }, JULY).total.toNumber();
    expect(actual).toBe(948);
    expect(actual).not.toBe(1897);
  });

  it('JAでんき従量電灯Aの最低料金: ①は759.68、au版は759.67。①を採る', () => {
    // ①は早見表 1201 点で検証済みのため、そちらを正とする。
    // au版はさらに JA 側の燃調小計に ROUNDDOWN を掛けるため 0kWh で 678円になる。
    const actual = bill(F.jaDenkiJuryoA, { totalKwh: 0 }, JULY).total.toNumber();
    expect(actual).toBe(677);
    expect(Math.abs(actual - 678)).toBe(1);
  });
});

/**
 * ①の早見表は 0〜1200kWh の全点を持つ唯一の資料。26年4月適用の単価で検証する。
 * Excel は浮動小数点で集計しているため、厳密値がちょうど整数になる 52 点だけ
 * ROUNDDOWN が 1 円下振れする。該当 kWh を列挙し、差が必ず +1 円であることを固定する。
 */
const EXCEL_FLOAT_DISCREPANCY_KWH = new Set([
  18, 33, 38, 48, 58, 68, 113, 125, 225, 250, 275, 300, 320, 340, 360, 400, 420, 440, 480, 500,
  520, 540, 580, 600, 620, 640, 680, 700, 720, 740, 760, 780, 800, 820, 840, 860, 880, 920, 940,
  960, 980, 1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140, 1160, 1180, 1200
]);

type LookupTable = Record<string, number>;
const tables = (lookup as unknown as { plans: Record<string, LookupTable> }).plans;

describe('①早見表 0〜1200kWh 全点回帰（26年4月適用）', () => {
  it('従量電灯A は 1201 点すべて差異 0 円', () => {
    const expected = tables.ja_denki_juryo_a;
    const points = Object.keys(expected).map(Number);
    expect(points).toHaveLength(1201);
    const mismatches = points.filter(
      kwh => !bill(F.jaDenkiJuryoA, { totalKwh: kwh }, APRIL).total.equals(expected[String(kwh)])
    );
    expect(mismatches).toEqual([]);
  });

  it('従量電灯S は誤差点を除き差異 0 円', () => {
    const expected = tables.ja_denki_juryo_s;
    const mismatches = Object.keys(expected)
      .map(Number)
      .filter(kwh => !EXCEL_FLOAT_DISCREPANCY_KWH.has(kwh))
      .filter(
        kwh => !bill(F.jaDenkiJuryoS, { totalKwh: kwh }, APRIL).total.equals(expected[String(kwh)])
      );
    expect(mismatches).toEqual([]);
  });

  it('誤差点は必ず Excel より 1 円高く、厳密値は整数', () => {
    const expected = tables.ja_denki_juryo_s;
    for (const kwh of EXCEL_FLOAT_DISCREPANCY_KWH) {
      const b = bill(F.jaDenkiJuryoS, { totalKwh: kwh }, APRIL);
      expect(b.total.minus(expected[String(kwh)]).toNumber()).toBe(1);
      const exact = b.energyChargeTotal.plus(b.fuelAdjustment).plus(b.renewableLevy);
      expect(exact.isInteger()).toBe(true);
    }
  });
});

describe('26年7月適用の燃料費調整額・再エネ賦課金', () => {
  it('中国電力エリアは 15kWhまで -143.77円 / 超過 -9.57円/kWh', () => {
    const f = lookupFuelAdjustment(JULY)!;
    expect(f.value.minimumCharge.toNumber()).toBe(-143.77);
    expect(f.value.unitPriceYenPerKwh.toNumber()).toBe(-9.57);
  });

  it('auでんきは独自単価 15kWhまで -196.24円 / 超過 -13.09円/kWh', () => {
    const f = lookupFuelAdjustment(JULY, 'au')!;
    expect(f.value.minimumCharge.toNumber()).toBe(-196.24);
    expect(f.value.unitPriceYenPerKwh.toNumber()).toBe(-13.09);
  });

  it('再エネ賦課金は 4.18円/kWh', () => {
    expect(lookupRenewableLevy(JULY)!.value.unitPriceYenPerKwh.toNumber()).toBe(4.18);
  });

  it('未収録の月は null を返す（推測しない）', () => {
    expect(lookupFuelAdjustment({ year: 2030, month: 1 })).toBeNull();
    expect(lookupRenewableLevy({ year: 2030, month: 1 })).toBeNull();
    expect(lookupFuelAdjustment(APRIL, 'au')).toBeNull();
  });

  it('4月と7月で請求額が変わる（燃調が実際に効いている）', () => {
    const april = bill(F.jaDenkiJuryoA, { totalKwh: 348 }, APRIL).total;
    const july = bill(F.jaDenkiJuryoA, { totalKwh: 348 }, JULY).total;
    expect(july.greaterThan(april)).toBe(true);
    expect(new Decimal(july).minus(april).toNumber()).toBeGreaterThan(0);
  });
});
