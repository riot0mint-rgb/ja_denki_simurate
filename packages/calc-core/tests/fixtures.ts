import Decimal from 'decimal.js';
import { RatePlan, FuelAdjustmentEntry, RenewableLevyEntry } from '../src/models';

const jadenRatenA: RatePlan = {
  planId: 'ja_denki_raten_a',
  planName: 'JAでんき（従量電灯A）',
  contractType: 'household_standard',
  applicableUsage: '> 217 kWh/month',
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  baseCharge: {
    value: new Decimal('1500.00'),
    unit: 'per_month',
    sourceFile: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf'
  },
  minimumCharge: {
    value: new Decimal('1500.00'),
    unit: 'per_month',
    sourceFile: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf'
  },
  tiers: [
    {
      tierNumber: 1,
      startKwh: 0,
      endKwh: 15,
      unitPriceYenPerKwh: new Decimal('28.50'),
      sourceFile: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf',
      sourcePage: '3'
    },
    {
      tierNumber: 2,
      startKwh: 15,
      endKwh: 120,
      unitPriceYenPerKwh: new Decimal('23.61'),
      relativeToChugokuYenPerKwh: new Decimal('-1.39'),
      sourceFile: '広島市　JAでんき案内資料 r3.pptx',
      sourcePage: '17'
    },
    {
      tierNumber: 3,
      startKwh: 120,
      endKwh: 300,
      unitPriceYenPerKwh: new Decimal('25.00'),
      relativeToChugokuYenPerKwh: new Decimal('-2.71'),
      sourceFile: '広島市　JAでんき案内資料 r3.pptx',
      sourcePage: '17'
    },
    {
      tierNumber: 4,
      startKwh: 300,
      endKwh: null,
      unitPriceYenPerKwh: new Decimal('27.50'),
      sourceFile: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf',
      sourcePage: '3'
    }
  ],
  fuelAdjustment: {
    status: 'unconfirmed'
  },
  renewableLevy: {
    status: 'unconfirmed'
  },
  tax: {
    status: 'unconfirmed'
  },
  roundingRule: {
    method: 'round',
    unit: 'yen',
    sourceFile: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf',
    sourcePage: '6'
  },
  sources: [
    {
      document: '【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf',
      date: '2026-10-01',
      pageRange: '1-10',
      contains: ['base_charge', 'tier_prices', 'minimum_charge', 'rounding_rule']
    }
  ]
};

const jadenRatenS: RatePlan = {
  planId: 'ja_denki_raten_s',
  planName: 'JAでんき（従量電灯S）',
  contractType: 'household_low_usage',
  applicableUsage: '≤ 217 kWh/month',
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  baseCharge: {
    value: new Decimal('1410.24'),
    unit: 'per_month',
    relativeValue: new Decimal('-89.76'),
    sourceFile: '広島市　JAでんき案内資料 r3.pptx',
    sourcePage: '17'
  },
  minimumCharge: {
    value: new Decimal('1410.24'),
    unit: 'per_month'
  },
  tiers: [
    {
      tierNumber: 1,
      startKwh: 0,
      endKwh: null,
      unitPriceYenPerKwh: new Decimal('28.00'),
      sourceFile: '【中国】JAでんき従量電灯Ｓ料金メニュー定義書（低圧_家庭用）＜20261001＞.pdf',
      sourcePage: '2'
    }
  ],
  fuelAdjustment: {
    status: 'unconfirmed'
  },
  renewableLevy: {
    status: 'unconfirmed'
  },
  tax: {
    status: 'unconfirmed'
  },
  roundingRule: {
    method: 'round',
    unit: 'yen'
  },
  sources: [
    {
      document: '広島市　JAでんき案内資料 r3.pptx',
      date: '2026-06-23',
      pageRange: '17',
      contains: ['base_charge_relative', 'plan_description']
    }
  ]
};

const chugokuRatenA: RatePlan = {
  planId: 'chugoku_raten_a',
  planName: '中国電力（従量電灯A）',
  contractType: 'household_standard',
  applicableUsage: '> 217 kWh/month',
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  baseCharge: {
    value: new Decimal('1500.00'),
    unit: 'per_month'
  },
  minimumCharge: {
    value: new Decimal('1500.00'),
    unit: 'per_month'
  },
  tiers: [
    {
      tierNumber: 1,
      startKwh: 0,
      endKwh: 15,
      unitPriceYenPerKwh: new Decimal('28.50'),
      sourceFile: '中国電力料金メニュー定義書（参考値）'
    },
    {
      tierNumber: 2,
      startKwh: 15,
      endKwh: 120,
      unitPriceYenPerKwh: new Decimal('25.00'),
      sourceFile: '中国電力料金メニュー定義書（参考値）'
    },
    {
      tierNumber: 3,
      startKwh: 120,
      endKwh: 300,
      unitPriceYenPerKwh: new Decimal('27.71'),
      sourceFile: '中国電力料金メニュー定義書（参考値）'
    },
    {
      tierNumber: 4,
      startKwh: 300,
      endKwh: null,
      unitPriceYenPerKwh: new Decimal('30.00'),
      sourceFile: '中国電力料金メニュー定義書（参考値）'
    }
  ],
  fuelAdjustment: {
    status: 'unconfirmed'
  },
  renewableLevy: {
    status: 'unconfirmed'
  },
  tax: {
    status: 'unconfirmed'
  },
  roundingRule: {
    method: 'round',
    unit: 'yen'
  },
  sources: [
    {
      document: '中国電力料金メニュー定義書（参考値）',
      date: '2026-10-01',
      pageRange: '1-5',
      contains: ['tier_prices']
    }
  ]
};

export const fixtures = {
  jadenRatenA,
  jadenRatenS,
  chugokuRatenA,

  boundaryValues: [0, 1, 14, 15, 16, 119, 120, 121, 299, 300, 301, 900]
};
