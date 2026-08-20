import {
  BillingCalculator,
  BillingComparator,
  Decimal,
  DiscountTerms,
  MonthlyBill,
  RatePeriod,
  RatePlan,
  UsageInput,
  availablePeriods,
  DEFAULT_PERIOD,
  formatCurrency as formatDecimalCurrency,
  formatPercentage as formatDecimalPercentage,
  lookupFuelAdjustment,
  lookupRenewableLevy
} from '@ja-denki-simulator/calc-core'
import { ComparisonScenario, SCENARIOS, findScenario } from '../data/rates'

const calculator = new BillingCalculator()
const comparator = new BillingComparator()

/** 公式試算表「シミュレーション結果」I20 / I25 */
const FIRST_YEAR_SPECIAL_DISCOUNT = new Decimal('3000')
const GAS_SET_DISCOUNT_MONTHLY = new Decimal('110')

export interface PlanResult {
  planId: string
  planName: string
  monthlyChargeYen: number
  monthlySavingsYen: number
  formula: string
  notes: string[]
}

export interface ComparisonView {
  scenarioId: string
  ratePeriodLabel: string
  totalKwh: number
  current: PlanResult
  candidates: PlanResult[]
  recommended: PlanResult
  savingsPercent: number
  annualSavingsYen: number
  firstYearSavingsYen: number
  gasSetDiscountApplied: boolean
  firstYearSpecialDiscountYen: number
  sources: string[]
}

export type CalculationOutcome =
  | { status: 'ok'; view: ComparisonView }
  | { status: 'unsupported'; reason: string; nextSteps: string[] }

export { SCENARIOS, findScenario }
export type { ComparisonScenario }

export const PERIOD_OPTIONS = availablePeriods('chugoku')
export const DEFAULT_RATE_PERIOD = DEFAULT_PERIOD

export interface CalculateOptions {
  period?: RatePeriod
  gasSetDiscount?: boolean
}

/** 夏季単価が適用される月（低圧電力・時間帯別プランの季節区分） */
export function isSummerMonth(month: number): boolean {
  return month >= 7 && month <= 9
}

function billOf(
  plan: RatePlan,
  usage: UsageInput,
  scenario: ComparisonScenario,
  period: RatePeriod
): { ok: true; bill: MonthlyBill } | { ok: false; reason: string; nextSteps: string[] } {
  // JAでんきは中国電力エリアの燃調を使う。他社側だけが独自単価を持つ場合がある。
  const provider = plan.side === 'ja' ? 'chugoku' : scenario.fuelProvider
  const fuel = lookupFuelAdjustment(period, provider)
  const levy = lookupRenewableLevy(period)
  if (!fuel || !levy) {
    return {
      ok: false,
      reason: `${period.year}年${period.month}月の燃料費調整額・再エネ賦課金が元資料に収録されていません`,
      nextSteps: [
        '対象月を変更してください',
        '最新の試算表が公開されたら料金マスターを更新する必要があります'
      ]
    }
  }
  const result = calculator.calculate({
    usage,
    plan,
    fuelAdjustment: fuel.value,
    renewableLevy: levy.value
  })
  return result.status === 'ok'
    ? { ok: true, bill: result.bill }
    : { ok: false, reason: result.reason, nextSteps: result.nextSteps }
}

export function calculateComparison(
  scenarioId: string,
  usage: UsageInput,
  options: CalculateOptions = {}
): CalculationOutcome {
  const scenario = findScenario(scenarioId)
  if (!scenario) {
    // CLAUDE.md ルール8: 未対応プランを推測計算しない
    return {
      status: 'unsupported',
      reason: `「${scenarioId}」は現在自動計算に対応していません`,
      nextSteps: [
        '検針票に記載の契約種別をご確認ください',
        '対応プラン: ' + SCENARIOS.map(s => s.label).join(' / '),
        'それ以外のプランはお手数ですが営業担当にお問い合わせください'
      ]
    }
  }

  const period = options.period ?? DEFAULT_PERIOD
  const currentBill = billOf(scenario.current, usage, scenario, period)
  if (!currentBill.ok) {
    return { status: 'unsupported', reason: currentBill.reason, nextSteps: currentBill.nextSteps }
  }

  // ⑥は深夜電力Bの使用量をすべて夜トクのナイトタイムとして扱う
  const candidateUsage: UsageInput =
    scenario.candidateUsage === 'all_night'
      ? { ...usage, tou: { night: usage.totalKwh ?? 0 } }
      : usage

  const candidateBills: MonthlyBill[] = []
  for (const plan of scenario.candidates) {
    const b = billOf(plan, candidateUsage, scenario, period)
    if (!b.ok) return { status: 'unsupported', reason: b.reason, nextSteps: b.nextSteps }
    candidateBills.push(b.bill)
  }

  const gasSetDiscountApplied = options.gasSetDiscount === true
  const discounts: DiscountTerms = {
    gasSetDiscountMonthly: gasSetDiscountApplied ? GAS_SET_DISCOUNT_MONTHLY : new Decimal('0'),
    firstYearSpecialDiscount: FIRST_YEAR_SPECIAL_DISCOUNT
  }

  const result = comparator.compare(currentBill.bill, candidateBills, discounts)
  const byId = new Map(candidateBills.map(b => [b.planId, b]))
  const toPlanResult = (c: (typeof result.candidates)[number]): PlanResult => {
    const bill = byId.get(c.planId)
    return {
      planId: c.planId,
      planName: c.planName,
      monthlyChargeYen: c.monthlyCharge.toNumber(),
      monthlySavingsYen: c.monthlySavings.toNumber(),
      formula: bill?.formula ?? '',
      notes: bill?.notes ?? []
    }
  }

  const sources = [scenario.current, ...scenario.candidates]
    .flatMap(p => p.sources)
    .map(s => `${s.document} ${s.locator}`)

  return {
    status: 'ok',
    view: {
      scenarioId,
      ratePeriodLabel: `${period.year}年${period.month}月適用`,
      totalKwh: currentBill.bill.totalKwh.toNumber(),
      current: {
        planId: currentBill.bill.planId,
        planName: currentBill.bill.planName,
        monthlyChargeYen: currentBill.bill.total.toNumber(),
        monthlySavingsYen: 0,
        formula: currentBill.bill.formula,
        notes: currentBill.bill.notes
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
