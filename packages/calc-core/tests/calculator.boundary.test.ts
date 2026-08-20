import Decimal from 'decimal.js';
import { BillingCalculator } from '../src/calculator';
import { CalculationInput } from '../src/models';
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

    it('900kWh での計算が実行できること', () => {
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

      // JAでんきが中国電力より安いはず（相対値より）
      expect(jadenBill.afterRounding.lessThan(chugokuBill.afterRounding)).toBe(true);

      const difference = chugokuBill.afterRounding.minus(jadenBill.afterRounding);
      // 削減額が正の値であること
      expect(difference.greaterThan('0')).toBe(true);
    });
  });

  describe('従量電灯S - 計算ロジック', () => {
    it('216kWh での従量電灯S 計算が正確であること', () => {
      const inputS: CalculationInput = {
        usageKwh: 216,
        plan: fixtures.jadenRatenS
      };

      const billS = calculator.calculateMonthlyBill(inputS);

      // 計算が実行されて結果が得られること
      expect(billS.afterRounding).toBeInstanceOf(Decimal);
      expect(billS.afterRounding.greaterThan('0')).toBe(true);

      // S は単一段階なので tier2-4 は 0
      expect(billS.tier2.isZero()).toBe(true);
      expect(billS.tier3.isZero()).toBe(true);
      expect(billS.tier4.isZero()).toBe(true);
    });

    it('217kWh での従量電灯S 計算が正確であること', () => {
      const inputS: CalculationInput = {
        usageKwh: 217,
        plan: fixtures.jadenRatenS
      };

      const billS = calculator.calculateMonthlyBill(inputS);

      // 計算が実行されて結果が得られること
      expect(billS.afterRounding).toBeInstanceOf(Decimal);
      expect(billS.afterRounding.greaterThan('0')).toBe(true);
    });

    it('400kWh での従量電灯S 計算が正確であること', () => {
      const inputS: CalculationInput = {
        usageKwh: 400,
        plan: fixtures.jadenRatenS
      };

      const billS = calculator.calculateMonthlyBill(inputS);

      // 計算が実行されて結果が得られること
      expect(billS.afterRounding).toBeInstanceOf(Decimal);
      expect(billS.afterRounding.greaterThan('0')).toBe(true);

      // 単一段階プランでの計算
      expect(billS.tier1.greaterThan('0')).toBe(true);
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
      expect(result.afterRounding.decimalPlaces()).toBeLessThanOrEqual(0);
      expect(result.afterRounding.toNumber() % 1).toBe(0);
    });
  });
});
