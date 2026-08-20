import { Decimal } from './decimal-config.js';
import { FuelAdjustment, RateSource, RenewableLevy } from './models.js';

/**
 * 燃料費調整額・再エネ賦課金は毎月改定される。公式試算表は「基本項目」シートの
 * 年×月マトリクスを INDEX/MATCH で引いている。ここでも同じ表を持ち、
 * 対象年月で引けるようにする。単一の月を定数で埋め込むと、改定のたびに
 * コード修正が必要になり、適用月と単価が乖離する。
 */

export interface RatePeriod {
  year: number;
  month: number;
}

export function periodKey(p: RatePeriod): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/** 燃料費調整額。段階制プランは 15kWh 分の定額と超過分の単価に分かれる。 */
interface FuelRow {
  /** 15kWh までの定額（円/契約） */
  minimumCharge: string;
  /** 15kWh を超える分（円/kWh）。時間帯別・低圧電力など段階を持たないプランは全量にこの単価を掛ける。 */
  unitPriceYenPerKwh: string;
}

/**
 * 中国電力エリア（中国電力・JAでんき共通）の燃料費調整額。
 * 出典: 公式試算表「基本項目」燃料費調整額の表。
 */
const CHUGOKU_FUEL: Record<string, FuelRow> = {
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
  '2026-07': { minimumCharge: '-143.77', unitPriceYenPerKwh: '-9.57' }
};

/**
 * auでんきは独自の燃料費調整単価を持つ。
 * 出典: ☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx「基本項目」。
 */
const AU_FUEL: Record<string, FuelRow> = {
  '2026-07': { minimumCharge: '-196.24', unitPriceYenPerKwh: '-13.09' }
};

/** 再エネ賦課金（円/kWh）。全事業者共通。 */
const RENEWABLE_LEVY: Record<string, string> = {
  '2025-01': '3.49', '2025-02': '3.49', '2025-03': '3.49', '2025-04': '3.49',
  '2025-05': '3.98', '2025-06': '3.98', '2025-07': '3.98', '2025-08': '3.98',
  '2025-09': '3.98', '2025-10': '3.98', '2025-11': '3.98', '2025-12': '3.98',
  '2026-01': '3.98', '2026-02': '3.98', '2026-03': '3.98', '2026-04': '3.98',
  '2026-05': '4.18', '2026-06': '4.18', '2026-07': '4.18', '2026-08': '4.18',
  '2026-09': '4.18', '2026-10': '4.18', '2026-11': '4.18', '2026-12': '4.18',
  '2027-01': '4.18', '2027-02': '4.18', '2027-03': '4.18', '2027-04': '4.18'
};

export type FuelAdjustmentProvider = 'chugoku' | 'au';

const FUEL_TABLES: Record<FuelAdjustmentProvider, Record<string, FuelRow>> = {
  chugoku: CHUGOKU_FUEL,
  au: AU_FUEL
};

const FUEL_SOURCE: Record<FuelAdjustmentProvider, string> = {
  chugoku: '公式試算表「基本項目」燃料費調整額（中国電力エリア）',
  au: '☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx「基本項目」燃料費調整額'
};

/** 対象年月の燃料費調整額。未収録の月は null を返す（推測しない）。 */
export function lookupFuelAdjustment(
  period: RatePeriod,
  provider: FuelAdjustmentProvider = 'chugoku'
): { value: FuelAdjustment; source: RateSource } | null {
  const row = FUEL_TABLES[provider][periodKey(period)];
  if (!row) return null;
  return {
    value: {
      minimumCharge: new Decimal(row.minimumCharge),
      unitPriceYenPerKwh: new Decimal(row.unitPriceYenPerKwh)
    },
    source: {
      document: '①〜⑥JAでんき試算表 26年7月適用',
      locator: `${FUEL_SOURCE[provider]} ${periodKey(period)}`,
      effectiveFrom: periodKey(period),
      verificationStatus: 'verified',
      verifiedAt: '2026-08-20'
    }
  };
}

/** 対象年月の再エネ賦課金。未収録の月は null を返す。 */
export function lookupRenewableLevy(
  period: RatePeriod
): { value: RenewableLevy; source: RateSource } | null {
  const unit = RENEWABLE_LEVY[periodKey(period)];
  if (!unit) return null;
  return {
    value: { unitPriceYenPerKwh: new Decimal(unit) },
    source: {
      document: '①〜⑥JAでんき試算表 26年7月適用',
      locator: `公式試算表「基本項目」再エネ賦課金 ${periodKey(period)}`,
      effectiveFrom: periodKey(period),
      verificationStatus: 'verified',
      verifiedAt: '2026-08-20'
    }
  };
}

/** 収録済みの年月一覧（新しい順）。画面の対象月セレクタに使う。 */
export function availablePeriods(provider: FuelAdjustmentProvider = 'chugoku'): RatePeriod[] {
  return Object.keys(FUEL_TABLES[provider])
    .filter(k => RENEWABLE_LEVY[k] !== undefined)
    .sort()
    .reverse()
    .map(k => {
      const [y, m] = k.split('-');
      return { year: Number(y), month: Number(m) };
    });
}

/** 元資料が「7月適用」として配布している対象月。 */
export const DEFAULT_PERIOD: RatePeriod = { year: 2026, month: 7 };
