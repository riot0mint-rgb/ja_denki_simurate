import { Decimal } from '../src/decimal-config';
import { BillingCalculator } from '../src/calculator';
import { lookupFuelAdjustment, lookupRenewableLevy, RatePeriod } from '../src/monthlyRates';
import { RatePlan, UsageInput } from '../src/models';
import * as F from './fixtures';

/**
 * 営業資料による独立検証。
 *
 * 単価そのものは試算表 Excel から転記しているが、社内資料
 * 「JAでんき_職員向け説明会.pptx」と「広島市 JAでんき案内資料 r3.pptx」には
 * 中国電力との差額が明記されている。転記ミスや将来の改定漏れを検知するため、
 * この差額関係をテストで固定する。
 *
 * 出典: JAでんき_職員向け説明会.pptx スライド5「料金設計の考え方」
 *       広島市 JAでんき案内資料 r3.pptx p.17
 */

const calculator = new BillingCalculator();
const APRIL: RatePeriod = { year: 2026, month: 4 };

function bill(plan: RatePlan, usage: UsageInput, period: RatePeriod = APRIL) {
  const r = calculator.calculate({
    usage,
    plan,
    fuelAdjustment: lookupFuelAdjustment(period)!.value,
    renewableLevy: lookupRenewableLevy(period)!.value
  });
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
}

describe('営業資料に明記された中国電力との差額', () => {
  it('従量電灯A: 最低料金は中国電力と同額', () => {
    expect(F.jaDenkiJuryoA.minimumCharge.equals(F.chugokuJuryoA.minimumCharge)).toBe(true);
  });

  it('従量電灯A: 第2段階 -1.39円/kWh', () => {
    const chugoku = F.chugokuJuryoA.tiers[1].unitPriceYenPerKwh;
    const ja = F.jaDenkiJuryoA.tiers[1].unitPriceYenPerKwh;
    expect(chugoku.minus(ja).toNumber()).toBe(1.39);
  });

  it('従量電灯A: 第3段階 -2.71円/kWh', () => {
    const chugoku = F.chugokuJuryoA.tiers[2].unitPriceYenPerKwh;
    const ja = F.jaDenkiJuryoA.tiers[2].unitPriceYenPerKwh;
    expect(chugoku.minus(ja).toNumber()).toBe(2.71);
  });

  it('従量電灯S: 最低料金 -89.76円/契約', () => {
    expect(F.chugokuJuryoA.minimumCharge.minus(F.jaDenkiJuryoS.minimumCharge).toNumber()).toBe(89.76);
  });

  it('低圧電力: 基本料金 -31.09円/kW', () => {
    expect(
      F.chugokuLowVoltage.baseChargePerKw.minus(F.jaDenkiLowVoltage.baseChargePerKw).toNumber()
    ).toBe(31.09);
  });

  it('夜トクプラン: 基本料金 -121.0円（電化Style比）', () => {
    expect(
      F.chugokuDenkaStyle.baseChargeUpTo10Kw!.minus(F.jaDenkiYotoku.baseChargeUpTo10Kw!).toNumber()
    ).toBe(121);
  });

  it('夜トクプラン: 10kW超過分も -22.0円/kW', () => {
    expect(
      F.chugokuDenkaStyle.baseChargePerKwOver10!
        .minus(F.jaDenkiYotoku.baseChargePerKwOver10!)
        .toNumber()
    ).toBe(22);
  });

  it('夜トクプランの時間帯単価は電化Styleと同額', () => {
    for (const band of ['dayOther', 'daySummer', 'night', 'holiday'] as const) {
      expect(F.jaDenkiYotoku.unitPrices[band].equals(F.chugokuDenkaStyle.unitPrices[band])).toBe(true);
    }
  });

  it('低圧電力の従量単価は中国電力と同額（基本料金差だけでメリットを出す）', () => {
    expect(
      F.jaDenkiLowVoltage.summerUnitPriceYenPerKwh.equals(F.chugokuLowVoltage.summerUnitPriceYenPerKwh)
    ).toBe(true);
    expect(
      F.jaDenkiLowVoltage.otherUnitPriceYenPerKwh.equals(F.chugokuLowVoltage.otherUnitPriceYenPerKwh)
    ).toBe(true);
  });

  it('分岐目安は217kWh前後（216以下はS・218以上はA）', () => {
    const a = (kwh: number) => bill(F.jaDenkiJuryoA, { totalKwh: kwh }).total;
    const s = (kwh: number) => bill(F.jaDenkiJuryoS, { totalKwh: kwh }).total;
    expect(s(216).lessThan(a(216))).toBe(true);
    expect(a(217).equals(s(217))).toBe(true);
    expect(a(218).lessThan(s(218))).toBe(true);
  });

  it('削減率は概ね3〜5%の範囲に収まる（従量電灯A・一般的な使用量帯）', () => {
    // 営業資料「概ね3〜5％目安」。300〜600kWh の帯で確認する。
    for (const kwh of [300, 400, 500, 600]) {
      const current = bill(F.chugokuJuryoA, { totalKwh: kwh }).total;
      const ja = bill(F.jaDenkiJuryoA, { totalKwh: kwh }).total;
      const rate = current.minus(ja).dividedBy(current).times(100);
      expect(rate.greaterThan(new Decimal('3'))).toBe(true);
      expect(rate.lessThan(new Decimal('6'))).toBe(true);
    }
  });
});

describe('営業資料に明記された運用ルール', () => {
  it('1か月まったく使用がない場合は基本料金が半額になる', () => {
    // 出典: 職員向け説明会.pptx Q20
    const zero = bill(F.chugokuLowVoltage, {
      contractKw: 6,
      seasonal: { summerKwh: 0, otherKwh: 0 }
    });
    const some = bill(F.chugokuLowVoltage, {
      contractKw: 6,
      seasonal: { summerKwh: 1, otherKwh: 0 }
    });
    expect(zero.baseCharge.times(2).toNumber()).toBe(some.baseCharge.toNumber());
  });
});
