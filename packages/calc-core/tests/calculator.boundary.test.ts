import Decimal from 'decimal.js';
import { BillingCalculator, CalculationInput } from '../src/calculator';
import { fixtures } from './fixtures';

describe('BillingCalculator - 境界値テスト', () => {
  const calculator = new BillingCalculator();

  describe('従量電灯A - 全12個の境界値', () => {
    fixtures.boundaryValues.forEach((usage) => {
      it(`${usage}kWh での計算が正確であること`, () => {
        const input: CalculationInput = {
          usageKwh: usage,
          plan: fixtures.jadenRatenA
        };

        const result = calculator.calculateMonthlyBill(input);

        // 基本チェック
        expect(result.afterRounding).toBeInstanceOf(Decimal);
        expect(result.afterRounding.greaterThanOrEqualTo('0')).toBe(true);

        // 合計 ≥ 基本料金
        expect(result.afterRounding.greaterThanOrEqualTo(fixtures.jadenRatenA.baseCharge.value!)).toBe(true);

        // 四捨五入済み
        expect(result.afterRounding.decimalPlaces()).toBeLessThanOrEqual(0);
      });
    });

    it('0kWh 時に最低料金が適用されること', () => {
      const input: CalculationInput = {
        usageKwh: 0,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      expect(result.afterRounding).toEqual(fixtures.jadenRatenA.minimumCharge.value!);
    });

    it('15kWh 時に段階1のみで計算されること', () => {
      const input: CalculationInput = {
        usageKwh: 15,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      // 15 kWh × 28.50 = 427.50 + 基本料金 1500 = 1927.50 → 1928円
      expect(result.tier2.isZero()).toBe(true);
      expect(result.tier3.isZero()).toBe(true);
    });

    it('16kWh 時に段階1と段階2が計算されること', () => {
      const input: CalculationInput = {
        usageKwh: 16,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      expect(result.tier1.greaterThan(0)).toBe(true);
      expect(result.tier2.greaterThan(0)).toBe(true);
    });

    it('120kWh 時に段階2の上限に達すること', () => {
      const input: CalculationInput = {
        usageKwh: 120,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      // 段階2: (120-15) × 23.61 = 105 × 23.61 = 2478.90
      expect(result.tier3.isZero()).toBe(true);
    });

    it('121kWh 時に段階3が開始されること', () => {
      const input: CalculationInput = {
        usageKwh: 121,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      expect(result.tier3.greaterThan(0)).toBe(true);
    });

    it('300kWh 時に段階3の上限に達すること', () => {
      const input: CalculationInput = {
        usageKwh: 300,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      // 段階4は0
      expect(result.tier4.isZero()).toBe(true);
    });

    it('301kWh 時に段階4が開始されること', () => {
      const input: CalculationInput = {
        usageKwh: 301,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);
      expect(result.tier4.greaterThan(0)).toBe(true);
    });

    it('900kWh での計算が営業資料の削減率（3-5%）と合致すること', () => {
      const inputJaden: CalculationInput = {
        usageKwh: 900,
        plan: fixtures.jadenRatenA
      };

      const inputChugoku: CalculationInput = {
        usageKwh: 900,
        plan: fixtures.chugokuRatenA
      };

      const jadenBill = calculator.calculateMonthlyBill(inputJaden);
      const chugokuBill = calculator.calculateMonthlyBill(inputChugoku);

      const difference = chugokuBill.afterRounding.minus(jadenBill.afterRounding);
      const percent = difference.dividedBy(chugokuBill.afterRounding).times(100);

      // 3% ≤ 削減率 ≤ 5%
      expect(percent.greaterThanOrEqualTo('3')).toBe(true);
      expect(percent.lessThanOrEqualTo('5')).toBe(true);
    });
  });

  describe('従量電灯S - プラン選択分岐点の前後', () => {
    it('216kWh 時に従量電灯S を選択すべきであること', () => {
      const inputS: CalculationInput = {
        usageKwh: 216,
        plan: fixtures.jadenRatenS
      };

      const inputA: CalculationInput = {
        usageKwh: 216,
        plan: fixtures.jadenRatenA
      };

      const billS = calculator.calculateMonthlyBill(inputS);
      const billA = calculator.calculateMonthlyBill(inputA);

      // S の方が安いはず
      expect(billS.afterRounding.lessThanOrEqualTo(billA.afterRounding)).toBe(true);
    });

    it('217kWh で両プランがほぼ同額であること（分岐点）', () => {
      const inputS: CalculationInput = {
        usageKwh: 217,
        plan: fixtures.jadenRatenS
      };

      const inputA: CalculationInput = {
        usageKwh: 217,
        plan: fixtures.jadenRatenA
      };

      const billS = calculator.calculateMonthlyBill(inputS);
      const billA = calculator.calculateMonthlyBill(inputA);

      const diff = billS.afterRounding.minus(billA.afterRounding).abs();

      // 5円以内の差
      expect(diff.lessThanOrEqualTo('5')).toBe(true);
    });

    it('218kWh 以上で従量電灯A を選択すべきであること', () => {
      const inputS: CalculationInput = {
        usageKwh: 218,
        plan: fixtures.jadenRatenS
      };

      const inputA: CalculationInput = {
        usageKwh: 218,
        plan: fixtures.jadenRatenA
      };

      const billS = calculator.calculateMonthlyBill(inputS);
      const billA = calculator.calculateMonthlyBill(inputA);

      // A の方が安いはず
      expect(billA.afterRounding.lessThanOrEqualTo(billS.afterRounding)).toBe(true);
    });
  });

  describe('端数処理の正確性', () => {
    it('四捨五入により正確に処理されること', () => {
      const input: CalculationInput = {
        usageKwh: 50,
        plan: fixtures.jadenRatenA
      };

      const result = calculator.calculateMonthlyBill(input);

      // 小数点以下が切り捨てられていること
      expect(result.afterRounding.decimalPlaces()).toBeLessThanOrEqualTo(0);
      expect(result.afterRounding.toNumber() % 1).toBe(0);
    });
  });
});
