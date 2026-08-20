import { Decimal } from './decimal-config.js';

/**
 * 円未満切り捨て。
 *
 * JAでんき公式試算表は電気料金・再エネ賦課金の双方に Excel の ROUNDDOWN を
 * 使っている。ROUNDDOWN は 0 方向への切り捨てであり、-∞ 方向に丸める
 * Decimal.floor とは負数で挙動が異なるため、明示的に ROUND_DOWN を指定する。
 */
export function roundDownToYen(amount: Decimal): Decimal {
  return amount.toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

export function describeRounding(): string {
  return '円未満切り捨て';
}
