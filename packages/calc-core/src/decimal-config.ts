// 名前付き import を使う。default import は decimal.js の型定義で
// クラスと名前空間が併合されており、ESM 解決だと型として使えなくなる。
import { Decimal } from 'decimal.js';

export function configureDecimal(): void {
  Decimal.set({
    precision: 28,
    rounding: Decimal.ROUND_HALF_UP,
    toExpPos: 21,
    toExpNeg: -7,
    maxE: 9e15,
    minE: -9e15,
    modulo: Decimal.ROUND_DOWN,
    crypto: false
  });
}

configureDecimal();

export { Decimal };
