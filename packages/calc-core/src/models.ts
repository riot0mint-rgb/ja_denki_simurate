import Decimal from 'decimal.js';

export interface MonthlyBill {
  minimumCharge: Decimal;
  tier1: Decimal;
  tier2: Decimal;
  tier3: Decimal;
  tier4: Decimal;
  fuelAdjustment: Decimal;
  renewableLevy: Decimal;
  subtotal: Decimal;
  beforeRounding: Decimal;
  afterRounding: Decimal;
  roundingMethod: 'floor' | 'round' | 'ceil';
  formula: string;
  rateReference: string;
  sourceFile: string;
  verificationStatus: 'verified' | 'unverified' | 'partial';
}

export interface Tier {
  tierNumber: number;
  startKwh: number;
  endKwh: number | null;
  unitPriceYenPerKwh: Decimal;
  relativeToChugokuYenPerKwh?: Decimal;
  sourceFile?: string;
  sourcePage?: string;
  sourceEffectiveDate?: string;
}

export interface RatePlan {
  planId: string;
  planName: string;
  contractType: string;
  applicableUsage: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  baseCharge: {
    value: Decimal | null;
    unit: 'per_month';
    relativeValue?: Decimal;
    sourceFile?: string;
    sourcePage?: string;
  };
  minimumCharge: {
    value: Decimal | null;
    unit: 'per_month';
    sourceFile?: string;
    sourcePage?: string;
  };
  tiers: Tier[];
  fuelAdjustment: {
    status: 'confirmed' | 'unconfirmed' | 'none';
    sourceFile?: string;
  };
  renewableLevy: {
    status: 'confirmed' | 'unconfirmed' | 'none';
    sourceFile?: string;
  };
  tax: {
    status: 'confirmed' | 'unconfirmed';
    sourceFile?: string;
  };
  roundingRule: {
    method: 'floor' | 'round' | 'ceil';
    unit: 'yen' | 'ten_yen';
    sourceFile?: string;
    sourcePage?: string;
  };
  sources: Array<{
    document: string;
    date: string;
    pageRange: string;
    contains: string[];
  }>;
}

export interface FuelAdjustmentEntry {
  planId: string;
  method: 'multiplicative' | 'additive' | 'none';
  unitPriceYenPerKwh?: Decimal;
  sourceFile?: string;
  sourceEffectiveDate?: string;
}

export interface RenewableLevyEntry {
  planId: string;
  unitPriceYenPerKwh?: Decimal;
  sourceFile?: string;
  sourceEffectiveDate?: string;
}

export interface CalculationInput {
  usageKwh: number;
  plan: RatePlan;
  fuelAdjustment?: FuelAdjustmentEntry;
  renewableLevy?: RenewableLevyEntry;
  contractAmperage?: number;
}

export interface ComparisonResult {
  currentProviderPlan: string;
  currentProviderMonthlyCharge: Decimal;
  jadenBill: Decimal;
  monthlyDifference: Decimal;
  monthlyDifferencePercent: Decimal;
  annualDifference: Decimal;
  campaignDiscount?: Decimal;
  campaignNetDifference?: Decimal;
  details: {
    currentBill: MonthlyBill;
    jadenBill: MonthlyBill;
  };
}
