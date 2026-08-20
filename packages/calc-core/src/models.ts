import { Decimal } from './decimal-config.js';

/**
 * 料金プランの構造。JAでんき公式試算表
 * 「①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx」
 * のシート「シミュレーション結果明細」に実装されている 2 種類に対応する。
 */
export type PlanStructure = 'tiered_minimum' | 'flat_rate';

/** 出典情報。CLAUDE.md ルール4「出典のない単価を登録しない」を型で強制する。 */
export interface RateSource {
  /** 元資料のファイル名 */
  document: string;
  /** 元資料内の位置（シート名・セル等） */
  locator: string;
  /** 単価の適用開始年月 */
  effectiveFrom: string;
  verificationStatus: 'verified' | 'unconfirmed';
  verifiedAt: string;
}

/** 段階別料金の 1 段階。startKwh 超〜endKwh 以下に unitPrice を適用する。 */
export interface Tier {
  tierNumber: number;
  startKwh: number;
  /** null は上限なし */
  endKwh: number | null;
  unitPriceYenPerKwh: Decimal;
}

/**
 * 燃料費調整額。段階制プランでは「最低料金に含まれる 15kWh 分の定額」と
 * 「15kWh 超の従量単価」に分かれる（Excel 明細 (7)(8)）。
 * 一律単価プランでは minimumCharge を使わず unitPrice を全使用量に掛ける。
 */
export interface FuelAdjustment {
  /** 15kWh までの定額（税込・円/契約） */
  minimumCharge: Decimal;
  /** 1kWh あたり（税込） */
  unitPriceYenPerKwh: Decimal;
}

/** 再エネ賦課金。単価のみを持ち、15kWh 分は unitPrice×15 で算出する（Excel 早見表 G5）。 */
export interface RenewableLevy {
  unitPriceYenPerKwh: Decimal;
}

/**
 * 段階制・最低料金型プラン。
 * 中国電力 従量電灯A / スマートコース、JAでんき 従量電灯A / 従量電灯S が該当する。
 *
 * 最低料金は「基本料金の代替」ではなく、最初の 15kWh 分を含む定額である。
 * したがって従量料金は 15kWh 超から始まる（Excel 明細 (2) の MAX(MIN(u,120)-15,0)）。
 */
export interface TieredMinimumPlan {
  structure: 'tiered_minimum';
  planId: string;
  planName: string;
  /** 最低料金（税込）。最初の minimumIncludedKwh 分を含む。 */
  minimumCharge: Decimal;
  /** 最低料金に含まれる使用量。中国エリアは 15kWh。 */
  minimumIncludedKwh: number;
  tiers: Tier[];
  sources: RateSource[];
}

/**
 * 一律単価型プラン。中国電力 シンプルコースが該当する。
 *
 * 0kWh から一律単価を掛け、(従量料金 + 燃料費調整額) が最低月額料金に
 * 満たない場合は最低月額料金を請求額とする（Excel 明細 VSシンプル I20）。
 */
export interface FlatRatePlan {
  structure: 'flat_rate';
  planId: string;
  planName: string;
  unitPriceYenPerKwh: Decimal;
  /** この額と (従量料金+燃調) を比較する閾値 */
  minimumMonthlyThreshold: Decimal;
  /** 閾値を下回ったときに請求する額 */
  minimumMonthlyBill: Decimal;
  sources: RateSource[];
}

export type RatePlan = TieredMinimumPlan | FlatRatePlan;

export interface CalculationInput {
  usageKwh: number;
  plan: RatePlan;
  fuelAdjustment: FuelAdjustment;
  renewableLevy: RenewableLevy;
}

/** 段階ごとの内訳。Excel 明細の (2)(3)(4) に対応する。 */
export interface TierBreakdown {
  tierNumber: number;
  chargedKwh: Decimal;
  unitPriceYenPerKwh: Decimal;
  charge: Decimal;
}

export interface MonthlyBill {
  /** (1) 最低料金。一律単価型では 0。 */
  minimumCharge: Decimal;
  /** (2)(3)(4) の内訳 */
  tiers: TierBreakdown[];
  /** (5) 電力量料金小計 */
  tierSubtotal: Decimal;
  /** (6) = (1)+(5) */
  energyChargeTotal: Decimal;
  /** (9) 燃料費調整額小計 */
  fuelAdjustment: Decimal;
  /** (13) 再エネ賦課金小計。円未満切り捨て済み。 */
  renewableLevy: Decimal;
  /** 最低月額料金が適用されたか（一律単価型のみ true になりうる） */
  minimumMonthlyApplied: boolean;
  /** 請求額。円未満切り捨て済み。 */
  total: Decimal;
  /** 計算過程の自然言語表現 */
  formula: string;
  /** 単価の出典 */
  sources: RateSource[];
}

/** 計算不能の場合の戻り値。CLAUDE.md ルール8「未確認プランを推測計算しない」。 */
export interface UnsupportedResult {
  status: 'unsupported';
  reason: string;
  nextSteps: string[];
}

export type BillResult = { status: 'ok'; bill: MonthlyBill } | UnsupportedResult;
