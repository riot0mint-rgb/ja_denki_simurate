import { Decimal } from './decimal-config.js';
import { CalendarInput } from './touAllocation.js';

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
  | 'demand_flat'      // 契約kW × 基本料金 + 一律単価（深夜電力B）
  | 'family_time'      // 契約kVA × 基本料金 + 4区分 + 電化住宅割（ファミリータイムⅠ/Ⅱ）
  | 'economy_night';   // 契約kVA × 基本料金 + 昼間3段階 + 夜間（時間帯別電灯）

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

/** 最低月額料金。従量料金と燃料費調整額の合計が threshold 未満なら bill を請求する。 */
export interface MinimumMonthly {
  threshold: Decimal;
  bill: Decimal;
}

/**
 * 時間帯別プラン（電化Style／ナイトホリデー／夜トクプラン）。
 *
 * 課金の土台は 2 通りある。どちらか一方だけを持つ。
 *
 * - **基本料金型**（電化Style・夜トクプラン）: 10kW までが定額、超過分が 1kW あたりの従量。
 *   契約電力の入力が要る。
 * - **最低月額料金型**（ナイトホリデー）: 基本料金を持たず、従量料金と燃料費調整額の
 *   合計が最低月額料金に満たない月だけ最低月額料金を請求する。契約電力の入力は不要。
 *
 * 中国電力の単価表でナイトホリデーコースだけ体系が違う。公式試算表の明細シートで
 * 中国電力側の基本料金欄が空欄なのは記載漏れではなく、そこに入る金額が存在しないため。
 */
export interface TimeOfUsePlan extends PlanBase {
  structure: 'time_of_use';
  /** 10kW までの基本料金。最低月額料金型では null。 */
  baseChargeUpTo10Kw: Decimal | null;
  /** 10kW 超過分の 1kW あたり基本料金。最低月額料金型では null。 */
  baseChargePerKwOver10: Decimal | null;
  /** 最低月額料金。基本料金型では null。 */
  minimumMonthly: MinimumMonthly | null;
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

/** ファミリータイムの時間帯区分 */
export type FamilyBand = 'daySummer' | 'dayOther' | 'family' | 'night';

/**
 * ファミリータイムⅠ/Ⅱ（中国電力の旧オール電化プラン。新規受付停止）。
 * 出典: ④「ファミリーⅠ結果」「ファミリーⅡ結果」
 */
export interface FamilyTimePlan extends PlanBase {
  structure: 'family_time';
  baseChargeUpTo10Kva: Decimal;
  baseChargePerKvaOver10: Decimal;
  unitPrices: Record<FamilyBand, Decimal>;
  /** 電化住宅割。基本料金+電力量料金に対する定率割引と上限額。 */
  allElectricDiscount: { rate: Decimal; capYen: Decimal } | null;
}

/**
 * 時間帯別電灯（エコノミーナイト。新規受付停止）。
 * 昼間時間だけが 3 段階の従量制で、夜間は一律単価。
 * 出典: ④「時間帯別結果」
 */
export interface EconomyNightPlan extends PlanBase {
  structure: 'economy_night';
  baseChargeUpTo10Kva: Decimal;
  baseChargePerKvaOver10: Decimal;
  /** 昼間時間の段階（0kWh起点） */
  dayTiers: Tier[];
  nightUnitPriceYenPerKwh: Decimal;
  /** 使用量が0kWhの月は基本料金が半額になるか */
  halveBaseWhenNoUsage: boolean;
}

export type RatePlan =
  | TieredMinimumPlan
  | FlatRatePlan
  | CapacityTieredPlan
  | DemandSeasonalPlan
  | TimeOfUsePlan
  | DemandFlatPlan
  | FamilyTimePlan
  | EconomyNightPlan;

/**
 * 使用量。利用者の入力は number、振替で算出した値は Decimal で渡る。
 * Decimal を number に落とすと丸め誤差が入るため、そのまま受け取れるようにしてある。
 */
export type UsageAmount = number | Decimal;

/**
 * 使用量の入力。プラン構造によって必要な項目が異なるため、
 * 足りない項目があれば計算せず unsupported を返す。
 */
export interface UsageInput {
  /** 総使用量 kWh。時間帯別では各区分の合計を使うため省略できる。 */
  totalKwh?: number;
  /** 低圧電力の季節別使用量 */
  seasonal?: { summerKwh: number; otherKwh: number };
  /**
   * 時間帯別使用量。振替で算出した値は Decimal のまま渡せる。
   * number に落とすと丸め誤差が入り、賦課金の切り捨てが1円ずれる（ルール2）。
   */
  tou?: Partial<Record<TouBand, UsageAmount>>;
  /** ファミリータイムの時間帯別使用量 */
  familyTime?: Partial<Record<FamilyBand, UsageAmount>>;
  /** 時間帯別電灯の昼間・夜間使用量 */
  economyNight?: { dayKwh: UsageAmount; nightKwh: UsageAmount };
  /** 検針期間の日数内訳。夜トクへの時間帯振替に使う。 */
  calendar?: CalendarInput;
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
  /**
   * 最低月額料金で請求額を置き換えたか。
   *
   * true のとき、上の内訳（energySubtotal / fuelAdjustment / renewableLevy）は
   * **請求された額ではなく、閾値判定に使った計算過程**である。
   * 足しても total にはならない。監査でこの内訳を使うときは必ず見ること。
   */
  minimumMonthlyApplied: boolean;
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
