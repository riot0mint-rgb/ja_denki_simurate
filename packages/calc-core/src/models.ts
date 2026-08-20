import { Decimal } from './decimal-config.js';

/**
 * 料金プランの構造。JAでんき公式試算表（①〜⑥・au 各シート）の
 * 「シミュレーション結果明細」に実装されている計算パターンに対応する。
 */
export type PlanStructure =
  | 'tiered_minimum'   // 最低料金 + 3段階（従量電灯A/S、スマートコース、auでんきMプラン）
  | 'flat_rate'        // 0kWhから一律単価 + 最低月額料金（シンプルコース）
  | 'capacity_tiered'  // 契約kVA × 基本料金 + 0kWhからの3段階（従量電灯B）
  | 'demand_seasonal'  // 契約kW × 基本料金 + 季節別単価（低圧電力）
  | 'time_of_use'      // 基本料金 + 時間帯別単価（電化Style／ナイトホリデー／夜トクプラン）
  | 'demand_flat';     // 契約kW × 基本料金 + 一律単価（深夜電力B）

/** 出典情報。CLAUDE.md ルール4「出典のない単価を登録しない」を型で強制する。 */
export interface RateSource {
  document: string;
  locator: string;
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
 * 端数処理の適用箇所。事業者ごとに異なる。
 * 中国電力・JAでんきは切り捨て、auでんきは従量料金と燃調を切り上げる。
 */
export interface RoundingProfile {
  /** 従量料金合計（最低料金+段階小計）の丸め */
  energyTotal: 'none' | 'up' | 'down';
  /** 燃料費調整額小計の丸め */
  fuelSubtotal: 'none' | 'up' | 'down';
  /** 再エネ賦課金小計の丸め */
  levySubtotal: 'none' | 'down';
  /** 請求額の丸め */
  finalTotal: 'none' | 'down';
}

/** 中国電力・JAでんきの既定（すべて円未満切り捨て） */
export const CHUGOKU_ROUNDING: RoundingProfile = {
  energyTotal: 'none',
  fuelSubtotal: 'none',
  levySubtotal: 'down',
  finalTotal: 'down'
};

export interface FuelAdjustment {
  /** 15kWh までの定額（税込・円/契約）。15kWh の概念がない構造では使わない。 */
  minimumCharge: Decimal;
  /** 1kWh あたり（税込） */
  unitPriceYenPerKwh: Decimal;
}

export interface RenewableLevy {
  unitPriceYenPerKwh: Decimal;
}

interface PlanBase {
  planId: string;
  planName: string;
  /** 比較の左右どちらに置くか。'ja' は JAでんき、'other' は他社。 */
  side: 'ja' | 'other';
  sources: RateSource[];
  rounding: RoundingProfile;
}

/**
 * 最低料金 + 段階制。最低料金は「基本料金の代替」ではなく
 * 最初の minimumIncludedKwh 分を含む定額であり、従量料金はその超過分から始まる。
 */
export interface TieredMinimumPlan extends PlanBase {
  structure: 'tiered_minimum';
  minimumCharge: Decimal;
  minimumIncludedKwh: number;
  tiers: Tier[];
}

/** 0kWh から一律単価。(従量料金+燃調) が閾値未満なら最低月額料金を請求する。 */
export interface FlatRatePlan extends PlanBase {
  structure: 'flat_rate';
  unitPriceYenPerKwh: Decimal;
  minimumMonthlyThreshold: Decimal;
  minimumMonthlyBill: Decimal;
}

/**
 * 契約容量課金 + 0kWh からの段階制（従量電灯B）。
 * 段階の起点が 0kWh である点が tiered_minimum と異なる。
 */
export interface CapacityTieredPlan extends PlanBase {
  structure: 'capacity_tiered';
  /** 1kVA あたりの基本料金 */
  baseChargePerKva: Decimal;
  tiers: Tier[];
  /** 使用量 0 のとき基本料金単価を半額にする */
  halveBaseWhenNoUsage: boolean;
}

/** 契約電力課金 + 夏季／その他季の 2 単価（低圧電力）。 */
export interface DemandSeasonalPlan extends PlanBase {
  structure: 'demand_seasonal';
  baseChargePerKw: Decimal;
  summerUnitPriceYenPerKwh: Decimal;
  otherUnitPriceYenPerKwh: Decimal;
  halveBaseWhenNoUsage: boolean;
}

/** 時間帯の区分。公式試算表の 4 区分に対応する。 */
export type TouBand = 'dayOther' | 'daySummer' | 'night' | 'holiday';

/**
 * 時間帯別プラン（電化Style／ナイトホリデー／夜トクプラン）。
 * 基本料金は 10kW までが定額、超過分が 1kW あたりの従量。
 */
export interface TimeOfUsePlan extends PlanBase {
  structure: 'time_of_use';
  /** 10kW までの基本料金。null は元資料に記載がなく計算できないことを示す。 */
  baseChargeUpTo10Kw: Decimal | null;
  /** 10kW 超過分の 1kW あたり基本料金 */
  baseChargePerKwOver10: Decimal | null;
  unitPrices: Record<TouBand, Decimal>;
  halveBaseWhenNoUsage: boolean;
  /** 電化住宅割。基本料金+従量料金に対する割引率と上限額。 */
  allElectricDiscount: { rate: Decimal; capYen: Decimal } | null;
}

/** 契約電力課金 + 一律単価（深夜電力B）。使用量 0 のとき請求額全体が半額になる。 */
export interface DemandFlatPlan extends PlanBase {
  structure: 'demand_flat';
  baseChargePerKw: Decimal;
  unitPriceYenPerKwh: Decimal;
  halveTotalWhenNoUsage: boolean;
}

export type RatePlan =
  | TieredMinimumPlan
  | FlatRatePlan
  | CapacityTieredPlan
  | DemandSeasonalPlan
  | TimeOfUsePlan
  | DemandFlatPlan;

/**
 * 使用量の入力。プラン構造によって必要な項目が異なるため、
 * 足りない項目があれば計算せず unsupported を返す。
 */
export interface UsageInput {
  /** 総使用量 kWh。時間帯別では各区分の合計を使うため省略できる。 */
  totalKwh?: number;
  /** 低圧電力の季節別使用量 */
  seasonal?: { summerKwh: number; otherKwh: number };
  /** 時間帯別使用量 */
  tou?: Partial<Record<TouBand, number>>;
  /** 契約電力 kW（低圧電力・時間帯別・深夜電力B） */
  contractKw?: number;
  /** 契約容量 kVA（従量電灯B） */
  contractKva?: number;
  /** 電化住宅割の適用有無 */
  allElectricDiscount?: boolean;
}

export interface CalculationInput {
  usage: UsageInput;
  plan: RatePlan;
  fuelAdjustment: FuelAdjustment;
  renewableLevy: RenewableLevy;
}

/** 内訳の 1 行。画面と監査証跡の双方で使う。 */
export interface ChargeLine {
  label: string;
  /** 課金対象量（kWh / kW / kVA）。定額行は null。 */
  quantity: Decimal | null;
  unit: string;
  unitPrice: Decimal | null;
  amount: Decimal;
}

export interface MonthlyBill {
  planId: string;
  planName: string;
  /** 基本料金・最低料金の合計 */
  baseCharge: Decimal;
  /** 電力量料金の内訳 */
  lines: ChargeLine[];
  /** 電力量料金小計 */
  energySubtotal: Decimal;
  /** 基本料金 + 電力量料金（丸め適用後） */
  energyChargeTotal: Decimal;
  /** 電化住宅割などの割引（負の値） */
  discount: Decimal;
  fuelAdjustment: Decimal;
  renewableLevy: Decimal;
  /** 課金対象の総使用量 */
  totalKwh: Decimal;
  /** 最低月額料金・半額ルールなど、特記すべき適用があれば記録する */
  notes: string[];
  /** 請求額 */
  total: Decimal;
  formula: string;
  sources: RateSource[];
}

/** 計算不能。CLAUDE.md ルール8「未確認プランを推測計算しない」。 */
export interface UnsupportedResult {
  status: 'unsupported';
  reason: string;
  nextSteps: string[];
}

export type BillResult = { status: 'ok'; bill: MonthlyBill } | UnsupportedResult;
