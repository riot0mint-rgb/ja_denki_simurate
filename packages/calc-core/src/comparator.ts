import { Decimal } from './decimal-config.js';
import { MonthlyBill } from './models.js';
import { roundDownToYen } from './rounding.js';

/**
 * 割引条件。JAでんき公式試算表
 * 「①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx」
 * シート「シミュレーション結果」の I20 / I25 に対応する。
 */
export interface DiscountTerms {
  /** ガスとでんきのセット割（円/月）。試算表 I20 = -110。適用外なら 0。 */
  gasSetDiscountMonthly: Decimal;
  /** 初年度のみの特別割引（円）。試算表 I25 = -3,000。 */
  firstYearSpecialDiscount: Decimal;
}

export interface PlanComparison {
  planId: string;
  planName: string;
  monthlyCharge: Decimal;
  /** 現行プランに対する月額削減額。正なら安くなる。 */
  monthlySavings: Decimal;
}

export interface ComparisonResult {
  currentPlanId: string;
  currentPlanName: string;
  currentMonthlyCharge: Decimal;
  candidates: PlanComparison[];
  /** 実際に最も安いプラン。分岐点の定数ではなく算出結果で決める。 */
  recommended: PlanComparison;
  /** 削減率（%）。現行が 0 円のときは 0 を返す。 */
  savingsPercent: Decimal;
  /** 年間削減額 = (月額削減額 + セット割) × 12 */
  annualSavings: Decimal;
  /** 初年度合計 = 年間削減額 + 初年度特別割引 */
  firstYearSavings: Decimal;
}

export class BillingComparator {
  /**
   * 現行プラン 1 件と乗り換え候補 N 件を比較する。
   *
   * 推奨プランは候補の中で請求額が最小のものを選ぶ。使用量の分岐点
   * （中国エリアでは 217kWh）を定数で持たないのは、単価改定のたびに
   * 分岐点が動き、定数と単価が乖離すると誤ったプランを推奨するため。
   */
  compare(
    current: { planId: string; planName: string; bill: MonthlyBill },
    candidates: Array<{ planId: string; planName: string; bill: MonthlyBill }>,
    discounts: DiscountTerms
  ): ComparisonResult {
    if (candidates.length === 0) {
      throw new Error('比較対象のプランが指定されていません');
    }

    const currentCharge = current.bill.total;

    const compared: PlanComparison[] = candidates.map(c => ({
      planId: c.planId,
      planName: c.planName,
      monthlyCharge: c.bill.total,
      monthlySavings: currentCharge.minus(c.bill.total)
    }));

    const recommended = compared.reduce((best, c) =>
      c.monthlyCharge.lessThan(best.monthlyCharge) ? c : best
    );

    const savingsPercent = currentCharge.isZero()
      ? new Decimal('0')
      : recommended.monthlySavings.dividedBy(currentCharge).times(100);

    const annualSavings = roundDownToYen(
      recommended.monthlySavings.plus(discounts.gasSetDiscountMonthly).times(12)
    );
    const firstYearSavings = annualSavings.plus(discounts.firstYearSpecialDiscount);

    return {
      currentPlanId: current.planId,
      currentPlanName: current.planName,
      currentMonthlyCharge: currentCharge,
      candidates: compared,
      recommended,
      savingsPercent,
      annualSavings,
      firstYearSavings
    };
  }
}

export const comparator = new BillingComparator();
