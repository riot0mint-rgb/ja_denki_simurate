import { Decimal } from './decimal-config.js';
import { MonthlyBill } from './models.js';

/**
 * 「なぜ差が出るのか」を、計算の内訳から機械的に組み立てる。
 *
 * **生成AIは使わない。** 説明は請求額の構成要素どうしの引き算であり、
 * 同じ入力には必ず同じ文章が出る。文言はテンプレートなので人がレビューできる。
 *
 * 分解は必ず総額の差と一致させる。一致しない説明は、営業がお客様に
 * 「合わないじゃないか」と言われる材料にしかならない。
 */

/** 請求額の構成要素。プラス＝乗り換え先のほうが安い */
export interface ExplanationPart {
  key: 'base' | 'energy' | 'discount' | 'fuel' | 'levy' | 'rounding';
  label: string;
  currentYen: Decimal;
  candidateYen: Decimal;
  differenceYen: Decimal;
}

/** 電力量料金の行どうしの比較。同じ構造のプランどうしでしか出せない */
export interface LineComparison {
  label: string;
  /** 課金対象量。両者で違う場合は null（時間帯の振り替えなど） */
  quantity: Decimal | null;
  currentUnitPrice: Decimal | null;
  candidateUnitPrice: Decimal | null;
  /** 単価の差。プラス＝乗り換え先が安い */
  unitPriceDifference: Decimal | null;
  differenceYen: Decimal;
}

export interface Explanation {
  /** 内訳での比較ができたか。最低月額料金が効いている月はできない */
  comparable: boolean;
  /** できなかった理由 */
  reason: string | null;
  parts: ExplanationPart[];
  lines: LineComparison[];
  /** 差額の合計。総額の差と必ず一致する */
  totalDifferenceYen: Decimal;
  /** 差の大きい順に並べた説明文。多くても3件 */
  highlights: string[];
}

const ZERO = new Decimal('0');

/** 円未満の丸めで生じた分。内訳の合計と請求額のずれを吸収する */
function roundingResidual(bill: MonthlyBill): Decimal {
  return bill.total
    .minus(bill.baseCharge)
    .minus(bill.energySubtotal)
    .minus(bill.discount)
    .minus(bill.fuelAdjustment)
    .minus(bill.renewableLevy);
}

function partsOf(current: MonthlyBill, candidate: MonthlyBill): ExplanationPart[] {
  const rows: Array<{ key: ExplanationPart['key']; label: string; pick: (b: MonthlyBill) => Decimal }> = [
    { key: 'base', label: '基本料金・最低料金', pick: b => b.baseCharge },
    { key: 'energy', label: '電力量料金', pick: b => b.energySubtotal },
    { key: 'discount', label: '割引', pick: b => b.discount },
    { key: 'fuel', label: '燃料費調整額', pick: b => b.fuelAdjustment },
    { key: 'levy', label: '再エネ賦課金', pick: b => b.renewableLevy },
    { key: 'rounding', label: '円未満の端数処理', pick: roundingResidual }
  ];
  return rows.map(r => {
    const currentYen = r.pick(current);
    const candidateYen = r.pick(candidate);
    return {
      key: r.key,
      label: r.label,
      currentYen,
      candidateYen,
      differenceYen: currentYen.minus(candidateYen)
    };
  });
}

/**
 * 電力量料金の行を突き合わせる。
 *
 * ラベルが一致する行だけを対象にする。時間帯の振り替えが入るシナリオ
 * （従量電灯 → 夜トクなど）は行の意味がそもそも違うので比較しない。
 */
function linesOf(current: MonthlyBill, candidate: MonthlyBill): LineComparison[] {
  const currentLabels = current.lines.map(l => l.label);
  const candidateLabels = candidate.lines.map(l => l.label);
  const sameShape =
    currentLabels.length === candidateLabels.length &&
    currentLabels.every((label, i) => label === candidateLabels[i]);
  if (!sameShape) return [];

  return current.lines.map((line, i) => {
    const other = candidate.lines[i];
    const sameQuantity =
      line.quantity !== null && other.quantity !== null && line.quantity.equals(other.quantity);
    const unitPriceDifference =
      line.unitPrice !== null && other.unitPrice !== null
        ? line.unitPrice.minus(other.unitPrice)
        : null;
    return {
      label: line.label,
      quantity: sameQuantity ? line.quantity : null,
      currentUnitPrice: line.unitPrice,
      candidateUnitPrice: other.unitPrice,
      unitPriceDifference,
      differenceYen: line.amount.minus(other.amount)
    };
  });
}

function yen(amount: Decimal): string {
  // 請求額は切り捨てだが、ここは「差」なので四捨五入する。
  // 切り捨てにすると、文章の 435円 と内訳表の 436円 が食い違う
  const rounded = amount.abs().toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return `${rounded.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}円`;
}

function unit(amount: Decimal): string {
  return `${amount.abs().toDecimalPlaces(2).toString()}円/kWh`;
}

/**
 * 差の大きい順に説明文を作る。
 *
 * 1円未満の差は文章にしない。「基本料金が0円安い」は情報ではないうえ、
 * 端数処理の話がお客様の前で出ると説明が長くなる。
 */
function highlightsOf(parts: ExplanationPart[], lines: LineComparison[]): string[] {
  const meaningful = parts
    .filter(p => p.key !== 'rounding' && p.differenceYen.abs().greaterThanOrEqualTo(1))
    .sort((a, b) => b.differenceYen.abs().comparedTo(a.differenceYen.abs()));

  const out: string[] = [];
  for (const part of meaningful.slice(0, 3)) {
    const cheaper = part.differenceYen.greaterThan(0);
    const direction = cheaper ? '安く' : '高く';
    if (part.key === 'energy') {
      // どの段階が効いているかまで言えるときは添える
      const biggest = lines
        .filter(l => l.unitPriceDifference !== null && !l.unitPriceDifference.isZero())
        .sort((a, b) => b.differenceYen.abs().comparedTo(a.differenceYen.abs()))[0];
      if (biggest && biggest.differenceYen.abs().greaterThanOrEqualTo(1)) {
        const gap = biggest.unitPriceDifference!;
        out.push(
          `電力量料金が月 ${yen(part.differenceYen)} ${direction}なります` +
            `（${biggest.label}の単価が ${unit(gap)} ${gap.greaterThan(0) ? '安い' : '高い'}）`
        );
        continue;
      }
    }
    out.push(`${part.label}が月 ${yen(part.differenceYen)} ${direction}なります`);
  }
  return out;
}

export function explainDifference(current: MonthlyBill, candidate: MonthlyBill): Explanation {
  const totalDifferenceYen = current.total.minus(candidate.total);

  // 最低月額料金で請求額を置き換えた月は、内訳が請求額の内訳になっていない
  if (current.minimumMonthlyApplied || candidate.minimumMonthlyApplied) {
    return {
      comparable: false,
      reason:
        '最低月額料金が適用されているため、内訳ごとの比較はできません（請求額は使用量にかかわらず一定です）',
      parts: [],
      lines: [],
      totalDifferenceYen,
      highlights: []
    };
  }

  const parts = partsOf(current, candidate);
  const lines = linesOf(current, candidate);
  return {
    comparable: true,
    reason: null,
    parts,
    lines,
    totalDifferenceYen,
    highlights: highlightsOf(parts, lines)
  };
}

/** 内訳の合計が総額の差と一致するか。呼び出し側の検算用 */
export function partsSum(parts: ExplanationPart[]): Decimal {
  return parts.reduce((a, p) => a.plus(p.differenceYen), ZERO);
}
