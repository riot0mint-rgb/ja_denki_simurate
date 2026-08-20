import {
  CHUGOKU_ROUNDING,
  CapacityTieredPlan,
  Decimal,
  EconomyNightPlan,
  FamilyTimePlan,
  DemandFlatPlan,
  DemandSeasonalPlan,
  FlatRatePlan,
  RateSource,
  RatePlan,
  RoundingProfile,
  TieredMinimumPlan,
  TimeOfUsePlan
} from '@ja-denki-simulator/calc-core'

/**
 * 単価はすべて JAでんき公式試算表（26年7月適用版）からの転記。推測値は含まない。
 * CLAUDE.md ルール4に従い、各プランに元資料のファイル名・シート名・セル番地を保持する。
 *
 * 燃料費調整額・再エネ賦課金は月次で改定されるため、ここではなく
 * calc-core の monthlyRates.ts が年月で保持する。
 */

const DOC = {
  juryoA: '①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年7月適用.xlsx',
  juryoB: '②JAでんき試算表(VS中電_従量B)26年7月適用.xlsx',
  tou: '③JAでんき試算表(VS中電_電化Style・ナイトホリデー)26年7月適用.xlsx',
  family: '④JAでんき試算表(VS中電_ファミリー①②・時間帯別)26年7月適用.xlsx',
  lowVoltage: '⑤JAでんき試算表(VS中電_低圧電力)26年7月適用.xlsx',
  midnightB: '⑥JAでんき試算表(VS深夜電力B)26年7月適用.xlsx',
  auM: '☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx',
  auLow: '☆JAでんき試算表(VS auでんき_低圧電力)26年6月.xlsx'
} as const

function src(document: string, locator: string): RateSource {
  return {
    document,
    locator,
    effectiveFrom: '2026-07',
    verificationStatus: 'verified',
    verifiedAt: '2026-08-20'
  }
}

/** auでんきは従量料金合計と燃料費調整額を切り上げ、請求額を丸めない（明細 I13/I16/I20）。 */
const AU_ROUNDING: RoundingProfile = {
  energyTotal: 'up',
  fuelSubtotal: 'up',
  levySubtotal: 'down',
  finalTotal: 'none'
}

const MINIMUM_INCLUDED_KWH = 15

function tiers15(t1: string, t2: string, t3: string) {
  return [
    { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: new Decimal(t1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(t2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(t3) }
  ]
}

// ─────────────────────────────────────────────
// 従量電灯A系（最低料金 + 3段階）
// ─────────────────────────────────────────────

export const chugokuJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_juryo_a',
  planName: '中国電力 従量電灯A',
  side: 'other',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers15('32.75', '39.43', '41.55'),
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.juryoA, '基本項目!E8:E11（規制料金）')]
}

export const chugokuSmart: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_smart',
  planName: '中国電力 スマートコース',
  side: 'other',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers15('32.01', '39.43', '41.55'),
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.juryoA, '基本項目!E46:E49（自由料金）')]
}

export const chugokuSimple: FlatRatePlan = {
  structure: 'flat_rate',
  planId: 'chugoku_simple',
  planName: '中国電力 シンプルコース',
  side: 'other',
  unitPriceYenPerKwh: new Decimal('38.21'),
  minimumMonthlyThreshold: new Decimal('1844.7'),
  minimumMonthlyBill: new Decimal('1845'),
  rounding: CHUGOKU_ROUNDING,
  sources: [
    src(DOC.juryoA, '基本項目!E52:E55（自由料金）'),
    src(DOC.juryoA, "'シミュレーション結果明細 VSシンプル'!I20（最低月額料金の判定式）")
  ]
}

export const auMPlan: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'au_m_plan',
  planName: 'auでんき Mプラン',
  side: 'other',
  minimumCharge: new Decimal('759.67'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers15('32.74', '39.42', '41.54'),
  rounding: AU_ROUNDING,
  sources: [src(DOC.auM, "'ａｕ＿Ｍプラン料金早見表'!E5:E8")]
}

export const jaDenkiJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_a',
  planName: 'JAでんき 従量電灯A',
  side: 'ja',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers15('32.22', '38.04', '38.84'),
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.juryoA, '基本項目!E26:E29（規制料金）')]
}

export const jaDenkiJuryoS: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_s',
  planName: 'JAでんき 従量電灯S',
  side: 'ja',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers15('31.79', '39.43', '41.44'),
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.juryoA, '基本項目!E58:E61（自由料金）')]
}

// ─────────────────────────────────────────────
// 従量電灯B（契約kVA + 0kWhからの3段階）
// ─────────────────────────────────────────────

function tiers0(t1: string, t2: string, t3: string) {
  return [
    { tierNumber: 1, startKwh: 0, endKwh: 120, unitPriceYenPerKwh: new Decimal(t1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(t2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(t3) }
  ]
}

/** 従量電灯Bの再エネ賦課金は元資料に ROUNDDOWN がない（②明細 I15）。 */
const JURYO_B_ROUNDING: RoundingProfile = { ...CHUGOKU_ROUNDING, levySubtotal: 'none' }

export const chugokuJuryoB: CapacityTieredPlan = {
  structure: 'capacity_tiered',
  planId: 'chugoku_juryo_b',
  planName: '中国電力 従量電灯B',
  side: 'other',
  baseChargePerKva: new Decimal('447.97'),
  tiers: tiers0('30.06', '36.15', '38.02'),
  halveBaseWhenNoUsage: true,
  rounding: JURYO_B_ROUNDING,
  sources: [src(DOC.juryoB, '基本項目!E14:E17')]
}

export const jaDenkiJuryoB: CapacityTieredPlan = {
  structure: 'capacity_tiered',
  planId: 'ja_denki_juryo_b',
  planName: 'JAでんき 従量電灯B',
  side: 'ja',
  baseChargePerKva: new Decimal('447.97'),
  tiers: tiers0('30.06', '35.41', '36.71'),
  halveBaseWhenNoUsage: true,
  rounding: JURYO_B_ROUNDING,
  sources: [src(DOC.juryoB, '基本項目!E32:E35')]
}

// ─────────────────────────────────────────────
// 低圧電力（契約kW + 季節別単価）
// ─────────────────────────────────────────────

export const chugokuLowVoltage: DemandSeasonalPlan = {
  structure: 'demand_seasonal',
  planId: 'chugoku_low_voltage',
  planName: '中国電力 低圧電力',
  side: 'other',
  baseChargePerKw: new Decimal('1163.92'),
  summerUnitPriceYenPerKwh: new Decimal('26.80'),
  otherUnitPriceYenPerKwh: new Decimal('25.51'),
  halveBaseWhenNoUsage: true,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.lowVoltage, '基本項目!E20:E22')]
}

export const jaDenkiLowVoltage: DemandSeasonalPlan = {
  structure: 'demand_seasonal',
  planId: 'ja_denki_low_voltage',
  planName: 'JAでんき 低圧電力',
  side: 'ja',
  baseChargePerKw: new Decimal('1132.83'),
  summerUnitPriceYenPerKwh: new Decimal('26.80'),
  otherUnitPriceYenPerKwh: new Decimal('25.51'),
  halveBaseWhenNoUsage: true,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.lowVoltage, '基本項目!E38:E40')]
}

// ─────────────────────────────────────────────
// 時間帯別（電化Style / ナイトホリデー / 夜トクプラン）
// ─────────────────────────────────────────────

function touPrices(dayOther: string, daySummer: string, night: string, holiday: string) {
  return {
    dayOther: new Decimal(dayOther),
    daySummer: new Decimal(daySummer),
    night: new Decimal(night),
    holiday: new Decimal(holiday)
  }
}

export const chugokuDenkaStyle: TimeOfUsePlan = {
  structure: 'time_of_use',
  planId: 'chugoku_denka_style',
  planName: '中国電力 電化Style',
  side: 'other',
  baseChargeUpTo10Kw: new Decimal('2018.72'),
  baseChargePerKwOver10: new Decimal('480.37'),
  minimumMonthly: null,
  unitPrices: touPrices('44.40', '46.46', '30.35', '30.35'),
  halveBaseWhenNoUsage: true,
  allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.tou, '基本項目!E46:E51')]
}

/**
 * ナイトホリデーコースには契約電力ベースの基本料金が存在しない。
 * ③明細の 'シミュレーション結果明細 VSナイトホリデー'!J8:J10 が空欄なのは
 * Excel の作り漏れではなく、そこに入るべき数字が無いため（中国電力サービス約款）。
 * 代わりに最低月額料金 1,844.70 円/契約 が下限として働く。シンプルコースと同型。
 */
export const chugokuNightHoliday: TimeOfUsePlan = {
  structure: 'time_of_use',
  planId: 'chugoku_night_holiday',
  planName: '中国電力 ナイトホリデー',
  side: 'other',
  baseChargeUpTo10Kw: null,
  baseChargePerKwOver10: null,
  // 請求額 1,845 円は元資料に直接の記載がなく、シンプルコースの判定式
  // （①明細 VSシンプル I20: IF(I13+I16<1844.7, 1845, ...)）から同型と判断した推定。
  // ASSUMPTIONS.md「ナイトホリデーの最低月額料金」に記録。
  minimumMonthly: { threshold: new Decimal('1844.7'), bill: new Decimal('1845') },
  unitPrices: touPrices('46.98', '49.44', '34.65', '34.65'),
  halveBaseWhenNoUsage: true,
  allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING,
  sources: [
    src(DOC.tou, '基本項目!S62:S65（単価）'),
    src(DOC.juryoA, "'シミュレーション結果明細 VSシンプル'!I20（最低月額料金の判定式を同型適用）")
  ]
}

export const jaDenkiYotoku: TimeOfUsePlan = {
  structure: 'time_of_use',
  planId: 'ja_denki_yotoku',
  planName: 'JAでんき 夜トクプラン',
  side: 'ja',
  baseChargeUpTo10Kw: new Decimal('1897.72'),
  baseChargePerKwOver10: new Decimal('458.37'),
  minimumMonthly: null,
  unitPrices: touPrices('44.40', '46.46', '30.35', '30.35'),
  halveBaseWhenNoUsage: true,
  allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.tou, '基本項目!L46:L51')]
}

// ─────────────────────────────────────────────
// 深夜電力B（契約kW + 一律単価）
// ─────────────────────────────────────────────

export const chugokuMidnightB: DemandFlatPlan = {
  structure: 'demand_flat',
  planId: 'chugoku_midnight_b',
  planName: '中国電力 深夜電力B',
  side: 'other',
  baseChargePerKw: new Decimal('375.92'),
  unitPriceYenPerKwh: new Decimal('30.34'),
  halveTotalWhenNoUsage: true,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.midnightB, "'深夜電力B'!F7:F8")]
}

// ─────────────────────────────────────────────
// ファミリータイムⅠ/Ⅱ・時間帯別電灯（いずれも新規受付停止の旧プラン）
// ─────────────────────────────────────────────

/** 電化住宅割: 基本料金+電力量料金の8%、上限3,300円（④結果シート H15） */
const ALL_ELECTRIC_DISCOUNT = { rate: new Decimal('0.08'), capYen: new Decimal('3300') }

function familyPrices(daySummer: string, dayOther: string, family: string, night: string) {
  return {
    daySummer: new Decimal(daySummer),
    dayOther: new Decimal(dayOther),
    family: new Decimal(family),
    night: new Decimal(night)
  }
}

export const chugokuFamilyTime1: FamilyTimePlan = {
  structure: 'family_time',
  planId: 'chugoku_family_1',
  planName: '中国電力 ファミリータイムⅠ',
  side: 'other',
  baseChargeUpTo10Kva: new Decimal('2577.10'),
  baseChargePerKvaOver10: new Decimal('481.77'),
  unitPrices: familyPrices('47.38', '42.57', '42.33', '30.34'),
  allElectricDiscount: ALL_ELECTRIC_DISCOUNT,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.family, "'ファミリーⅠ結果'!H7, E8, E10:E13, H15")]
}

export const chugokuFamilyTime2: FamilyTimePlan = {
  structure: 'family_time',
  planId: 'chugoku_family_2',
  planName: '中国電力 ファミリータイムⅡ',
  side: 'other',
  baseChargeUpTo10Kva: new Decimal('1587.10'),
  baseChargePerKvaOver10: new Decimal('481.77'),
  unitPrices: familyPrices('50.71', '45.58', '45.34', '30.34'),
  allElectricDiscount: ALL_ELECTRIC_DISCOUNT,
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.family, "'ファミリーⅡ結果'!H7, E8, E10:E13, H15")]
}

export const chugokuEconomyNight: EconomyNightPlan = {
  structure: 'economy_night',
  planId: 'chugoku_economy_night',
  planName: '中国電力 時間帯別電灯（エコノミーナイト）',
  side: 'other',
  baseChargeUpTo10Kva: new Decimal('1578.72'),
  baseChargePerKvaOver10: new Decimal('480.37'),
  dayTiers: [
    { tierNumber: 1, startKwh: 0, endKwh: 90, unitPriceYenPerKwh: new Decimal('38.22') },
    { tierNumber: 2, startKwh: 90, endKwh: 220, unitPriceYenPerKwh: new Decimal('43.82') },
    { tierNumber: 3, startKwh: 220, endKwh: null, unitPriceYenPerKwh: new Decimal('44.86') }
  ],
  nightUnitPriceYenPerKwh: new Decimal('30.34'),
  rounding: CHUGOKU_ROUNDING,
  sources: [src(DOC.family, "'時間帯別結果'!I7, F8, F11:F14")]
}

// ─────────────────────────────────────────────
// 比較シナリオ
// ─────────────────────────────────────────────

/** 使用量の入力形式。画面のフォームを切り替えるために使う。 */
export type UsageForm = 'total' | 'seasonal' | 'tou' | 'family' | 'economy_night'

export interface ComparisonScenario {
  scenarioId: string
  /** 画面に出す現在のご契約プラン名 */
  label: string
  /** 補足説明（どういう人向けか） */
  hint: string
  current: RatePlan
  candidates: RatePlan[]
  usageForm: UsageForm
  /** 契約容量の入力が必要か */
  contract: 'none' | 'kw' | 'kva'
  /** auでんきなど、燃料費調整単価が中国電力と異なる場合 */
  fuelProvider: 'chugoku' | 'au'
  /**
   * 乗り換え先の使用量の扱い。
   * 'same'       … 現行と同じ使用量をそのまま渡す
   * 'all_night'  … 総使用量をすべてナイトタイムとして渡す
   *                （⑥は深夜電力Bの使用量を夜トクのナイトタイムに写像している。'深夜電力B'!H22 = H8）
   * 'from_family'        … ファミリータイムの4区分を検針期間の平日／休日比で夜トク4区分へ按分
   * 'from_economy_night' … 昼間・夜間の2区分を同様に按分（ファミリーとは別式）
   */
  candidateUsage: 'same' | 'all_night' | 'from_family' | 'from_economy_night'
  sourceDocument: string
}

export const SCENARIOS: ComparisonScenario[] = [
  {
    scenarioId: 'chugoku_juryo_a',
    label: '中国電力 従量電灯A',
    hint: '一般的なご家庭。検針票に「従量電灯A」と記載',
    current: chugokuJuryoA,
    candidates: [jaDenkiJuryoA, jaDenkiJuryoS],
    usageForm: 'total',
    contract: 'none',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.juryoA
  },
  {
    scenarioId: 'chugoku_smart',
    label: '中国電力 スマートコース',
    hint: '中国電力の自由料金プラン',
    current: chugokuSmart,
    candidates: [jaDenkiJuryoA, jaDenkiJuryoS],
    usageForm: 'total',
    contract: 'none',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.juryoA
  },
  {
    scenarioId: 'chugoku_simple',
    label: '中国電力 シンプルコース',
    hint: 'ご使用量が多いご家庭向けの自由料金プラン',
    current: chugokuSimple,
    candidates: [jaDenkiJuryoA, jaDenkiJuryoS],
    usageForm: 'total',
    contract: 'none',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.juryoA
  },
  {
    scenarioId: 'chugoku_juryo_b',
    label: '中国電力 従量電灯B',
    hint: '契約容量が6kVA以上のご家庭・店舗',
    current: chugokuJuryoB,
    candidates: [jaDenkiJuryoB],
    usageForm: 'total',
    contract: 'kva',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.juryoB
  },
  {
    scenarioId: 'chugoku_low_voltage',
    label: '中国電力 低圧電力',
    hint: '三相200V（動力）。農作物用倉庫・事務所など',
    current: chugokuLowVoltage,
    candidates: [jaDenkiLowVoltage],
    usageForm: 'seasonal',
    contract: 'kw',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.lowVoltage
  },
  {
    scenarioId: 'chugoku_denka_style',
    label: '中国電力 電化Style',
    hint: 'オール電化のご家庭。時間帯別の料金プラン',
    current: chugokuDenkaStyle,
    candidates: [jaDenkiYotoku],
    usageForm: 'tou',
    contract: 'kw',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.tou
  },
  {
    scenarioId: 'chugoku_night_holiday',
    label: '中国電力 ナイトホリデー',
    hint: 'オール電化の旧プラン',
    current: chugokuNightHoliday,
    candidates: [jaDenkiYotoku],
    usageForm: 'tou',
    contract: 'kw',
    fuelProvider: 'chugoku',
    candidateUsage: 'same',
    sourceDocument: DOC.tou
  },
  {
    scenarioId: 'chugoku_midnight_b',
    label: '中国電力 深夜電力B',
    hint: '蓄熱式暖房器など専用の夜間契約',
    current: chugokuMidnightB,
    candidates: [jaDenkiYotoku],
    usageForm: 'total',
    contract: 'kw',
    fuelProvider: 'chugoku',
    candidateUsage: 'all_night',
    sourceDocument: DOC.midnightB
  },
  {
    scenarioId: 'chugoku_family_1',
    label: '中国電力 ファミリータイムⅠ',
    hint: 'オール電化の旧プラン。新規受付は停止しています',
    current: chugokuFamilyTime1,
    candidates: [jaDenkiYotoku],
    usageForm: 'family',
    contract: 'kva',
    fuelProvider: 'chugoku',
    candidateUsage: 'from_family',
    sourceDocument: DOC.family
  },
  {
    scenarioId: 'chugoku_family_2',
    label: '中国電力 ファミリータイムⅡ',
    hint: 'オール電化の旧プラン。新規受付は停止しています',
    current: chugokuFamilyTime2,
    candidates: [jaDenkiYotoku],
    usageForm: 'family',
    contract: 'kva',
    fuelProvider: 'chugoku',
    candidateUsage: 'from_family',
    sourceDocument: DOC.family
  },
  {
    scenarioId: 'chugoku_economy_night',
    label: '中国電力 時間帯別電灯（エコノミーナイト）',
    hint: 'オール電化の旧プラン。新規受付は停止しています',
    current: chugokuEconomyNight,
    candidates: [jaDenkiYotoku],
    usageForm: 'economy_night',
    contract: 'kva',
    fuelProvider: 'chugoku',
    candidateUsage: 'from_economy_night',
    sourceDocument: DOC.family
  },
  {
    scenarioId: 'au_m_plan',
    label: 'auでんき Mプラン',
    hint: 'auでんきの従量電灯A相当プラン',
    current: auMPlan,
    candidates: [jaDenkiJuryoA, jaDenkiJuryoS],
    usageForm: 'total',
    contract: 'none',
    fuelProvider: 'au',
    candidateUsage: 'same',
    sourceDocument: DOC.auM
  }
]

/** 検針期間の日数入力が必要なシナリオか */
export function needsCalendar(scenario: ComparisonScenario): boolean {
  return scenario.candidateUsage === 'from_family' || scenario.candidateUsage === 'from_economy_night'
}

export function findScenario(scenarioId: string): ComparisonScenario | undefined {
  return SCENARIOS.find(s => s.scenarioId === scenarioId)
}

/**
 * 全プランの一覧。重複を排除して plan_id 順に並べる。
 * data/rate_master.json はこの配列から生成されるため、
 * ここに載っていないプランは監査用の料金マスターにも現れない。
 */
export const ALL_PLANS: RatePlan[] = Array.from(
  new Map(
    SCENARIOS.flatMap(s => [s.current, ...s.candidates]).map(p => [p.planId, p])
  ).values()
).sort((a, b) => a.planId.localeCompare(b.planId))
