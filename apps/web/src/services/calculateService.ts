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
  allocateFromFamilyTime,
  estimateUsageFromBill,
  explainDifference,
  distributeAnnualUsage
} from '@ja-denki-simulator/calc-core'
import { ComparisonScenario, SCENARIOS, findScenario, needsCalendar, planForPeriod } from '../data/rates'
import { DEMAND_PROFILE } from '../data/demandProfile'

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

/**
 * 差額がどこから来ているか。生成AIを使わず、計算の内訳の引き算で作る。
 *
 * 表示する差は円単位に丸め、丸めで出た端数は「その他」の行に集める。
 * こうしないと、画面に並んだ数字を足しても月額の差にならない。
 * 合わない表は営業の場で「計算が合わない」と言われる材料にしかならない。
 */
export interface DifferenceBreakdown {
  /** どの費目か。「その他」は key を持たない。台本の組み立てに使う */
  key: 'base' | 'energy' | 'discount' | 'fuel' | 'levy' | 'rounding' | null
  label: string
  /** 「その他」の行は個別の金額を持たない */
  currentYen: number | null
  candidateYen: number | null
  differenceYen: number
}

export interface DifferenceExplanation {
  planId: string
  planName: string
  comparable: boolean
  reason: string | null
  /** 差の大きい順の説明文。多くても3件 */
  highlights: string[]
  /** 差が1円以上ある構成要素だけ */
  parts: DifferenceBreakdown[]
  totalDifferenceYen: number
}

export interface ComparisonView {
  scenarioId: string
  /** 検針月（燃料費調整額・再エネ賦課金がこの月のもの） */
  ratePeriodLabel: string
  /** 単価そのものの適用開始。検針月とは別に動く */
  unitPriceEffectiveLabel: string
  /** 検針月が単価の適用開始より前か。過去月の試算で起きる */
  periodPrecedesUnitPrices: boolean
  totalKwh: number
  current: PlanResult
  candidates: PlanResult[]
  recommended: PlanResult
  savingsPercent: number
  annualSavingsYen: number
  firstYearSavingsYen: number
  gasSetDiscountApplied: boolean
  firstYearSpecialDiscountYen: number
  /** おすすめプランとの差額の内訳 */
  explanation: DifferenceExplanation | null
  sources: string[]
}

export type CalculationOutcome =
  | { status: 'ok'; view: ComparisonView }
  | { status: 'unsupported'; reason: string; nextSteps: string[] }

export { SCENARIOS, findScenario, needsCalendar }
export type { ComparisonScenario }

/**
 * 検針月の選択肢。**シナリオごとに変える必要がある。**
 *
 * 燃料費調整額は事業者ごとに公表時期がずれる。中国電力系が 2026-09 まで
 * 出ていても auでんき は 2026-08 までしか出ていない、といったことが起きる。
 * 全社共通の一覧を出すと、選べるのに計算できない月が混ざる。
 */
export function periodOptionsFor(scenario: ComparisonScenario): RatePeriod[] {
  // JAでんき側は事業者を問わず中国電力エリアの燃調を使う（billOf 参照）ので、
  // 現行プラン側だけで絞ると JA 候補が計算できない月を出してしまう。
  // 両方そろっている月に限る
  const key = (p: RatePeriod) => `${p.year}-${p.month}`
  const ja = new Set(availablePeriods('chugoku').map(key))
  return availablePeriods(scenario.fuelProvider).filter(p => ja.has(key(p)))
}

export const DEFAULT_RATE_PERIOD = DEFAULT_PERIOD

/**
 * 画面に出す割引の条件。金額をラベルに直書きすると改定時に計算とずれる。
 * セット割は①I20、電化住宅割はプラン定義（④結果シート H15）が正。
 */
export const GAS_SET_DISCOUNT_YEN = GAS_SET_DISCOUNT_MONTHLY.toNumber()

/**
 * 選択中のシナリオの電化住宅割。プランごとに条件が違いうるので、
 * 最初に見つかった1件で固定せずシナリオから引く
 */
export function allElectricTermsOf(
  scenario: ComparisonScenario
): { ratePercent: number; capYen: number } | null {
  const plan = scenario.current
  const terms = 'allElectricDiscount' in plan ? plan.allElectricDiscount : null
  return terms
    ? { ratePercent: terms.rate.times(100).toNumber(), capYen: terms.capYen.toNumber() }
    : null
}

export interface CalculateOptions {
  period?: RatePeriod
  gasSetDiscount?: boolean
}

/**
 * 1年ぶんの見積もり方。
 *
 * flat     … 検針票の使用量が毎月そのまま続くとみなす
 * seasonal … 検針票の月を出発点に、季節ごとの使われ方で増減させる
 */
export type AnnualMethod = 'flat' | 'seasonal'

export const DEFAULT_ANNUAL_METHOD: AnnualMethod = 'flat'

/** 夏季単価が適用される月（低圧電力・時間帯別プランの季節区分） */
export function isSummerMonth(month: number): boolean {
  return month >= 7 && month <= 9
}

function billOf(
  basePlan: RatePlan,
  usage: UsageInput,
  scenario: ComparisonScenario,
  period: RatePeriod
): { ok: true; bill: MonthlyBill } | { ok: false; reason: string; nextSteps: string[] } {
  // 単価は改定で変わる。検針月に適用されていた版で計算する
  const plan = planForPeriod(basePlan, period)
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

/**
 * 単価の適用開始と検針月の関係を出す。
 *
 * 検針月のセレクタは 2025-01 まで遡れるが、これは元資料の燃調テーブルが
 * 年×月で 2024〜2034 を持っているため（①「基本項目」H5:K25）。
 * **単価そのものは1版しか無い。** 過去月を選んでも動くのは燃調と賦課金だけなので、
 * 画面と印刷物ではそれが分かる書き方にする。
 */
function unitPriceEffectiveness(
  sources: Array<{ effectiveFrom: string }>,
  period: RatePeriod
): { label: string; precedes: boolean } {
  const months = sources
    .map(s => s.effectiveFrom)
    .filter(v => /^\d{4}-\d{2}$/.test(v))
    .sort()
  const latest = months[months.length - 1]
  if (!latest) return { label: '不明', precedes: false }
  const [year, month] = latest.split('-').map(Number)
  const asNumber = (y: number, m: number) => y * 12 + m
  return {
    label: `${year}年${month}月適用`,
    precedes: asNumber(period.year, period.month) < asNumber(year, month)
  }
}

/**
 * 画面に出す内訳。1円未満の差の行は落とし、丸めと合わせて出た端数は
 * 「その他」の1行にまとめる。**表示した差の合計は月額の差と必ず一致する。**
 */
function breakdownOf(explained: {
  parts: Array<{
    key: 'base' | 'energy' | 'discount' | 'fuel' | 'levy' | 'rounding'
    label: string
    currentYen: { toNumber(): number }
    candidateYen: { toNumber(): number }
    differenceYen: { toNumber(): number }
  }>
  totalDifferenceYen: { toNumber(): number }
}): DifferenceBreakdown[] {
  const total = explained.totalDifferenceYen.toNumber()
  const rows: DifferenceBreakdown[] = explained.parts
    .filter(p => Math.abs(p.differenceYen.toNumber()) >= 1)
    .map(p => ({
      key: p.key,
      label: p.label,
      currentYen: p.currentYen.toNumber(),
      candidateYen: p.candidateYen.toNumber(),
      differenceYen: Math.round(p.differenceYen.toNumber())
    }))
  const other = total - rows.reduce((a, r) => a + r.differenceYen, 0)
  if (other !== 0) {
    rows.push({
      key: null,
      label: 'その他（1円未満の差・端数処理）',
      currentYen: null,
      candidateYen: null,
      differenceYen: other
    })
  }
  return rows
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

  // 単価は1版しか持っていない（26年7月適用）。月を変えて動くのは
  // 燃料費調整額と再エネ賦課金だけ。「◯年◯月適用の単価」と書くと嘘になる
  const effective = unitPriceEffectiveness(
    [scenario.current, ...scenario.candidates]
      .map(p => planForPeriod(p, period))
      .flatMap(p => p.sources),
    period
  )

  const gasSetDiscountApplied = options.gasSetDiscount === true
  const discounts: DiscountTerms = {
    gasSetDiscountMonthly: gasSetDiscountApplied ? GAS_SET_DISCOUNT_MONTHLY : new Decimal('0'),
    firstYearSpecialDiscount: FIRST_YEAR_SPECIAL_DISCOUNT
  }

  const result = comparator.compare(currentBill.bill, candidateBills, discounts)
  const byId = new Map(candidateBills.map(b => [b.planId, b]))

  // 「なぜ差が出るのか」をおすすめプランについて出す
  const recommendedBill = byId.get(result.recommended.planId)
  const explained = recommendedBill
    ? explainDifference(currentBill.bill, recommendedBill)
    : null
  const explanation: DifferenceExplanation | null = explained
    ? {
        planId: result.recommended.planId,
        planName: result.recommended.planName,
        comparable: explained.comparable,
        reason: explained.reason,
        highlights: explained.highlights,
        parts: breakdownOf(explained),
        totalDifferenceYen: explained.totalDifferenceYen.toNumber()
      }
    : null
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
    .map(p => planForPeriod(p, period))
    .flatMap(p => p.sources)
    .map(s => `${s.document} ${s.locator}`)

  return {
    status: 'ok',
    view: {
      scenarioId,
      ratePeriodLabel: `${period.year}年${period.month}月`,
      unitPriceEffectiveLabel: effective.label,
      periodPrecedesUnitPrices: effective.precedes,
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
      explanation,
      sources: Array.from(new Set(sources))
    }
  }
}

/** 振替後の4区分は、元の総使用量をそのまま分け直したものでなければならない */
const ALLOCATION_TOLERANCE = new Decimal('0.01')

/**
 * 按分の結果が使える形になっているか確かめる。
 *
 * ④の按分式には元資料の側に2つの欠陥があり、どちらも黙って請求額をずらす。
 *
 * **負の使用量**: MAX(...,0) が無いため、昼夜の偏りが極端だと負になる
 * （'ファミリーⅡ結果' W10 = U10 - U12。U12 は補正項の半分）。
 *
 * **使用量の欠落**: デイタイムが夏季・その他季とも 0 のとき、季節按分の割合が
 * 両方 0 になり（S8 = IF(Q8=0,0,Q8/Q10)）、ファミリータイムの半分を含む
 * デイタイム分がまるごと消える。実測で 700kWh の入力が 595kWh になった。
 * **JAでんき側だけが安く出るため、削減額が過大に表示される。**
 *
 * どちらも 0 に丸めたり補ったりしない。元資料に無い処理を足すことになるうえ、
 * 4区分の合計が総使用量と合わなくなる。計算不可として返す（ルール8）。
 *
 * 個別の症状ではなく「合計が保たれているか」を見ているのは、
 * 按分式の欠陥をこの先も取りこぼさないため。
 */
function checkAllocation(
  bands: { daySummer: Decimal; dayOther: Decimal; night: Decimal; holiday: Decimal },
  expectedTotal: Decimal
): { ok: true } | { ok: false; reason: string; nextSteps: string[] } {
  // NaN は lessThan() も greaterThan() も false を返すため、
  // 有限かどうかを先に見ないと ￥NaN のまま画面に出る。
  // 負の判定に isNegative() を使わないのは、**負のゼロで true になる**ため。
  // 端数の引き算で -0 になるだけの正当な検針票まで弾いてしまう
  const unusable =
    Object.values(bands).some(v => !v.isFinite() || v.lessThan(0)) ||
    Object.values(bands)
      .reduce((a, b) => a.plus(b), new Decimal('0'))
      .minus(expectedTotal)
      .abs()
      .greaterThan(ALLOCATION_TOLERANCE)

  if (!unusable) return { ok: true }
  return {
    ok: false,
    reason: 'ご入力の時間帯の偏りが大きく、夜トクプランの時間帯への振り替えを試算できません',
    nextSteps: [
      '各時間帯のご使用量が検針票どおりか確認してください',
      '「休日の電気の使い方」の選択を変えると試算できる場合があります',
      'それでも試算できない場合は、お手数ですが営業担当にお問い合わせください'
    ]
  }
}

/**
 * 振替後の使用量を組み立てる。
 *
 * 時間帯の区分は入れ替わるが、**使用量以外の条件は乗り換え先にも引き継ぐ**。
 * 一から組み立て直すと、候補プランが新しい割引を持った瞬間に黙って落ちる。
 * 一方で familyTime / economyNight をそのまま持ち越すと、候補が
 * ファミリー系だった場合に振替前の区分で計算してしまうので渡さない。
 */
function candidateUsageOf(
  usage: UsageInput,
  contractKw: number | undefined,
  bands: Record<string, Decimal>
): UsageInput {
  return {
    contractKw,
    tou: bands,
    allElectricDiscount: usage.allElectricDiscount
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
    return {
      ok: true,
      usage: candidateUsageOf(usage, usage.contractKw, {
        night: new Decimal(usage.totalKwh ?? 0)
      })
    }
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

  /**
   * 乗り換え先の契約電力。ファミリー系・時間帯別電灯は契約容量(kVA)で入力するが、
   * **元資料は同じ数値をそのまま夜トク側の契約電力(kW)に使っている。**
   *
   *   ④入力シート B12「契約電力」= 6      ← 片方しか入力欄が無い
   *   ④'ファミリーⅡ結果' E6 = 入力シート!I12
   *                      G8 = IF(E6>10, E6-10, 0)
   *                      K24 = G8            ← 夜トク側の10kW超過分
   *
   * kVA と kW を等価とみなす根拠は元資料に書かれていないが、換算せずに
   * そのまま渡すのが試算表の挙動。ここで独自に換算すると請求額が元資料とずれる。
   * ASSUMPTIONS.md「契約容量(kVA)をそのまま契約電力(kW)として渡している」参照。
   */
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
    const check = checkAllocation(
      bands,
      new Decimal(f.daySummer ?? 0).plus(f.dayOther ?? 0).plus(f.family ?? 0).plus(f.night ?? 0)
    )
    if (!check.ok) return check
    // Decimal のまま渡す。number に落とすと丸め誤差が入り、
    // 賦課金の切り捨てが1円ずれる（CLAUDE.md ルール2）
    return { ok: true, usage: candidateUsageOf(usage, contractKw, bands) }
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
  const check = checkAllocation(bands, new Decimal(e.dayKwh).plus(e.nightKwh))
  if (!check.ok) return check
  return { ok: true, usage: candidateUsageOf(usage, contractKw, bands) }
}

export function formatCurrency(amountYen: number): string {
  return formatDecimalCurrency(new Decimal(amountYen))
}

export function formatPercentage(percent: number, decimalPlaces: number = 1): string {
  return formatDecimalPercentage(new Decimal(percent), decimalPlaces)
}

/* ─────────────────────────────────────────────────────────────
   年間の試算

   他社のシミュレーターと同じく「年間でいくら変わるか」を主役にする。
   ただし月額を12倍しただけの数字は年額として正しくない。
   燃料費調整額は毎月改定され、月によって 3円/kWh 以上動くためである。

   収録済みの12か月ぶんの単価でそれぞれ計算し、積み上げる。
   使用量は毎月同じと仮定する（季節変動は入力から知りようがない）。
   この仮定は画面にも印刷物にも明記する。
   ───────────────────────────────────────────────────────────── */

export interface AnnualMonth {
  year: number
  month: number
  label: string
  /** その月に使うとみなした量。flat では毎月おなじ */
  usageKwh: number | null
  currentYen: number
  candidateYen: number
  /** 現在 − 乗り換え後。プラスがおトク。ガスセット割は含めない */
  savingsYen: number
}

export interface AnnualView {
  /** rollup … 12か月それぞれの単価で積み上げた／times_twelve … 月額×12 */
  basis: 'rollup' | 'times_twelve'
  /** 実際に使った見積もり方。指定が使えなかったときは flat に落ちる */
  method: AnnualMethod
  /** 季節で増減させたときの、もとにした統計の説明。flat では null */
  profileNote: string | null
  planId: string
  planName: string
  rangeLabel: string
  months: AnnualMonth[]
  currentYen: number
  candidateYen: number
  /** 年間のおトク額。ガスセット割を含む */
  savingsYen: number
  gasSetDiscountYen: number
  firstYearSavingsYen: number
  /** 積み上げなかった理由。basis が times_twelve のときだけ入る */
  fallbackReason: string | null
}

const MONTHS_IN_YEAR = 12

/** period を最終月とする12か月。古い順 */
function monthsEndingAt(period: RatePeriod): RatePeriod[] {
  const out: RatePeriod[] = []
  for (let back = MONTHS_IN_YEAR - 1; back >= 0; back--) {
    const zeroBased = period.year * 12 + (period.month - 1) - back
    out.push({ year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 })
  }
  return out
}

/**
 * 年間の試算。
 *
 * 積み上げるのは **総使用量だけで決まるプラン**に限る。
 * 季節別単価や時間帯別のプランは、月が変われば夏季／その他季の分け方も
 * 検針期間の平日・休日数も変わるが、入力は1か月ぶんしかない。
 * 同じ内訳を12か月に当てると、7月の入力を1月の単価で計算するような
 * 数字を作ってしまう。推測になるので積み上げない（CLAUDE.md ルール8）。
 */
export function calculateAnnual(
  scenarioId: string,
  usage: UsageInput,
  planId: string,
  options: CalculateOptions & { method?: AnnualMethod } = {}
): AnnualView | null {
  const scenario = findScenario(scenarioId)
  if (!scenario) return null

  const period = options.period ?? DEFAULT_PERIOD
  const base = calculateComparison(scenarioId, usage, { period })
  if (base.status !== 'ok') return null

  const baseCandidate = base.view.candidates.find(c => c.planId === planId)
  if (!baseCandidate) return null

  const gasSetDiscountYen = options.gasSetDiscount === true
    ? GAS_SET_DISCOUNT_MONTHLY.times(MONTHS_IN_YEAR).toNumber()
    : 0

  const timesTwelve = (fallbackReason: string): AnnualView => {
    const currentYen = base.view.current.monthlyChargeYen * MONTHS_IN_YEAR
    const candidateYen = baseCandidate.monthlyChargeYen * MONTHS_IN_YEAR
    const savingsYen = currentYen - candidateYen + gasSetDiscountYen
    return {
      basis: 'times_twelve',
      method: 'flat',
      profileNote: null,
      planId,
      planName: baseCandidate.planName,
      rangeLabel: `${period.year}年${period.month}月の単価で12か月`,
      months: [],
      currentYen,
      candidateYen,
      savingsYen,
      gasSetDiscountYen,
      firstYearSavingsYen: savingsYen + FIRST_YEAR_SPECIAL_DISCOUNT.toNumber(),
      fallbackReason
    }
  }

  if (scenario.usageForm !== 'total') {
    return timesTwelve(
      '時間帯別・季節別のプランは、月ごとの内訳が検針票からしか分からないため、この月の試算を12倍しています'
    )
  }

  const available = new Set(periodOptionsFor(scenario).map(p => `${p.year}-${p.month}`))
  const span = monthsEndingAt(period)
  if (!span.every(p => available.has(`${p.year}-${p.month}`))) {
    return timesTwelve('12か月ぶんの燃料費調整額がまだ収録されていないため、この月の試算を12倍しています')
  }

  // 季節で増減させるのは、検針票に総使用量しか無いプランだけ。
  // 時間帯別のプランは、昼と夜の比まで季節で動くはずで、その比の根拠が無い
  // （CLAUDE.md ルール8）。ここは usageForm === 'total' が保証されている。
  const wantSeasonal = (options.method ?? DEFAULT_ANNUAL_METHOD) === 'seasonal'
  const baseUsageKwh = usage.totalKwh ?? 0
  const seasonalUsage = wantSeasonal
    ? distributeAnnualUsage(new Decimal(baseUsageKwh), period.month, DEMAND_PROFILE)
    : null

  const months: AnnualMonth[] = []
  for (const p of span) {
    const monthUsage: UsageInput = seasonalUsage
      ? { ...usage, totalKwh: seasonalUsage[p.month - 1].toNumber() }
      : usage
    const r = calculateComparison(scenarioId, monthUsage, { period: p })
    if (r.status !== 'ok') {
      return timesTwelve('一部の月が計算できないため、この月の試算を12倍しています')
    }
    const c = r.view.candidates.find(x => x.planId === planId)
    if (!c) return timesTwelve('一部の月でこのプランが計算できないため、この月の試算を12倍しています')
    months.push({
      year: p.year,
      month: p.month,
      label: `${p.month}月`,
      usageKwh: monthUsage.totalKwh ?? null,
      currentYen: r.view.current.monthlyChargeYen,
      candidateYen: c.monthlyChargeYen,
      savingsYen: r.view.current.monthlyChargeYen - c.monthlyChargeYen
    })
  }

  const currentYen = months.reduce((a, m) => a + m.currentYen, 0)
  const candidateYen = months.reduce((a, m) => a + m.candidateYen, 0)
  const savingsYen = currentYen - candidateYen + gasSetDiscountYen
  const first = span[0]
  const last = span[span.length - 1]

  return {
    basis: 'rollup',
    method: seasonalUsage ? 'seasonal' : 'flat',
    profileNote: seasonalUsage ? DEMAND_PROFILE.description : null,
    planId,
    planName: baseCandidate.planName,
    rangeLabel: `${first.year}年${first.month}月〜${last.year}年${last.month}月`,
    months,
    currentYen,
    candidateYen,
    savingsYen,
    gasSetDiscountYen,
    firstYearSavingsYen: savingsYen + FIRST_YEAR_SPECIAL_DISCOUNT.toNumber(),
    fallbackReason: null
  }
}

/* ─────────────────────────────────────────────────────────────
   かんたん試算（電気料金から使用量を逆算する）

   検針票が手元にないお客様向け。1か月の電気料金だけから使用量を戻し、
   あとは通常と同じ計算にかける。逆算は近似ではなく、実際の計算式を
   そのまま逆に引いている（CLAUDE.md ルール1）。
   ───────────────────────────────────────────────────────────── */

export interface UsageEstimateView {
  kwh: number
  rangeKwh: { min: number; max: number }
  /** 逆算した使用量での請求額。入力額と数十円ずれることがある */
  billYen: number
  exact: boolean
}

export type EstimateOutcome =
  | { status: 'ok'; estimate: UsageEstimateView }
  | { status: 'unsupported'; reason: string; nextSteps: string[] }

/** かんたん試算に対応するシナリオ（総使用量だけで決まるもの） */
export function supportsSimpleEstimate(scenario: ComparisonScenario): boolean {
  return scenario.usageForm === 'total'
}

export function estimateUsage(
  scenarioId: string,
  billYen: number,
  options: { period?: RatePeriod; contract?: number } = {}
): EstimateOutcome {
  const scenario = findScenario(scenarioId)
  if (!scenario || !supportsSimpleEstimate(scenario)) {
    return {
      status: 'unsupported',
      reason: 'このご契約は電気料金からの逆算に対応していません',
      nextSteps: ['「くわしい試算」からご使用量を入力してください']
    }
  }

  const period = options.period ?? DEFAULT_PERIOD
  const plan = planForPeriod(scenario.current, period)
  const fuel = lookupFuelAdjustment(period, scenario.fuelProvider)
  const levy = lookupRenewableLevy(period)
  if (!fuel || !levy) {
    return {
      status: 'unsupported',
      reason: `${period.year}年${period.month}月の燃料費調整額・再エネ賦課金が元資料に収録されていません`,
      nextSteps: ['対象月を変更してください']
    }
  }

  const usage: UsageInput = {}
  if (scenario.contract === 'kw') usage.contractKw = options.contract
  if (scenario.contract === 'kva') usage.contractKva = options.contract

  const result = estimateUsageFromBill({
    targetYen: billYen,
    plan,
    usage,
    fuelAdjustment: fuel.value,
    renewableLevy: levy.value
  })
  return result.status === 'ok'
    ? { status: 'ok', estimate: result.estimate }
    : { status: 'unsupported', reason: result.reason, nextSteps: result.nextSteps }
}
