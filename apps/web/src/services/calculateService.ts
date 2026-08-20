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
  lookupRenewableLevy,
  allocateFromEconomyNight,
  allocateFromFamilyTime
} from '@ja-denki-simulator/calc-core'
import { ComparisonScenario, SCENARIOS, findScenario, needsCalendar } from '../data/rates'

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

export { SCENARIOS, findScenario, needsCalendar }
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

  const derived = deriveCandidateUsage(scenario, usage, period.month)
  if (!derived.ok) {
    return { status: 'unsupported', reason: derived.reason, nextSteps: derived.nextSteps }
  }
  const candidateUsage = derived.usage

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

/**
 * 乗り換え先に渡す使用量を作る。旧プランと夜トクプランでは時間帯の区分が
 * 違うため、④の各結果シートと同じ式で振り替える。
 */
function deriveCandidateUsage(
  scenario: ComparisonScenario,
  usage: UsageInput,
  month: number
): { ok: true; usage: UsageInput } | { ok: false; reason: string; nextSteps: string[] } {
  if (scenario.candidateUsage === 'same') return { ok: true, usage }

  // ⑥は深夜電力Bの使用量をすべて夜トクのナイトタイムとして扱う
  if (scenario.candidateUsage === 'all_night') {
    return { ok: true, usage: { ...usage, tou: { night: usage.totalKwh ?? 0 } } }
  }

  const calendar = usage.calendar
  if (!calendar) {
    return {
      ok: false,
      reason: '検針期間の日数が入力されていません',
      nextSteps: [
        '検針票の検針期間（開始日と終了日）を入力してください',
        '夜トクプランには「ホリデータイム」の区分があるため、平日と休日の日数が必要です'
      ]
    }
  }

  const contractKw = usage.contractKva ?? usage.contractKw

  if (scenario.candidateUsage === 'from_family') {
    const f = usage.familyTime
    if (!f) {
      return {
        ok: false,
        reason: '時間帯別のご使用量が入力されていません',
        nextSteps: ['検針票の各時間帯のご使用量を入力してください']
      }
    }
    const bands = allocateFromFamilyTime(
      {
        daySummerKwh: new Decimal(f.daySummer ?? 0),
        dayOtherKwh: new Decimal(f.dayOther ?? 0),
        familyKwh: new Decimal(f.family ?? 0),
        nightKwh: new Decimal(f.night ?? 0)
      },
      calendar
    ).bands
    return {
      ok: true,
      usage: {
        contractKw,
        tou: {
          daySummer: bands.daySummer.toNumber(),
          dayOther: bands.dayOther.toNumber(),
          night: bands.night.toNumber(),
          holiday: bands.holiday.toNumber()
        }
      }
    }
  }

  const e = usage.economyNight
  if (!e) {
    return {
      ok: false,
      reason: '昼間・夜間のご使用量が入力されていません',
      nextSteps: ['検針票の昼間時間・夜間時間のご使用量を入力してください']
    }
  }
  const bands = allocateFromEconomyNight(
    { dayKwh: new Decimal(e.dayKwh), nightKwh: new Decimal(e.nightKwh) },
    calendar,
    month
  ).bands
  return {
    ok: true,
    usage: {
      contractKw,
      tou: {
        daySummer: bands.daySummer.toNumber(),
        dayOther: bands.dayOther.toNumber(),
        night: bands.night.toNumber(),
        holiday: bands.holiday.toNumber()
      }
    }
  }
}

export function formatCurrency(amountYen: number): string {
  return formatDecimalCurrency(new Decimal(amountYen))
}

export function formatPercentage(percent: number, decimalPlaces: number = 1): string {
  return formatDecimalPercentage(new Decimal(percent), decimalPlaces)
}
