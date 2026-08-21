import { Decimal, MonthlyDemandProfile, RateSource } from '@ja-denki-simulator/calc-core'

/**
 * 中国エリアのご家庭が、月ごとにどれくらい電気を使っているか。
 *
 * 電気事業連合会「電灯・電力需要実績」の月報から、中国電力の従量電灯の
 * 販売電力量と契約口数を取り出し、1口あたりの月間使用量を出したもの。
 *
 * この統計を選んだ理由:
 *
 * - **kWh そのもの**である。家計調査の「電気代（円）」は単価改定や燃料費調整の
 *   影響を受けるため、使用量の季節差を表す数字としては使えない。
 * - **検針月ベース**で集計されている。この画面の入力も検針月なので、
 *   月のずれを補正せずにそのまま使える。
 * - 2015年度は電力自由化の前で、中国エリアのご家庭がほぼすべて中国電力の
 *   従量電灯だった。つまり「中国エリアの一般家庭の平均」に最も近い。
 *
 * 12か月の合計 9,179,668千kWh は、同連合会が公表している2015年度の年間値と
 * 完全に一致する（`demandProfile.test.ts` で固定）。転記ミスがあれば落ちる。
 *
 * ⚠️ 統計の年度が古い点は ASSUMPTIONS.md に記録済み。より新しい月別データ
 * （資源エネルギー庁「電力調査統計」等）が手に入れば差し替える。
 */
const FEPC_LIGHTING_2015: RateSource = {
  document: '電気事業連合会「電灯・電力需要実績」月報（2015年4月分〜2016年3月分・確報）',
  locator:
    '各月「（1）販売電力量および前年比」＜従量電灯＞中国 ／「（2）契約電力kWおよび口数」従量電灯口数 中国',
  effectiveFrom: '2015-04',
  verificationStatus: 'verified',
  verifiedAt: '2026-08-21'
}

/**
 * 1月〜12月の、1口あたり月間使用量（kWh）。
 *
 * 販売電力量（千kWh）× 1000 ÷ 契約口数。比しか使わないので単位は問わないが、
 * 元の数字が追えるように kWh のまま置いている。
 *
 * | 月 | 千kWh | 口数 | kWh/口 |
 * |---|---|---|---|
 * | 2016-01 | 1,000,237 | 3,141,119 | 318.433 |
 * | 2016-02 | 988,449 | 3,139,629 | 314.830 |
 * | 2016-03 | 892,482 | 3,135,784 | 284.612 |
 * | 2015-04 | 772,954 | 3,153,473 | 245.112 |
 * | 2015-05 | 645,049 | 3,153,053 | 204.579 |
 * | 2015-06 | 588,979 | 3,152,001 | 186.859 |
 * | 2015-07 | 663,714 | 3,151,378 | 210.611 |
 * | 2015-08 | 918,665 | 3,150,576 | 291.586 |
 * | 2015-09 | 694,946 | 3,148,994 | 220.688 |
 * | 2015-10 | 613,008 | 3,148,150 | 194.720 |
 * | 2015-11 | 648,351 | 3,146,041 | 206.085 |
 * | 2015-12 | 752,834 | 3,143,448 | 239.493 |
 */
const CHUGOKU_MONTHLY_KWH_PER_CONTRACT = [
  '318.433',
  '314.830',
  '284.612',
  '245.112',
  '204.579',
  '186.859',
  '210.611',
  '291.586',
  '220.688',
  '194.720',
  '206.085',
  '239.493'
]

/** 元資料の千kWh。年間合計の検算に使う */
export const CHUGOKU_MONTHLY_SOURCE_ROWS: ReadonlyArray<{
  year: number
  month: number
  thousandKwh: number
  contracts: number
}> = [
  { year: 2015, month: 4, thousandKwh: 772954, contracts: 3153473 },
  { year: 2015, month: 5, thousandKwh: 645049, contracts: 3153053 },
  { year: 2015, month: 6, thousandKwh: 588979, contracts: 3152001 },
  { year: 2015, month: 7, thousandKwh: 663714, contracts: 3151378 },
  { year: 2015, month: 8, thousandKwh: 918665, contracts: 3150576 },
  { year: 2015, month: 9, thousandKwh: 694946, contracts: 3148994 },
  { year: 2015, month: 10, thousandKwh: 613008, contracts: 3148150 },
  { year: 2015, month: 11, thousandKwh: 648351, contracts: 3146041 },
  { year: 2015, month: 12, thousandKwh: 752834, contracts: 3143448 },
  { year: 2016, month: 1, thousandKwh: 1000237, contracts: 3141119 },
  { year: 2016, month: 2, thousandKwh: 988449, contracts: 3139629 },
  { year: 2016, month: 3, thousandKwh: 892482, contracts: 3135784 }
]

/** 電気事業連合会が公表している2015年度の年間値（千kWh）。検算用 */
export const CHUGOKU_FY2015_TOTAL_THOUSAND_KWH = 9179668

export const CHUGOKU_HOUSEHOLD_PROFILE: MonthlyDemandProfile = {
  id: 'chugoku_household_2015',
  label: '季節で増えたり減ったり',
  description:
    '中国エリアのご家庭の平均的な使われ方に合わせて、夏と冬は多めに、春と秋は少なめに見積もります',
  monthlyIndex: CHUGOKU_MONTHLY_KWH_PER_CONTRACT.map(v => new Decimal(v)),
  source: FEPC_LIGHTING_2015
}

export const DEMAND_PROFILE = CHUGOKU_HOUSEHOLD_PROFILE
