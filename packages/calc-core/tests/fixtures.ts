import { Decimal } from '../src/decimal-config';
import {
  CHUGOKU_ROUNDING,
  CapacityTieredPlan,
  EconomyNightPlan,
  FamilyTimePlan,
  DemandFlatPlan,
  DemandSeasonalPlan,
  FlatRatePlan,
  RateSource,
  RoundingProfile,
  TieredMinimumPlan,
  TimeOfUsePlan
} from '../src/models';

/** 単価はすべて公式試算表 26年7月適用版からの転記。本番データと同一の値を使う。 */
function src(document: string, locator: string): RateSource {
  return {
    document,
    locator,
    effectiveFrom: '2026-07',
    verificationStatus: 'verified',
    verifiedAt: '2026-08-20'
  };
}

const AU_ROUNDING: RoundingProfile = {
  energyTotal: 'up',
  fuelSubtotal: 'up',
  levySubtotal: 'down',
  finalTotal: 'none'
};
const JURYO_B_ROUNDING: RoundingProfile = { ...CHUGOKU_ROUNDING, levySubtotal: 'none' };

function tiers15(t1: string, t2: string, t3: string) {
  return [
    { tierNumber: 1, startKwh: 15, endKwh: 120, unitPriceYenPerKwh: new Decimal(t1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(t2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(t3) }
  ];
}
function tiers0(t1: string, t2: string, t3: string) {
  return [
    { tierNumber: 1, startKwh: 0, endKwh: 120, unitPriceYenPerKwh: new Decimal(t1) },
    { tierNumber: 2, startKwh: 120, endKwh: 300, unitPriceYenPerKwh: new Decimal(t2) },
    { tierNumber: 3, startKwh: 300, endKwh: null, unitPriceYenPerKwh: new Decimal(t3) }
  ];
}
function touPrices(dayOther: string, daySummer: string, night: string, holiday: string) {
  return {
    dayOther: new Decimal(dayOther),
    daySummer: new Decimal(daySummer),
    night: new Decimal(night),
    holiday: new Decimal(holiday)
  };
}

const D1 = '①JAでんき試算表(VS中電_従量A・スマート・シンプル)26年7月適用.xlsx';
const D2 = '②JAでんき試算表(VS中電_従量B)26年7月適用.xlsx';
const D3 = '③JAでんき試算表(VS中電_電化Style・ナイトホリデー)26年7月適用.xlsx';
const D5 = '⑤JAでんき試算表(VS中電_低圧電力)26年7月適用.xlsx';
const D6 = '⑥JAでんき試算表(VS深夜電力B)26年7月適用.xlsx';
const DAU = '☆JAでんき試算表(VS auでんき_Ｍプラン)26年6月.xlsx';

export const chugokuJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum', planId: 'chugoku_juryo_a', planName: '中国電力 従量電灯A', side: 'other',
  minimumCharge: new Decimal('759.68'), minimumIncludedKwh: 15,
  tiers: tiers15('32.75', '39.43', '41.55'), rounding: CHUGOKU_ROUNDING,
  sources: [src(D1, '基本項目!E8:E11')]
};
export const chugokuSmart: TieredMinimumPlan = {
  structure: 'tiered_minimum', planId: 'chugoku_smart', planName: '中国電力 スマートコース', side: 'other',
  minimumCharge: new Decimal('669.92'), minimumIncludedKwh: 15,
  tiers: tiers15('32.01', '39.43', '41.55'), rounding: CHUGOKU_ROUNDING,
  sources: [src(D1, '基本項目!E46:E49')]
};
export const chugokuSimple: FlatRatePlan = {
  structure: 'flat_rate', planId: 'chugoku_simple', planName: '中国電力 シンプルコース', side: 'other',
  unitPriceYenPerKwh: new Decimal('38.21'),
  minimumMonthlyThreshold: new Decimal('1844.7'), minimumMonthlyBill: new Decimal('1845'),
  rounding: CHUGOKU_ROUNDING, sources: [src(D1, '基本項目!E52:E55')]
};
export const auMPlan: TieredMinimumPlan = {
  structure: 'tiered_minimum', planId: 'au_m_plan', planName: 'auでんき Mプラン', side: 'other',
  minimumCharge: new Decimal('759.67'), minimumIncludedKwh: 15,
  tiers: tiers15('32.74', '39.42', '41.54'), rounding: AU_ROUNDING,
  sources: [src(DAU, "'ａｕ＿Ｍプラン料金早見表'!E5:E8")]
};
export const jaDenkiJuryoA: TieredMinimumPlan = {
  structure: 'tiered_minimum', planId: 'ja_denki_juryo_a', planName: 'JAでんき 従量電灯A', side: 'ja',
  minimumCharge: new Decimal('759.68'), minimumIncludedKwh: 15,
  tiers: tiers15('32.22', '38.04', '38.84'), rounding: CHUGOKU_ROUNDING,
  sources: [src(D1, '基本項目!E26:E29')]
};
export const jaDenkiJuryoS: TieredMinimumPlan = {
  structure: 'tiered_minimum', planId: 'ja_denki_juryo_s', planName: 'JAでんき 従量電灯S', side: 'ja',
  minimumCharge: new Decimal('669.92'), minimumIncludedKwh: 15,
  tiers: tiers15('31.79', '39.43', '41.44'), rounding: CHUGOKU_ROUNDING,
  sources: [src(D1, '基本項目!E58:E61')]
};
export const chugokuJuryoB: CapacityTieredPlan = {
  structure: 'capacity_tiered', planId: 'chugoku_juryo_b', planName: '中国電力 従量電灯B', side: 'other',
  baseChargePerKva: new Decimal('447.97'), tiers: tiers0('30.06', '36.15', '38.02'),
  halveBaseWhenNoUsage: true, rounding: JURYO_B_ROUNDING, sources: [src(D2, '基本項目!E14:E17')]
};
export const jaDenkiJuryoB: CapacityTieredPlan = {
  structure: 'capacity_tiered', planId: 'ja_denki_juryo_b', planName: 'JAでんき 従量電灯B', side: 'ja',
  baseChargePerKva: new Decimal('447.97'), tiers: tiers0('30.06', '35.41', '36.71'),
  halveBaseWhenNoUsage: true, rounding: JURYO_B_ROUNDING, sources: [src(D2, '基本項目!E32:E35')]
};
export const chugokuLowVoltage: DemandSeasonalPlan = {
  structure: 'demand_seasonal', planId: 'chugoku_low_voltage', planName: '中国電力 低圧電力', side: 'other',
  baseChargePerKw: new Decimal('1163.92'),
  summerUnitPriceYenPerKwh: new Decimal('26.80'), otherUnitPriceYenPerKwh: new Decimal('25.51'),
  halveBaseWhenNoUsage: true, rounding: CHUGOKU_ROUNDING, sources: [src(D5, '基本項目!E20:E22')]
};
export const jaDenkiLowVoltage: DemandSeasonalPlan = {
  structure: 'demand_seasonal', planId: 'ja_denki_low_voltage', planName: 'JAでんき 低圧電力', side: 'ja',
  baseChargePerKw: new Decimal('1132.83'),
  summerUnitPriceYenPerKwh: new Decimal('26.80'), otherUnitPriceYenPerKwh: new Decimal('25.51'),
  halveBaseWhenNoUsage: true, rounding: CHUGOKU_ROUNDING, sources: [src(D5, '基本項目!E38:E40')]
};
export const chugokuDenkaStyle: TimeOfUsePlan = {
  structure: 'time_of_use', planId: 'chugoku_denka_style', planName: '中国電力 電化Style', side: 'other',
  baseChargeUpTo10Kw: new Decimal('2018.72'), baseChargePerKwOver10: new Decimal('480.37'),
  minimumMonthly: null,
  unitPrices: touPrices('44.40', '46.46', '30.35', '30.35'),
  halveBaseWhenNoUsage: true, allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING, sources: [src(D3, '基本項目!E46:E51')]
};
export const chugokuNightHoliday: TimeOfUsePlan = {
  structure: 'time_of_use', planId: 'chugoku_night_holiday', planName: '中国電力 ナイトホリデー', side: 'other',
  baseChargeUpTo10Kw: null, baseChargePerKwOver10: null,
  minimumMonthly: { threshold: new Decimal('1844.7'), bill: new Decimal('1845') },
  unitPrices: touPrices('46.98', '49.44', '34.65', '34.65'),
  halveBaseWhenNoUsage: true, allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING, sources: [src(D3, '基本項目!S62:S65')]
};
export const jaDenkiYotoku: TimeOfUsePlan = {
  structure: 'time_of_use', planId: 'ja_denki_yotoku', planName: 'JAでんき 夜トクプラン', side: 'ja',
  baseChargeUpTo10Kw: new Decimal('1897.72'), baseChargePerKwOver10: new Decimal('458.37'),
  minimumMonthly: null,
  unitPrices: touPrices('44.40', '46.46', '30.35', '30.35'),
  halveBaseWhenNoUsage: true, allElectricDiscount: null,
  rounding: CHUGOKU_ROUNDING, sources: [src(D3, '基本項目!L46:L51')]
};
export const chugokuMidnightB: DemandFlatPlan = {
  structure: 'demand_flat', planId: 'chugoku_midnight_b', planName: '中国電力 深夜電力B', side: 'other',
  baseChargePerKw: new Decimal('375.92'), unitPriceYenPerKwh: new Decimal('30.34'),
  halveTotalWhenNoUsage: true, rounding: CHUGOKU_ROUNDING, sources: [src(D6, "'深夜電力B'!F7:F8")]
};


const D4 = '④JAでんき試算表(VS中電_ファミリー①②・時間帯別)26年7月適用.xlsx';

/** 電化住宅割は基本料金+電力量料金の 8%、上限 3,300円（④結果シート H15） */
const ALL_ELECTRIC_DISCOUNT = { rate: new Decimal('0.08'), capYen: new Decimal('3300') };

function familyPrices(daySummer: string, dayOther: string, family: string, night: string) {
  return {
    daySummer: new Decimal(daySummer),
    dayOther: new Decimal(dayOther),
    family: new Decimal(family),
    night: new Decimal(night)
  };
}

export const chugokuFamilyTime1: FamilyTimePlan = {
  structure: 'family_time', planId: 'chugoku_family_1', planName: '中国電力 ファミリータイムⅠ', side: 'other',
  baseChargeUpTo10Kva: new Decimal('2577.10'), baseChargePerKvaOver10: new Decimal('481.77'),
  unitPrices: familyPrices('47.38', '42.57', '42.33', '30.34'),
  allElectricDiscount: ALL_ELECTRIC_DISCOUNT,
  rounding: CHUGOKU_ROUNDING, sources: [src(D4, "'ファミリーⅠ結果'!H7,E8,E10:E13")]
};

export const chugokuFamilyTime2: FamilyTimePlan = {
  structure: 'family_time', planId: 'chugoku_family_2', planName: '中国電力 ファミリータイムⅡ', side: 'other',
  baseChargeUpTo10Kva: new Decimal('1587.10'), baseChargePerKvaOver10: new Decimal('481.77'),
  unitPrices: familyPrices('50.71', '45.58', '45.34', '30.34'),
  allElectricDiscount: ALL_ELECTRIC_DISCOUNT,
  rounding: CHUGOKU_ROUNDING, sources: [src(D4, "'ファミリーⅡ結果'!H7,E8,E10:E13")]
};

export const chugokuEconomyNight: EconomyNightPlan = {
  structure: 'economy_night', planId: 'chugoku_economy_night', planName: '中国電力 時間帯別電灯（エコノミーナイト）', side: 'other',
  baseChargeUpTo10Kva: new Decimal('1578.72'), baseChargePerKvaOver10: new Decimal('480.37'),
  dayTiers: [
    { tierNumber: 1, startKwh: 0, endKwh: 90, unitPriceYenPerKwh: new Decimal('38.22') },
    { tierNumber: 2, startKwh: 90, endKwh: 220, unitPriceYenPerKwh: new Decimal('43.82') },
    { tierNumber: 3, startKwh: 220, endKwh: null, unitPriceYenPerKwh: new Decimal('44.86') }
  ],
  nightUnitPriceYenPerKwh: new Decimal('30.34'),
  rounding: CHUGOKU_ROUNDING, sources: [src(D4, "'時間帯別結果'!I7,F8,F11:F14")]
};
