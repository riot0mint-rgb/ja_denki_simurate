import { Decimal } from './decimal-config.js';
import { FuelAdjustment, RateSource, RenewableLevy } from './models.js';
import {
  CHUGOKU_FUEL,
  AU_FUEL,
  RENEWABLE_LEVY,
  FuelRow,
  FuelAdjustmentProvider
} from './monthlyRatesData.js';

/**
 * 燃料費調整額・再エネ賦課金は毎月改定される。公式試算表は「基本項目」シートの
 * 年×月マトリクスを INDEX/MATCH で引いている。ここでも同じ表を持ち、
 * 対象年月で引けるようにする。単一の月を定数で埋め込むと、改定のたびに
 * コード修正が必要になり、適用月と単価が乖離する。
 *
 * データの実体は `./monthlyRatesData.ts`。フェーズ6-b（燃料費調整額の自動取得。
 * CLAUDE.md ルール10の限定的な例外）が新しい年月をそのファイルへ追記する。
 */

export { FuelAdjustmentProvider };

export interface RatePeriod {
  year: number;
  month: number;
}

export function periodKey(p: RatePeriod): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/**
 * 単価の出所。月によって出所が違うため行ごとに持つ。
 * 全部まとめて「試算表」と書くと、値の載っていない文書を出典として
 * verified で記録することになる（CLAUDE.md ルール4）。
 */
type SourceKey = 'spreadsheet' | 'zennoh' | 'au-site';

const SOURCE_DOCUMENTS: Record<SourceKey, string> = {
  spreadsheet: '①〜⑥JAでんき試算表 26年7月適用',
  zennoh: '全農エネルギー「燃料費調整単価（低圧）のお知らせ」',
  'au-site': 'auでんき公式「燃料費調整単価」'
};

const SOURCE_LOCATORS: Record<SourceKey, string> = {
  spreadsheet: '公式試算表「基本項目」燃料費調整額',
  zennoh: 'https://zennoh-energy.co.jp/ja-denki/（中国エリア・低圧）',
  'au-site': 'https://www.au.com/energy/denki/other/adjust/detail/（中国電力エリア）'
};

const FUEL_TABLES: Record<FuelAdjustmentProvider, Record<string, FuelRow>> = {
  chugoku: CHUGOKU_FUEL,
  au: AU_FUEL
};

const FUEL_SOURCE: Record<FuelAdjustmentProvider, string> = {
  chugoku: '公式試算表「基本項目」燃料費調整額（中国電力エリア）',
  au: '☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx「基本項目」燃料費調整額'
};

/** その行が実際にどこから来たかを出典にする */
function fuelSource(
  row: FuelRow,
  provider: FuelAdjustmentProvider,
  period: RatePeriod
): RateSource {
  const key = row.from ?? 'spreadsheet';
  return {
    document: SOURCE_DOCUMENTS[key],
    locator:
      key === 'spreadsheet'
        ? `${FUEL_SOURCE[provider]} ${periodKey(period)}`
        : `${SOURCE_LOCATORS[key]} ${periodKey(period)}`,
    effectiveFrom: periodKey(period),
    verificationStatus: 'verified',
    verifiedAt: '2026-08-20'
  };
}

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
    source: fuelSource(row, provider, period)
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

const ALL_PROVIDERS: FuelAdjustmentProvider[] = ['chugoku', 'au'];

/**
 * 既定の対象月。**全事業者（燃調）＋再エネ賦課金がそろっている最新月**を自動算出する。
 *
 * 以前はここを手作業で進めていたが、事業者ごとに収録が追いつくタイミングが違うため
 * （例: auでんきは中国電力系より遅れて公表される）、更新を1か所忘れると
 * 「一部のシナリオだけ既定月で計算不可になる」事故につながっていた。
 * `monthlyRatesData.ts` に新しい年月を追記するだけで、ここは自動的に動く。
 */
export const DEFAULT_PERIOD: RatePeriod = computeDefaultPeriod(FUEL_TABLES, RENEWABLE_LEVY);

/** テストで空データを注入できるよう、参照するテーブルを引数で受け取る（ルール6）。 */
export function computeDefaultPeriod(
  fuelTables: Record<FuelAdjustmentProvider, Record<string, FuelRow>>,
  renewableLevy: Record<string, string>
): RatePeriod {
  const commonKeys = Object.keys(renewableLevy).filter(key =>
    ALL_PROVIDERS.every(provider => fuelTables[provider][key] !== undefined)
  );
  if (commonKeys.length === 0) {
    throw new Error('monthlyRatesData.ts: 全事業者共通の年月が1件もありません');
  }
  const latest = commonKeys.sort().at(-1)!;
  const [y, m] = latest.split('-');
  return { year: Number(y), month: Number(m) };
}
