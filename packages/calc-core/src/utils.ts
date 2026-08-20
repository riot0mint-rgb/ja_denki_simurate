import { Decimal } from './decimal-config.js';

export interface ValidationResult {
  valid: boolean;
  reason: string;
}

export function validateUsageKwh(usage: number | Decimal): ValidationResult {
  if (usage instanceof Decimal) {
    if (!usage.isFinite()) {
      return { valid: false, reason: 'ご使用量が有効な数値ではありません' };
    }
    // isNegative() は負のゼロでも true を返す。振替後の使用量は引き算で
    // -0 になることがあり、number 側（usage < 0）と判定が食い違ってしまう
    if (usage.lessThan(0)) {
      return { valid: false, reason: 'ご使用量に負の値は指定できません' };
    }
    return { valid: true, reason: '' };
  }
  if (typeof usage !== 'number' || Number.isNaN(usage)) {
    return { valid: false, reason: 'ご使用量が数値として認識できません' };
  }
  if (!Number.isFinite(usage)) {
    return { valid: false, reason: 'ご使用量が有効な数値ではありません' };
  }
  if (usage < 0) {
    return { valid: false, reason: 'ご使用量に負の値は指定できません' };
  }
  return { valid: true, reason: '' };
}

/**
 * 金額の桁を落とさずに表示する。
 * Number への変換を挟むと 2^53 超で下位桁が壊れ、Intl 側で独自に丸められるため、
 * Decimal のまま整数化してから 3 桁区切りを付ける。
 */
export function formatCurrency(amount: Decimal): string {
  const rounded = amount.toDecimalPlaces(0, Decimal.ROUND_DOWN);
  const negative = rounded.isNegative();
  const digits = rounded.abs().toFixed(0);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}￥${grouped}`;
}

export function formatPercentage(percent: Decimal, decimalPlaces: number = 1): string {
  return `${percent.toDecimalPlaces(decimalPlaces).toFixed(decimalPlaces)}%`;
}

export function describeMonthlyDifference(savings: Decimal): string {
  if (savings.isZero()) return '同額';
  if (savings.greaterThan(0)) return `${formatCurrency(savings)}お得`;
  return `${formatCurrency(savings.abs())}高い`;
}

export function describeAnnualSavings(annual: Decimal): string {
  if (annual.isZero()) return '年間削減額: 0円';
  if (annual.greaterThan(0)) return `年間削減額: ${formatCurrency(annual)}`;
  return `年間追加費用: ${formatCurrency(annual.abs())}`;
}
