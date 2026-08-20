import {
  BillingCalculator,
  BillingComparator,
  Decimal,
  DiscountTerms,
  MonthlyBill,
  RatePlan,
  formatCurrency as formatDecimalCurrency,
  formatPercentage as formatDecimalPercentage
} from '@ja-denki-simulator/calc-core'
import {
  CURRENT_PLANS,
  JA_DENKI_PLANS,
  RATE_PERIOD,
  fuelAdjustment2026_04,
  renewableLevy2026_04
} from '../data/rates'

const calculator = new BillingCalculator()
const comparator = new BillingComparator()

/**
 * 割引条件。公式試算表 シート「シミュレーション結果」の I20 / I25。
 * セット割はガス契約がある世帯のみが対象のため、既定では適用しない。
 */
const FIRST_YEAR_SPECIAL_DISCOUNT = new Decimal('3000')
const GAS_SET_DISCOUNT_MONTHLY = new Decimal('110')

export interface PlanResult {
  planId: string
  planName: string
  monthlyChargeYen: number
  /** 現行プランに対する月額削減額。正なら安くなる。 */
  monthlySavingsYen: number
  /** 計算過程 */
  formula: string
}

export interface ComparisonView {
  usageKwh: number
  ratePeriod: string
  current: PlanResult
  candidates: PlanResult[]
  recommended: PlanResult
  savingsPercent: number
  annualSavingsYen: number
  firstYearSavingsYen: number
  gasSetDiscountApplied: boolean
  firstYearSpecialDiscountYen: number
  /** 単価の出典（画面に表示して監査可能にする） */
  sources: string[]
}

export type CalculationOutcome =
  | { status: 'ok'; view: ComparisonView }
  | { status: 'unsupported'; reason: string; nextSteps: string[] }

export const CURRENT_PLAN_OPTIONS = CURRENT_PLANS.map(p => ({
  planId: p.planId,
  planName: p.planName
}))

function billOf(plan: RatePlan, usageKwh: number): MonthlyBill | { reason: string; nextSteps: string[] } {
  const result = calculator.calculate({
    usageKwh,
    plan,
    fuelAdjustment: fuelAdjustment2026_04,
    renewableLevy: renewableLevy2026_04
  })
  return result.status === 'ok' ? result.bill : { reason: result.reason, nextSteps: result.nextSteps }
}

function isBill(v: MonthlyBill | { reason: string }): v is MonthlyBill {
  return (v as MonthlyBill).total !== undefined
}

export function calculateComparison(
  usageKwh: number,
  currentPlanId: string,
  options: { gasSetDiscount?: boolean } = {}
): CalculationOutcome {
  const currentPlan = CURRENT_PLANS.find(p => p.planId === currentPlanId)
  if (!currentPlan) {
    // CLAUDE.md ルール8: 未対応プランを推測計算しない
    return {
      status: 'unsupported',
      reason: `「${currentPlanId}」は現在自動計算に対応していません`,
      nextSteps: [
        '検針票に記載の契約種別をご確認ください',
        '対応プラン: ' + CURRENT_PLANS.map(p => p.planName).join(' / '),
        'それ以外のプランはお手数ですが営業担当にお問い合わせください'
      ]
    }
  }

  const currentBill = billOf(currentPlan, usageKwh)
  if (!isBill(currentBill)) {
    return { status: 'unsupported', reason: currentBill.reason, nextSteps: currentBill.nextSteps }
  }

  const candidateBills: Array<{ planId: string; planName: string; bill: MonthlyBill }> = []
  for (const plan of JA_DENKI_PLANS) {
    const bill = billOf(plan, usageKwh)
    if (!isBill(bill)) {
      return { status: 'unsupported', reason: bill.reason, nextSteps: bill.nextSteps }
    }
    candidateBills.push({ planId: plan.planId, planName: plan.planName, bill })
  }

  const gasSetDiscountApplied = options.gasSetDiscount === true
  const discounts: DiscountTerms = {
    gasSetDiscountMonthly: gasSetDiscountApplied ? GAS_SET_DISCOUNT_MONTHLY : new Decimal('0'),
    firstYearSpecialDiscount: FIRST_YEAR_SPECIAL_DISCOUNT
  }

  const result = comparator.compare(
    { planId: currentPlan.planId, planName: currentPlan.planName, bill: currentBill },
    candidateBills,
    discounts
  )

  const byId = new Map(candidateBills.map(c => [c.planId, c.bill]))
  const toPlanResult = (c: (typeof result.candidates)[number]): PlanResult => ({
    planId: c.planId,
    planName: c.planName,
    monthlyChargeYen: c.monthlyCharge.toNumber(),
    monthlySavingsYen: c.monthlySavings.toNumber(),
    formula: byId.get(c.planId)?.formula ?? ''
  })

  const sources = [currentPlan, ...JA_DENKI_PLANS]
    .flatMap(p => p.sources)
    .map(s => `${s.document} ${s.locator}`)

  return {
    status: 'ok',
    view: {
      usageKwh,
      ratePeriod: `${RATE_PERIOD.year}年${RATE_PERIOD.month}月適用`,
      current: {
        planId: currentPlan.planId,
        planName: currentPlan.planName,
        monthlyChargeYen: currentBill.total.toNumber(),
        monthlySavingsYen: 0,
        formula: currentBill.formula
      },
      candidates: result.candidates.map(toPlanResult),
      recommended: toPlanResult(result.recommended),
      savingsPercent: result.savingsPercent.toDecimalPlaces(1).toNumber(),
      annualSavingsYen: result.annualSavings.toNumber(),
      firstYearSavingsYen: result.firstYearSavings.toNumber(),
      gasSetDiscountApplied,
      firstYearSpecialDiscountYen: FIRST_YEAR_SPECIAL_DISCOUNT.toNumber(),
      sources: Array.from(new Set(sources))
    }
  }
}

export function formatCurrency(amountYen: number): string {
  return formatDecimalCurrency(new Decimal(amountYen))
}

export function formatPercentage(percent: number, decimalPlaces: number = 1): string {
  return formatDecimalPercentage(new Decimal(percent), decimalPlaces)
}
