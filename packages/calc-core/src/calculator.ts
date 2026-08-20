import { Decimal } from './decimal-config.js';
import {
  BillResult,
  CalculationInput,
  FlatRatePlan,
  FuelAdjustment,
  MonthlyBill,
  RenewableLevy,
  TieredMinimumPlan,
  TierBreakdown
} from './models.js';
import { roundDownToYen } from './rounding.js';
import { validateUsageKwh } from './utils.js';

/**
 * JAでんき公式試算表と同一の手順で月額電気料金を算出する。
 *
 * 元資料: ①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx
 *         シート「シミュレーション結果明細 VS従量Ａ」/「〜 VSシンプル」
 *
 * 段階制プラン (Excel 明細 VS従量Ａ):
 *   (1) 最低料金                = 定額（最初の15kWh分を含む）
 *   (2) 第1段階                 = 単価 × MAX(MIN(使用量,120)-15, 0)
 *   (3) 第2段階                 = 単価 × MAX(MIN(使用量,300)-120, 0)
 *   (4) 第3段階                 = 単価 × (使用量 - (2)kWh - (3)kWh - 15)
 *   (9) 燃料費調整額            = 15kWh分定額 + 単価 × MAX(使用量-15, 0)
 *  (13) 再エネ賦課金            = ROUNDDOWN(単価 × MAX(使用量, 15))
 *       電気料金                = ROUNDDOWN( (1)+(2)+(3)+(4)+(9)+(13) )
 *
 * 一律単価プラン (Excel 明細 VSシンプル):
 *   (6) 従量料金                = 単価 × 使用量
 *   (9) 燃料費調整額            = 単価 × 使用量
 *  (12) 再エネ賦課金            = ROUNDDOWN(単価 × 使用量)
 *       電気料金                = IF( (6)+(9) < 最低月額閾値, 最低月額請求額,
 *                                     ROUNDDOWN( (6)+(9)+(12) ) )
 */
export class BillingCalculator {
  calculate(input: CalculationInput): BillResult {
    const validation = validateUsageKwh(input.usageKwh);
    if (!validation.valid) {
      return {
        status: 'unsupported',
        reason: validation.reason,
        nextSteps: [
          'ご使用量（kWh）を検針票のとおりに入力してください',
          '0 以上の数値のみ計算できます'
        ]
      };
    }

    const usage = new Decimal(input.usageKwh);
    const bill =
      input.plan.structure === 'tiered_minimum'
        ? this.calculateTiered(usage, input.plan, input.fuelAdjustment, input.renewableLevy)
        : this.calculateFlat(usage, input.plan, input.fuelAdjustment, input.renewableLevy);

    return { status: 'ok', bill };
  }

  private calculateTiered(
    usage: Decimal,
    plan: TieredMinimumPlan,
    fuel: FuelAdjustment,
    levy: RenewableLevy
  ): MonthlyBill {
    const included = new Decimal(plan.minimumIncludedKwh);

    const tiers: TierBreakdown[] = [];
    let tierSubtotal = new Decimal('0');
    let alreadyCharged = new Decimal('0');

    for (const tier of plan.tiers) {
      // Excel は最終段階だけ「使用量 - 下位段階kWh - 15」で残量を求める。
      // 上限のない段階は endKwh が null なのでこの分岐で表現する。
      const chargedKwh =
        tier.endKwh === null
          ? Decimal.max(usage.minus(alreadyCharged).minus(included), 0)
          : Decimal.max(Decimal.min(usage, tier.endKwh).minus(tier.startKwh), 0);

      alreadyCharged = alreadyCharged.plus(chargedKwh);
      const charge = tier.unitPriceYenPerKwh.times(chargedKwh);
      tierSubtotal = tierSubtotal.plus(charge);
      tiers.push({
        tierNumber: tier.tierNumber,
        chargedKwh,
        unitPriceYenPerKwh: tier.unitPriceYenPerKwh,
        charge
      });
    }

    const energyChargeTotal = plan.minimumCharge.plus(tierSubtotal);

    const meteredKwh = Decimal.max(usage.minus(included), 0);
    const fuelCharge = fuel.minimumCharge.plus(fuel.unitPriceYenPerKwh.times(meteredKwh));

    // 賦課金は 15kWh 分 + 超過分。合算すると単価 × MAX(使用量, 15) と等しい。
    const levyCharge = roundDownToYen(
      levy.unitPriceYenPerKwh.times(Decimal.max(usage, included))
    );

    const total = roundDownToYen(energyChargeTotal.plus(fuelCharge).plus(levyCharge));

    return {
      minimumCharge: plan.minimumCharge,
      tiers,
      tierSubtotal,
      energyChargeTotal,
      fuelAdjustment: fuelCharge,
      renewableLevy: levyCharge,
      minimumMonthlyApplied: false,
      total,
      formula: this.describeTiered(plan, tiers, energyChargeTotal, fuelCharge, levyCharge, total),
      sources: plan.sources
    };
  }

  private calculateFlat(
    usage: Decimal,
    plan: FlatRatePlan,
    fuel: FuelAdjustment,
    levy: RenewableLevy
  ): MonthlyBill {
    const energyChargeTotal = plan.unitPriceYenPerKwh.times(usage);
    const fuelCharge = fuel.unitPriceYenPerKwh.times(usage);
    const levyCharge = roundDownToYen(levy.unitPriceYenPerKwh.times(usage));

    // Excel は賦課金を含めずに閾値判定し、下回ったら賦課金も含めず最低月額料金に置き換える。
    const beforeLevy = energyChargeTotal.plus(fuelCharge);
    const minimumMonthlyApplied = beforeLevy.lessThan(plan.minimumMonthlyThreshold);
    const total = minimumMonthlyApplied
      ? plan.minimumMonthlyBill
      : roundDownToYen(beforeLevy.plus(levyCharge));

    return {
      minimumCharge: new Decimal('0'),
      tiers: [
        {
          tierNumber: 1,
          chargedKwh: usage,
          unitPriceYenPerKwh: plan.unitPriceYenPerKwh,
          charge: energyChargeTotal
        }
      ],
      tierSubtotal: energyChargeTotal,
      energyChargeTotal,
      fuelAdjustment: fuelCharge,
      renewableLevy: levyCharge,
      minimumMonthlyApplied,
      total,
      formula: minimumMonthlyApplied
        ? `従量料金 ${energyChargeTotal.toFixed(2)}円 + 燃料費調整額 ${fuelCharge.toFixed(2)}円 ` +
          `= ${beforeLevy.toFixed(2)}円 が最低月額料金 ${plan.minimumMonthlyThreshold.toFixed(2)}円 に満たないため、` +
          `最低月額料金 ${plan.minimumMonthlyBill.toFixed(0)}円 を適用 → 合計: ${total.toFixed(0)}円`
        : `従量料金: ${plan.unitPriceYenPerKwh.toFixed(2)}円 × ${usage.toFixed(0)}kWh = ${energyChargeTotal.toFixed(2)}円 → ` +
          `燃料費調整額: ${fuelCharge.toFixed(2)}円 → 再エネ賦課金: ${levyCharge.toFixed(0)}円（円未満切り捨て） → ` +
          `合計: ${total.toFixed(0)}円（円未満切り捨て）`,
      sources: plan.sources
    };
  }

  private describeTiered(
    plan: TieredMinimumPlan,
    tiers: TierBreakdown[],
    energyChargeTotal: Decimal,
    fuelCharge: Decimal,
    levyCharge: Decimal,
    total: Decimal
  ): string {
    const tierDesc = tiers
      .filter(t => t.chargedKwh.greaterThan(0))
      .map(
        t =>
          `第${t.tierNumber}段階: ${t.unitPriceYenPerKwh.toFixed(2)}円 × ${t.chargedKwh.toFixed(0)}kWh = ${t.charge.toFixed(2)}円`
      )
      .join(' + ');

    return [
      `最低料金（${plan.minimumIncludedKwh}kWhまで含む）: ${plan.minimumCharge.toFixed(2)}円`,
      tierDesc || '電力量料金: 0円（最低料金に含まれる範囲）',
      `従量料金合計: ${energyChargeTotal.toFixed(2)}円`,
      `燃料費調整額: ${fuelCharge.toFixed(2)}円`,
      `再エネ賦課金: ${levyCharge.toFixed(0)}円（円未満切り捨て）`,
      `合計: ${total.toFixed(0)}円（円未満切り捨て）`
    ].join(' → ');
  }
}

export const calculator = new BillingCalculator();
