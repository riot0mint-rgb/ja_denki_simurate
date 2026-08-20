import Decimal from 'decimal.js';
import { RenewableLevyEntry } from './models';

export function calculateRenewableLevy(
  usageKwh: number,
  renewableLevy: RenewableLevyEntry | undefined
): Decimal {
  if (!renewableLevy || !renewableLevy.unitPriceYenPerKwh) {
    return new Decimal('0');
  }

  const usageDecimal = new Decimal(usageKwh);
  return usageDecimal.times(renewableLevy.unitPriceYenPerKwh);
}

export function describeRenewableLevy(
  renewableLevy: RenewableLevyEntry | undefined,
  charge: Decimal
): string {
  if (!renewableLevy || !renewableLevy.unitPriceYenPerKwh) {
    return '再エネ賦課金: 0円';
  }

  return `再エネ賦課金: ${charge.toFixed(2)}円`;
}
