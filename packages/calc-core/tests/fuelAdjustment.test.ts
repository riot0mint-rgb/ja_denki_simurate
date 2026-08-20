import Decimal from 'decimal.js';
import { calculateFuelAdjustment, describeFuelAdjustment } from '../src/fuelAdjustment';
import { FuelAdjustmentEntry } from '../src/models';

describe('FuelAdjustment - 燃料費調整', () => {
  describe('調整なしの場合', () => {
    it('undefined の場合は 0 円を返すこと', () => {
      const result = calculateFuelAdjustment(new Decimal('8000'), 300, undefined);
      expect(result).toEqual(new Decimal('0'));
    });

    it('method が none の場合は 0 円を返すこと', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'none'
      };
      const result = calculateFuelAdjustment(new Decimal('8000'), 300, adjustment);
      expect(result).toEqual(new Decimal('0'));
    });

    it('unitPriceYenPerKwh が未定義の場合は 0 円を返すこと', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'multiplicative'
      };
      const result = calculateFuelAdjustment(new Decimal('8000'), 300, adjustment);
      expect(result).toEqual(new Decimal('0'));
    });
  });

  describe('使用量ベースの調整（multiplicative）', () => {
    it('使用量に調整単価を乗じて計算すること', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'multiplicative',
        unitPriceYenPerKwh: new Decimal('1.50')
      };
      const result = calculateFuelAdjustment(new Decimal('8000'), 300, adjustment);
      // 300 × 1.50 = 450
      expect(result).toEqual(new Decimal('450'));
    });

    it('使用量 0 の場合は 0 円になること', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'multiplicative',
        unitPriceYenPerKwh: new Decimal('1.50')
      };
      const result = calculateFuelAdjustment(new Decimal('1500'), 0, adjustment);
      expect(result).toEqual(new Decimal('0'));
    });
  });

  describe('料金ベースの調整（additive）', () => {
    it('小計に調整単価を乗じて計算すること', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'additive',
        unitPriceYenPerKwh: new Decimal('0.05')
      };
      const result = calculateFuelAdjustment(new Decimal('8000'), 300, adjustment);
      // 8000 × 0.05 = 400
      expect(result).toEqual(new Decimal('400'));
    });
  });

  describe('説明の生成', () => {
    it('調整なしの説明を生成すること', () => {
      const result = describeFuelAdjustment(undefined, new Decimal('0'));
      expect(result).toBe('燃料費調整: 0円');
    });

    it('multiplicative 調整の説明を生成すること', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'multiplicative',
        unitPriceYenPerKwh: new Decimal('1.50')
      };
      const result = describeFuelAdjustment(adjustment, new Decimal('450'));
      expect(result).toContain('使用量ベース');
      expect(result).toContain('450.00');
    });

    it('additive 調整の説明を生成すること', () => {
      const adjustment: FuelAdjustmentEntry = {
        planId: 'test',
        method: 'additive',
        unitPriceYenPerKwh: new Decimal('0.05')
      };
      const result = describeFuelAdjustment(adjustment, new Decimal('400'));
      expect(result).toContain('料金ベース');
      expect(result).toContain('400.00');
    });
  });
});
