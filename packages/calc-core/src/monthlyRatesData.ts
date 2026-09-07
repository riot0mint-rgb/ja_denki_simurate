/**
 * 燃料費調整額・再エネ賦課金の年月データの実体。
 *
 * フェーズ6-b（燃料費調整額の自動取得。CLAUDE.md ルール10の限定的な例外）が
 * 新しい年月をこのファイルへ追記する（`scripts/fetchMonthlyRates.ts` が
 * `serializeMonthlyRatesData()` でこのファイルを丸ごと再生成する）。
 * **既存の年月の値を書き換えることはしない。** 訂正が必要な場合は人が確認する
 * PRに回す（自動化スクリプト側で新規追加のみに制限している）。
 *
 * 値は文字列で持つ（数値にすると浮動小数に戻るため。CLAUDE.md ルール2）。
 * 手で編集してもよいが、フォーマットは `serializeMonthlyRatesData()` の
 * 出力と揃えること（自動生成との差分が意味のあるものだけになるようにするため）。
 */

/** 燃料費調整額。段階制プランは 15kWh 分の定額と超過分の単価に分かれる。 */
export interface FuelRow {
  /** 15kWh までの定額（円/契約） */
  minimumCharge: string;
  /** 15kWh を超える分（円/kWh）。時間帯別・低圧電力など段階を持たないプランは全量にこの単価を掛ける。 */
  unitPriceYenPerKwh: string;
  /** その値の出所。省略時は試算表由来 */
  from?: SourceKey;
}

/**
 * 単価の出所。月によって出所が違うため行ごとに持つ。
 * 全部まとめて「試算表」と書くと、値の載っていない文書を出典として
 * verified で記録することになる（CLAUDE.md ルール4）。
 */
export type SourceKey = 'spreadsheet' | 'zennoh' | 'au-site';

export type FuelAdjustmentProvider = 'chugoku' | 'au';

/**
 * 中国電力エリア（中国電力・JAでんき共通）の燃料費調整額。
 * 出典: 公式試算表「基本項目」燃料費調整額の表（2026-07 まで）。
 * 2026-08 以降は全農エネルギーが公表する「燃料費調整単価（低圧）のお知らせ」から。
 * 中国電力の公表値（燃料費等調整制度のご案内）とも一致することを確認済み。
 */
export const CHUGOKU_FUEL: Record<string, FuelRow> = {
  '2025-01': { minimumCharge: '-130.31', unitPriceYenPerKwh: '-8.67' },
  '2025-02': { minimumCharge: '-167.85', unitPriceYenPerKwh: '-11.17' },
  '2025-03': { minimumCharge: '-165.63', unitPriceYenPerKwh: '-11.03' },
  '2025-04': { minimumCharge: '-145.71', unitPriceYenPerKwh: '-9.70' },
  '2025-05': { minimumCharge: '-128.42', unitPriceYenPerKwh: '-8.54' },
  '2025-06': { minimumCharge: '-132.86', unitPriceYenPerKwh: '-8.84' },
  '2025-07': { minimumCharge: '-141.17', unitPriceYenPerKwh: '-9.39' },
  '2025-08': { minimumCharge: '-177.90', unitPriceYenPerKwh: '-11.85' },
  '2025-09': { minimumCharge: '-188.74', unitPriceYenPerKwh: '-12.56' },
  '2025-10': { minimumCharge: '-185.34', unitPriceYenPerKwh: '-12.33' },
  '2025-11': { minimumCharge: '-154.39', unitPriceYenPerKwh: '-10.27' },
  '2025-12': { minimumCharge: '-153.73', unitPriceYenPerKwh: '-10.23' },
  '2026-01': { minimumCharge: '-152.11', unitPriceYenPerKwh: '-10.12' },
  '2026-02': { minimumCharge: '-219.29', unitPriceYenPerKwh: '-14.60' },
  '2026-03': { minimumCharge: '-217.69', unitPriceYenPerKwh: '-14.50' },
  '2026-04': { minimumCharge: '-171.12', unitPriceYenPerKwh: '-11.39' },
  '2026-05': { minimumCharge: '-147.69', unitPriceYenPerKwh: '-9.83' },
  '2026-06': { minimumCharge: '-146.74', unitPriceYenPerKwh: '-9.76' },
  '2026-07': { minimumCharge: '-143.77', unitPriceYenPerKwh: '-9.57' },
  // ここから全農エネルギーの「燃料費調整単価（低圧）のお知らせ」より。
  // 中国電力の公表値とも一致する（二重に裏付けあり）。
  '2026-08': { minimumCharge: '-188.70', unitPriceYenPerKwh: '-12.56', from: 'zennoh' },
  '2026-09': { minimumCharge: '-194.01', unitPriceYenPerKwh: '-12.93', from: 'zennoh' }
};

/**
 * auでんきは独自の燃料費調整単価を持つ。
 * 出典: ☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx「基本項目」。
 *
 * **中国電力系より収録が遅れている。** auでんきは自社サイトで単価を公表しており、
 * 全農エネルギーのお知らせには載らないため。
 */
export const AU_FUEL: Record<string, FuelRow> = {
  '2026-07': { minimumCharge: '-196.24', unitPriceYenPerKwh: '-13.09' },
  // auでんき公式「燃料費調整単価」より（税込）。中国電力エリアの でんきMプラン。
  // https://www.au.com/energy/denki/other/adjust/detail/
  '2026-08': { minimumCharge: '-203.70', unitPriceYenPerKwh: '-13.58', from: 'au-site' }
};

/** 再エネ賦課金（円/kWh）。全事業者共通。 */
export const RENEWABLE_LEVY: Record<string, string> = {
  '2025-01': '3.49', '2025-02': '3.49', '2025-03': '3.49', '2025-04': '3.49',
  '2025-05': '3.98', '2025-06': '3.98', '2025-07': '3.98', '2025-08': '3.98',
  '2025-09': '3.98', '2025-10': '3.98', '2025-11': '3.98', '2025-12': '3.98',
  '2026-01': '3.98', '2026-02': '3.98', '2026-03': '3.98', '2026-04': '3.98',
  '2026-05': '4.18', '2026-06': '4.18', '2026-07': '4.18', '2026-08': '4.18',
  '2026-09': '4.18', '2026-10': '4.18', '2026-11': '4.18', '2026-12': '4.18',
  '2027-01': '4.18', '2027-02': '4.18', '2027-03': '4.18', '2027-04': '4.18'
};
