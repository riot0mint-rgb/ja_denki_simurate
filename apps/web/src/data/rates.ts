import {
  Decimal,
  FlatRatePlan,
  FuelAdjustment,
  RateSource,
  RenewableLevy,
  TieredMinimumPlan
} from '@ja-denki-simulator/calc-core'

/**
 * 単価はすべて JAでんき公式試算表から転記した。推測値・逆算値は含まない。
 * CLAUDE.md ルール4「出典のない単価を登録しない」に従い、
 * 各プランに元資料のシート名・セル番地を保持する。
 *
 * 元資料: ①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx
 *         （archive/01_JAでんき試算表_VS中電_従量A_スマート_シンプル_26年4月適用.xlsx にコピー）
 */
const SOURCE_FILE = '①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx'
const EFFECTIVE_FROM = '2026-04'
const VERIFIED_AT = '2026-08-20'

function source(locator: string): RateSource {
  return {
    document: SOURCE_FILE,
    locator,
    effectiveFrom: EFFECTIVE_FROM,
    verificationStatus: 'verified',
    verifiedAt: VERIFIED_AT
  }
}

/** 中国エリアの最低料金に含まれる使用量 */
const MINIMUM_INCLUDED_KWH = 15

function tiers(tier1: string, tier2: string, tier3: string) {
  return [
    { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: new Decimal(tier1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(tier2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(tier3) }
  ]
}

export const chugokuJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_juryo_a',
  planName: '中国電力 従量電灯A',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers('32.75', '39.43', '41.55'),
  sources: [source('基本項目!E8:E11（規制料金）')]
}

export const chugokuSmart: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_smart',
  planName: '中国電力 スマートコース',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers('32.01', '39.43', '41.55'),
  sources: [source('基本項目!E46:E49（自由料金）')]
}

/**
 * シンプルコースのみ 0kWh からの一律単価。
 * 閾値 1,844.7 円と請求額 1,845 円が一致しないのは元資料の式
 * `IF(I13+I16<1844.7, 1845, ...)` のままであり、丸めて揃えていない。
 */
export const chugokuSimple: FlatRatePlan = {
  structure: 'flat_rate',
  planId: 'chugoku_simple',
  planName: '中国電力 シンプルコース',
  unitPriceYenPerKwh: new Decimal('38.21'),
  minimumMonthlyThreshold: new Decimal('1844.7'),
  minimumMonthlyBill: new Decimal('1845'),
  sources: [
    source('基本項目!E52:E55（自由料金）'),
    source("'シミュレーション結果明細 VSシンプル'!I20（最低月額料金の判定式）")
  ]
}

export const jaDenkiJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_a',
  planName: 'JAでんき 従量電灯A',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers('32.22', '38.04', '38.84'),
  sources: [source('基本項目!E26:E29（規制料金）')]
}

export const jaDenkiJuryoS: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_s',
  planName: 'JAでんき 従量電灯S',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: MINIMUM_INCLUDED_KWH,
  tiers: tiers('31.79', '39.43', '41.44'),
  sources: [source('基本項目!E58:E61（自由料金）')]
}

/**
 * 燃料費調整額・再エネ賦課金は毎月改定される。
 * ここでは元資料の適用月（2026年4月）の値のみを持つ。
 */
export const RATE_PERIOD = { year: 2026, month: 4 } as const

export const fuelAdjustment2026_04: FuelAdjustment = {
  minimumCharge: new Decimal('-171.12'),
  unitPriceYenPerKwh: new Decimal('-11.39')
}

export const renewableLevy2026_04: RenewableLevy = {
  unitPriceYenPerKwh: new Decimal('3.98')
}

export const fuelAdjustmentSource = source('基本項目!L7（15kWhまで）, L21（15kWh超）')
export const renewableLevySource = source('基本項目!L38（1kWh当り）')

/** 現在ご契約中のプランとして選択できるもの */
export const CURRENT_PLANS = [chugokuJuryoA, chugokuSmart, chugokuSimple] as const

/** JAでんきの乗り換え候補 */
export const JA_DENKI_PLANS = [jaDenkiJuryoA, jaDenkiJuryoS] as const
