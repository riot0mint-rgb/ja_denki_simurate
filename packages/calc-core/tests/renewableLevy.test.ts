import Decimal from 'decimal.js';
import { calculateRenewableLevy, describeRenewableLevy } from '../src/renewableLevy';
import { RenewableLevyEntry } from '../src/models';

describe('RenewableLevy - 再エネ賦課金', () => {
  describe('賦課金なしの場合', () => {
    it('undefined の場合は 0 円を返すこと', () => {
      const result = calculateRenewableLevy(300, undefined);
      expect(result).toEqual(new Decimal('0'));
    });

    it('unitPriceYenPerKwh が未定義の場合は 0 円を返すこと', () => {
      const levy: RenewableLevyEntry = {
        planId: 'test'
      };
      const result = calculateRenewableLevy(300, levy);
      expect(result).toEqual(new Decimal('0'));
    });
  });

  describe('再エネ賦課金の計算', () => {
    it('使用量に賦課金単価を乗じて計算すること', () => {
      const levy: RenewableLevyEntry = {
        planId: 'test',
        unitPriceYenPerKwh: new Decimal('2.97')
      };
      const result = calculateRenewableLevy(300, levy);
      // 300 × 2.97 = 891
      expect(result).toEqual(new Decimal('891'));
    });

    it('使用量 0 の場合は 0 円になること', () => {
      const levy: RenewableLevyEntry = {
        planId: 'test',
        unitPriceYenPerKwh: new Decimal('2.97')
      };
      const result = calculateRenewableLevy(0, levy);
      expect(result).toEqual(new Decimal('0'));
    });

    it('900 kWh での計算が正確であること', () => {
      const levy: RenewableLevyEntry = {
        planId: 'test',
        unitPriceYenPerKwh: new Decimal('2.97')
      };
      const result = calculateRenewableLevy(900, levy);
      // 900 × 2.97 = 2673
      expect(result).toEqual(new Decimal('2673'));
    });
  });

  describe('説明の生成', () => {
    it('賦課金なしの説明を生成すること', () => {
      const result = describeRenewableLevy(undefined, new Decimal('0'));
      expect(result).toBe('再エネ賦課金: 0円');
    });

    it('賦課金ありの説明を生成すること', () => {
      const levy: RenewableLevyEntry = {
        planId: 'test',
        unitPriceYenPerKwh: new Decimal('2.97')
      };
      const result = describeRenewableLevy(levy, new Decimal('891'));
      expect(result).toBe('再エネ賦課金: 891.00円');
    });
  });
});
