import Decimal from 'decimal.js';
import {
  MonthlyBill,
  RatePlan,
  FuelAdjustmentEntry,
  RenewableLevyEntry,
  CalculationInput
} from './models';
import { calculateTieredCharge, sumTierCharges, describeTierCalculation } from './tariff';
import { calculateFuelAdjustment, describeFuelAdjustment } from './fuelAdjustment';
import { calculateRenewableLevy, describeRenewableLevy } from './renewableLevy';
import { applyRounding, getRoundingDescription } from './rounding';

export class BillingCalculator {
  calculateMonthlyBill(input: CalculationInput): MonthlyBill {
    const {
      usageKwh,
      plan,
      fuelAdjustment,
      renewableLevy
    } = input;

    const usageDecimal = new Decimal(usageKwh);

    // 基本料金または最低料金（どちらか大きい方）
    let minimumCharge = new Decimal('0');
    let baseChargeValue = new Decimal('0');

    if (plan.baseCharge.value) {
      baseChargeValue = plan.baseCharge.value;
    }

    if (plan.minimumCharge.value) {
      minimumCharge = plan.minimumCharge.value;
    }

    const effectiveBaseCharge = baseChargeValue.greaterThan(minimumCharge)
      ? baseChargeValue
      : minimumCharge;

    // 段階別料金計算
    const tierCalculations = calculateTieredCharge(usageKwh, plan);
    const tierCharge = sumTierCharges(tierCalculations);

    // 小計（基本料金 + 段階別料金）
    const subtotal = effectiveBaseCharge.plus(tierCharge);

    // 燃料費調整
    const fuelAdjustmentCharge = calculateFuelAdjustment(
      subtotal,
      usageKwh,
      fuelAdjustment
    );

    // 再エネ賦課金
    const renewableLevyCharge = calculateRenewableLevy(usageKwh, renewableLevy);

    // 小計（調整含む）
    const beforeRounding = subtotal
      .plus(fuelAdjustmentCharge)
      .plus(renewableLevyCharge);

    // 端数処理
    const afterRounding = applyRounding(
      beforeRounding,
      plan.roundingRule.method,
      plan.roundingRule.unit
    );

    // 計算式の自然言語表現
    const tierDesc = describeTierCalculation(usageKwh, tierCalculations);
    const fuelDesc = describeFuelAdjustment(fuelAdjustment, fuelAdjustmentCharge);
    const levyDesc = describeRenewableLevy(renewableLevy, renewableLevyCharge);
    const roundingDesc = getRoundingDescription(
      plan.roundingRule.method,
      plan.roundingRule.unit
    );

    const formula = [
      `基本料金: ${effectiveBaseCharge.toFixed(2)}円`,
      tierDesc,
      fuelDesc,
      levyDesc,
      `小計: ${beforeRounding.toFixed(2)}円`,
      roundingDesc,
      `合計: ${afterRounding.toFixed(2)}円`
    ].join(' → ');

    return {
      minimumCharge: plan.minimumCharge.value || new Decimal('0'),
      tier1: tierCalculations.find(t => t.tierNumber === 1)?.charge || new Decimal('0'),
      tier2: tierCalculations.find(t => t.tierNumber === 2)?.charge || new Decimal('0'),
      tier3: tierCalculations.find(t => t.tierNumber === 3)?.charge || new Decimal('0'),
      tier4: tierCalculations.find(t => t.tierNumber === 4)?.charge || new Decimal('0'),
      fuelAdjustment: fuelAdjustmentCharge,
      renewableLevy: renewableLevyCharge,
      subtotal,
      beforeRounding,
      afterRounding,
      roundingMethod: plan.roundingRule.method,
      formula,
      rateReference: `${plan.planName} (${plan.effectiveFrom}〜)`,
      sourceFile: plan.sources[0]?.document || 'Unknown',
      verificationStatus: 'partial'
    };
  }

  calculateMonthlyAndAnnual(input: CalculationInput): {
    monthly: MonthlyBill;
    annual: Decimal;
  } {
    const monthly = this.calculateMonthlyBill(input);
    const annual = monthly.afterRounding.times(new Decimal('12'));

    return { monthly, annual };
  }
}

export const calculator = new BillingCalculator();
