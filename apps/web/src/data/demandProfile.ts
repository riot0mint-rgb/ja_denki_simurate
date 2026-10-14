import { Decimal, MonthlyDemandProfile, RateSource, monthlyIndexFromYears } from '@ja-denki-simulator/calc-core'

/**
 * 1年ぶんの試算で、月ごとの使用量を増減させるための「季節ごとの使われ方」。
 *
 * 1か月ぶんの検針票しかないお客様に年額を出すとき、残りの11か月の使用量は
 * 誰も知らない。ここの数字は、公表統計の**月ごとの実績の比**を、そのまま増減の倍率に使う。
 * 推計した数字は置かない（CLAUDE.md ルール4）。元の数値を下に残し、指数は式で導く。
 *
 * 契約の種類によって季節の山の形がまるで違うので、プロファイルを3つに分けている。
 *
 *   household         従量電灯A・Bなどの一般のご家庭・店舗   電灯の販売電力量 ÷ 契約口数
 *   all_electric      オール電化のご家庭                   環境省の「電気のみを使用」の世帯
 *   low_voltage_power 低圧電力（動力）                     電力の販売電力量 ÷ 契約口数
 *
 * 深夜電力Bはここに無い。蓄熱暖房が中心の契約の季節の形を示す統計が見つかっていない。
 *
 * ⚠️ 限界は ASSUMPTIONS.md「季節ごとの使われ方の統計」に書いてある。
 */

export type DemandProfileId = 'household' | 'all_electric' | 'low_voltage_power'

// ─────────────────────────────────────────────
// 電力・ガス取引監視等委員会「電力取引報」（中国エリア）
// ─────────────────────────────────────────────

/**
 * 出典: 電力・ガス取引監視等委員会「電力取引の状況」集計結果（Excel）の「規制料金」シート
 * 「みなし小売電気事業者の経過措置料金実績」＜中国＞の「販売電力量」と「契約口数」。
 * https://www.egc.meti.go.jp/info/business/report/results.html
 *
 * シートの注記に「規制料金の販売実績については、電力調査統計から数値を記載」とある。
 * 月の区切りが検針月か使用月かは資料に明記がなく、**未確認**（ASSUMPTIONS.md 参照）。
 * 2023年4月〜2026年3月の36か月ぶんを、2026-10-14 に取得して転記した。月ごとに別ファイルで、
 * 公表は約2〜3か月遅れ。
 *
 * 経過措置料金（従量電灯A・Bなど）に残っている契約だけの数字で、自由料金（スマートコース等）に
 * 移った契約は含まない。契約口数が減り続ける母集団なので、水準ではなく**月ごとの比**だけを使う。
 */
const EGC_SOURCE_DOCUMENT = '電力・ガス取引監視等委員会「電力取引の状況」集計結果（規制料金シート・中国）'

/** 電灯（従量電灯A・B・Cなど）。販売電力量 MWh／契約口数 件。各年度は4月始まり */
export const EGC_LIGHTING: ReadonlyArray<{ fiscalYear: number; rows: ReadonlyArray<readonly [mwh: number, contracts: number]> }> = [
  {
    fiscalYear: 2023,
    rows: [
      [308326, 2245660], [267468, 2244055], [245954, 2239253], [290831, 2231822],
      [380271, 2224222], [375694, 2217201], [280007, 2210442], [266671, 2203498],
      [326080, 2196424], [428886, 2190465], [398177, 2183905], [361686, 2175853]
    ]
  },
  {
    fiscalYear: 2024,
    rows: [
      [298082, 2166779], [251908, 2159323], [237596, 2151661], [264170, 2144965],
      [393016, 2138440], [373075, 2131835], [283222, 2124725], [247621, 2117108],
      [303143, 2109951], [429859, 2102825], [411392, 2095254], [350654, 2086751]
    ]
  },
  {
    fiscalYear: 2025,
    rows: [
      [276734, 2077715], [228055, 2070029], [221872, 2062707], [283880, 2056377],
      [360114, 2049752], [330825, 2041287], [250313, 2033554], [238430, 2024880],
      [268538, 2017966], [390110, 2012273], [360766, 2005181], [287241, 1998043]
    ]
  }
]

/** 電力（低圧電力・農事用電力など）。同上 */
export const EGC_POWER: ReadonlyArray<{ fiscalYear: number; rows: ReadonlyArray<readonly [mwh: number, contracts: number]> }> = [
  {
    fiscalYear: 2023,
    rows: [
      [65485, 213056], [60287, 217312], [64317, 219326], [84244, 218759],
      [110010, 218629], [112364, 224244], [81180, 218640], [60846, 209461],
      [69441, 206365], [86234, 205112], [84700, 204432], [78403, 203821]
    ]
  },
  {
    fiscalYear: 2024,
    rows: [
      [66885, 204442], [58559, 206688], [64202, 208457], [73787, 207192],
      [110344, 207299], [107430, 212638], [81941, 207401], [57450, 198394],
      [63014, 195471], [83909, 194339], [86651, 193734], [76621, 193254]
    ]
  },
  {
    fiscalYear: 2025,
    rows: [
      [60769, 194210], [52599, 195932], [57649, 197495], [81821, 196715],
      [103789, 195245], [95109, 199607], [70801, 191832], [52151, 182108],
      [52637, 178581], [71569, 177366], [71322, 175670], [57434, 173547]
    ]
  }
]

// ─────────────────────────────────────────────
// 環境省「家庭部門のCO2排出実態統計調査」（中国地方）
// ─────────────────────────────────────────────

/**
 * 出典: 環境省「家庭部門のCO2排出実態統計調査」令和元年度（平成31年度）〜令和5年度の
 * 第6-1-1表「基本項目別-月別エネルギー種別エネルギー消費量」＜中国＞
 * 「家庭で使用しているエネルギー種別」＝**「電気のみを使用」**（＝オール電化）の、電気の1世帯あたり月間消費量。
 * e-Stat: https://www.e-stat.go.jp/stat-search/files?toukei=00650408
 *
 * 単位は GJ/世帯・月。比しか使わないので換算しない。月は「◯月分と記載された検針票」
 * （調査票の注記「実際の使用期間に関わらず」）で、このアプリの検針月と同じ。
 * sample は集計世帯数。年度ごとに160〜190世帯ほどなので、1年度だけでは月ごとの
 * ばらつきが大きく、5年度の平均にしている。4月始まり。
 */
export const ENV_ELECTRICITY_ONLY: ReadonlyArray<{ fiscalYear: number; sample: number; gj: readonly number[] }> = [
  { fiscalYear: 2019, sample: 163, gj: [2.58, 2, 1.61, 1.54, 1.99, 1.79, 1.6, 1.83, 2.54, 3.5, 3.25, 3.13] },
  { fiscalYear: 2020, sample: 187, gj: [2.42, 1.98, 1.55, 1.65, 1.91, 1.86, 1.54, 1.9, 2.53, 4.07, 3.07, 2.6] },
  { fiscalYear: 2021, sample: 186, gj: [2.34, 1.85, 1.52, 1.59, 1.89, 1.68, 1.52, 1.85, 2.51, 3.67, 3.49, 3.01] },
  { fiscalYear: 2022, sample: 194, gj: [2.49, 1.81, 1.52, 1.77, 1.99, 1.98, 1.62, 1.72, 2.49, 3.63, 3.29, 2.59] },
  { fiscalYear: 2023, sample: 175, gj: [1.95, 1.65, 1.39, 1.55, 1.84, 1.8, 1.48, 1.7, 2.37, 3.29, 3.02, 2.71] }
]

// ─────────────────────────────────────────────
// 指数（1月〜12月）
// ─────────────────────────────────────────────

const perContract = (years: typeof EGC_LIGHTING) =>
  years.map(y => y.rows.map(([mwh, contracts]) => new Decimal(mwh).times(1000).dividedBy(contracts)))

const verified = (document: string, locator: string, effectiveFrom: string): RateSource => ({
  document,
  locator,
  effectiveFrom,
  verificationStatus: 'verified',
  verifiedAt: '2026-10-14'
})

export const HOUSEHOLD_PROFILE: MonthlyDemandProfile = {
  id: 'chugoku_household_egc_2023_2025',
  label: '季節で増えたり減ったり',
  description:
    '中国エリアの従量電灯のご契約の、直近3年度（2023〜2025年度）の月ごとの使われ方の平均に合わせて、' +
    '冬と夏は多め、春と秋は少なめに見積もります',
  monthlyIndex: monthlyIndexFromYears(perContract(EGC_LIGHTING), 4),
  source: verified(
    EGC_SOURCE_DOCUMENT,
    '電灯の「経過措置料金」販売電力量 ÷ 契約口数、2023年4月〜2026年3月の36か月（年度ごとに平均を1とした倍率の3年度平均）',
    '2023-04'
  )
}

export const LOW_VOLTAGE_POWER_PROFILE: MonthlyDemandProfile = {
  id: 'chugoku_low_voltage_egc_2023_2025',
  label: '季節で増えたり減ったり',
  description:
    '中国エリアの低圧電力のご契約の、直近3年度（2023〜2025年度）の月ごとの使われ方の平均に合わせて、' +
    '夏は大きく、冬もやや多め、春と秋は少なめに見積もります',
  monthlyIndex: monthlyIndexFromYears(perContract(EGC_POWER), 4),
  source: verified(
    EGC_SOURCE_DOCUMENT,
    '電力の「経過措置料金」販売電力量 ÷ 契約口数、2023年4月〜2026年3月の36か月（年度ごとに平均を1とした倍率の3年度平均）。低圧電力のほか臨時電力・農事用電力を含む',
    '2023-04'
  )
}

export const ALL_ELECTRIC_PROFILE: MonthlyDemandProfile = {
  id: 'chugoku_all_electric_env_2019_2023',
  label: '季節で増えたり減ったり',
  description:
    '中国地方で電気だけを使うご家庭の、直近5年度（2019〜2023年度）の月ごとの使われ方の平均に合わせて、' +
    '冬は大きく増え、春と秋は少なめに見積もります。昼・夜・休日の割合は、検針票の月と同じとみなします',
  monthlyIndex: monthlyIndexFromYears(
    ENV_ELECTRICITY_ONLY.map(y => y.gj.map(v => new Decimal(v))),
    4
  ),
  source: verified(
    '環境省「家庭部門のCO2排出実態統計調査」第6-1-1表（中国・令和元年度〜令和5年度）',
    '「家庭で使用しているエネルギー種別」＝電気のみを使用、電気の月別消費量（年度ごとに平均を1とした倍率の5年度平均）',
    '2019-04'
  )
}

export const DEMAND_PROFILES: Record<DemandProfileId, MonthlyDemandProfile> = {
  household: HOUSEHOLD_PROFILE,
  all_electric: ALL_ELECTRIC_PROFILE,
  low_voltage_power: LOW_VOLTAGE_POWER_PROFILE
}
