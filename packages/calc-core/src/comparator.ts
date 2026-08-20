import Decimal from 'decimal.js';
import { MonthlyBill, ComparisonResult, CalculationInput, RatePlan } from './models';
import { calculator } from './calculator';

export class BillingComparator {
  compare(
    currentInput: CalculationInput,
    jadenInput: CalculationInput,
    campaignDiscount?: Decimal
  ): ComparisonResult {
    const currentBill = calculator.calculateMonthlyBill(currentInput);
    const jadenBill = calculator.calculateMonthlyBill(jadenInput);

    const monthlyDifference = currentBill.afterRounding.minus(jadenBill.afterRounding);
    const monthlyDifferencePercent = monthlyDifference.dividedBy(
      currentBill.afterRounding
    ).times(new Decimal('100'));

    const annualDifference = monthlyDifference.times(new Decimal('12'));

    let campaignNetDifference: Decimal | undefined;
    if (campaignDiscount) {
      campaignNetDifference = monthlyDifference.minus(campaignDiscount);
    }

    return {
      currentProviderPlan: currentInput.plan.planName,
      currentProviderMonthlyCharge: currentBill.afterRounding,
      jadenBill: jadenBill.afterRounding,
      monthlyDifference,
      monthlyDifferencePercent,
      annualDifference,
      campaignDiscount,
      campaignNetDifference,
      details: {
        currentBill,
        jadenBill
      }
    };
  }
}

export const comparator = new BillingComparator();
