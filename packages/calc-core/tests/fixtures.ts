import { Decimal } from '../src/decimal-config';
import { FlatRatePlan, FuelAdjustment, RateSource, RenewableLevy, TieredMinimumPlan } from '../src/models';

/**
 * テスト用の単価。すべて
 * 「①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx」からの転記であり、
 * 本番データ (apps/web/src/data/rates.ts) と同一の値を使う。
 */
const SOURCE_FILE = '①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年4月適用.xlsx';

function source(locator: string): RateSource {
  return {
    document: SOURCE_FILE,
    locator,
    effectiveFrom: '2026-04',
    verificationStatus: 'verified',
    verifiedAt: '2026-08-20'
  };
}

function tiers(t1: string, t2: string, t3: string) {
  return [
    { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: new Decimal(t1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(t2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(t3) }
  ];
}

export const chugokuJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_juryo_a',
  planName: '中国電力 従量電灯A',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: 15,
  tiers: tiers('32.75', '39.43', '41.55'),
  sources: [source('基本項目!E8:E11')]
};

export const chugokuSmart: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'chugoku_smart',
  planName: '中国電力 スマートコース',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: 15,
  tiers: tiers('32.01', '39.43', '41.55'),
  sources: [source('基本項目!E46:E49')]
};

export const chugokuSimple: FlatRatePlan = {
  structure: 'flat_rate',
  planId: 'chugoku_simple',
  planName: '中国電力 シンプルコース',
  unitPriceYenPerKwh: new Decimal('38.21'),
  minimumMonthlyThreshold: new Decimal('1844.7'),
  minimumMonthlyBill: new Decimal('1845'),
  sources: [source('基本項目!E52:E55')]
};

export const jaDenkiJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_a',
  planName: 'JAでんき 従量電灯A',
  minimumCharge: new Decimal('759.68'),
  minimumIncludedKwh: 15,
  tiers: tiers('32.22', '38.04', '38.84'),
  sources: [source('基本項目!E26:E29')]
};

export const jaDenkiJuryoS: TieredMinimumPlan = {
  structure: 'tiered_minimum',
  planId: 'ja_denki_juryo_s',
  planName: 'JAでんき 従量電灯S',
  minimumCharge: new Decimal('669.92'),
  minimumIncludedKwh: 15,
  tiers: tiers('31.79', '39.43', '41.44'),
  sources: [source('基本項目!E58:E61')]
};

/** 2026年4月適用（基本項目!L7 / L21） */
export const fuelAdjustment: FuelAdjustment = {
  minimumCharge: new Decimal('-171.12'),
  unitPriceYenPerKwh: new Decimal('-11.39')
};

/** 2026年4月適用（基本項目!L38） */
export const renewableLevy: RenewableLevy = {
  unitPriceYenPerKwh: new Decimal('3.98')
};
