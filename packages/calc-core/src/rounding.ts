import { Decimal } from './decimal-config.js';

/**
 * 円未満切り捨て。
 *
 * 公式試算表は Excel の ROUNDDOWN を使っている。ROUNDDOWN は 0 方向への
 * 切り捨てであり、-∞ 方向に丸める Decimal.floor とは負数で挙動が異なるため、
 * 明示的に ROUND_DOWN を指定する。
 */
export function roundDownToYen(amount: Decimal): Decimal {
  return amount.toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

/**
 * 円未満切り上げ。auでんきの明細は従量料金合計と燃料費調整額に
 * ROUNDUP を使う（☆JAでんき試算表(VS auでんき_Ｍプラン) 明細 I13/I16）。
 */
export function roundUpToYen(amount: Decimal): Decimal {
  return amount.toDecimalPlaces(0, Decimal.ROUND_UP);
}

export type RoundingMode = 'none' | 'up' | 'down';

export function applyRounding(amount: Decimal, mode: RoundingMode): Decimal {
  switch (mode) {
    case 'up':
      return roundUpToYen(amount);
    case 'down':
      return roundDownToYen(amount);
    case 'none':
      return amount;
  }
}

export function describeRounding(mode: RoundingMode): string {
  switch (mode) {
    case 'up':
      return '円未満切り上げ';
    case 'down':
      return '円未満切り捨て';
    case 'none':
      return '端数処理なし';
  }
}
