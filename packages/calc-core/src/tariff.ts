import Decimal from 'decimal.js';
import { RatePlan } from './models';

export interface TierCalculation {
  tierNumber: number;
  startKwh: number;
  endKwh: number | null;
  chargedKwh: Decimal;
  unitPrice: Decimal;
  charge: Decimal;
}

export function calculateTieredCharge(
  usageKwh: number,
  plan: RatePlan
): TierCalculation[] {
  const usageDecimal = new Decimal(usageKwh);
  const calculations: TierCalculation[] = [];

  for (const tier of plan.tiers) {
    const startKwh = new Decimal(tier.startKwh);
    const endKwhValue = tier.endKwh !== null ? new Decimal(tier.endKwh) : null;

    let chargedKwh: Decimal;
    let isApplicable = false;

    if (endKwhValue === null) {
      // 最終段階 (300 kWh以上の場合など)
      if (usageDecimal.greaterThan(startKwh)) {
        chargedKwh = usageDecimal.minus(startKwh);
        isApplicable = true;
      }
    } else {
      // 中間段階 (例: 15-120 kWh)
      if (usageDecimal.greaterThan(startKwh)) {
        const effectiveEnd = usageDecimal.lessThan(endKwhValue)
          ? usageDecimal
          : endKwhValue;
        chargedKwh = effectiveEnd.minus(startKwh);
        isApplicable = true;
      }
    }

    if (isApplicable) {
      const charge = chargedKwh.times(tier.unitPriceYenPerKwh);
      calculations.push({
        tierNumber: tier.tierNumber,
        startKwh: tier.startKwh,
        endKwh: tier.endKwh,
        chargedKwh,
        unitPrice: tier.unitPriceYenPerKwh,
        charge
      });
    }
  }

  return calculations;
}

export function sumTierCharges(calculations: TierCalculation[]): Decimal {
  return calculations.reduce(
    (sum, calc) => sum.plus(calc.charge),
    new Decimal('0')
  );
}

export function describeTierCalculation(
  usageKwh: number,
  calculations: TierCalculation[]
): string {
  const parts: string[] = [];

  for (const calc of calculations) {
    const priceStr = calc.unitPrice.toFixed(2);
    const kwh = calc.chargedKwh.toFixed(2);
    const charge = calc.charge.toFixed(2);
    parts.push(
      `段階${calc.tierNumber}: ${kwh}kWh × ${priceStr}円/kWh = ${charge}円`
    );
  }

  return parts.join(' + ');
}
