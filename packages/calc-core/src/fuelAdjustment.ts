import Decimal from 'decimal.js';
import { FuelAdjustmentEntry } from './models';

export function calculateFuelAdjustment(
  subtotalCharge: Decimal,
  usageKwh: number,
  fuelAdjustment: FuelAdjustmentEntry | undefined
): Decimal {
  if (!fuelAdjustment || fuelAdjustment.method === 'none') {
    return new Decimal('0');
  }

  if (!fuelAdjustment.unitPriceYenPerKwh) {
    return new Decimal('0');
  }

  if (fuelAdjustment.method === 'multiplicative') {
    // 燃料費調整が使用量ベース
    const usageDecimal = new Decimal(usageKwh);
    return usageDecimal.times(fuelAdjustment.unitPriceYenPerKwh);
  } else if (fuelAdjustment.method === 'additive') {
    // 燃料費調整が小計ベース
    return subtotalCharge.times(fuelAdjustment.unitPriceYenPerKwh);
  }

  return new Decimal('0');
}

export function describeFuelAdjustment(
  fuelAdjustment: FuelAdjustmentEntry | undefined,
  charge: Decimal
): string {
  if (!fuelAdjustment || fuelAdjustment.method === 'none') {
    return '燃料費調整: 0円';
  }

  if (fuelAdjustment.method === 'multiplicative') {
    return `燃料費調整 (使用量ベース): ${charge.toFixed(2)}円`;
  } else if (fuelAdjustment.method === 'additive') {
    return `燃料費調整 (料金ベース): ${charge.toFixed(2)}円`;
  }

  return '燃料費調整: 計算不可';
}
