import Decimal from 'decimal.js';

export function validateUsageKwh(usage: number): boolean {
  return typeof usage === 'number' && usage >= 0 && isFinite(usage);
}

export function validateDecimal(value: Decimal | null): boolean {
  if (value === null) return true;
  return value instanceof Decimal && value.greaterThanOrEqualTo('0');
}

export function formatCurrency(amount: Decimal, locale: string = 'ja-JP'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Number(amount.toString()));
}

export function formatPercentage(percent: Decimal, decimalPlaces: number = 2): string {
  return `${percent.toDecimalPlaces(decimalPlaces).toFixed(decimalPlaces)}%`;
}

export function describeMonthlyDifference(difference: Decimal): string {
  if (difference.isZero()) {
    return '同額';
  } else if (difference.greaterThan(0)) {
    return `${formatCurrency(difference)}お得`;
  } else {
    return `${formatCurrency(difference.abs())}高い`;
  }
}

export function describeAnnualSavings(annual: Decimal): string {
  if (annual.isZero()) {
    return '年間削減額: 0円';
  } else if (annual.greaterThan(0)) {
    return `年間削減額: ${formatCurrency(annual)}`;
  } else {
    return `年間追加費用: ${formatCurrency(annual.abs())}`;
  }
}
