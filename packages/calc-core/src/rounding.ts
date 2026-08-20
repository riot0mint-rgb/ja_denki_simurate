import Decimal from 'decimal.js';

export type RoundingMethod = 'floor' | 'round' | 'ceil';
export type RoundingUnit = 'yen' | 'ten_yen';

export function applyRounding(
  amount: Decimal,
  method: RoundingMethod,
  unit: RoundingUnit = 'yen'
): Decimal {
  const divisor = unit === 'yen' ? new Decimal('1') : new Decimal('10');

  let result: Decimal;

  if (unit === 'yen') {
    switch (method) {
      case 'floor':
        result = amount.floor();
        break;
      case 'round':
        result = amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        break;
      case 'ceil':
        result = amount.ceil();
        break;
      default:
        throw new Error(`Unknown rounding method: ${method}`);
    }
  } else {
    // 10円単位での処理
    const divided = amount.dividedBy(divisor);
    let rounded: Decimal;

    switch (method) {
      case 'floor':
        rounded = divided.floor();
        break;
      case 'round':
        rounded = divided.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        break;
      case 'ceil':
        rounded = divided.ceil();
        break;
      default:
        throw new Error(`Unknown rounding method: ${method}`);
    }

    result = rounded.times(divisor);
  }

  return result;
}

export function getRoundingDescription(
  method: RoundingMethod,
  unit: RoundingUnit
): string {
  const unitLabel = unit === 'yen' ? '1円' : '10円';
  switch (method) {
    case 'floor':
      return `${unitLabel}未満を切り捨て`;
    case 'round':
      return `${unitLabel}未満を四捨五入`;
    case 'ceil':
      return `${unitLabel}未満を切り上げ`;
    default:
      return 'Unknown rounding method';
  }
}
