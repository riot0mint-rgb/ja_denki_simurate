import Decimal from 'decimal.js';
import {
  validateUsageKwh,
  validateDecimal,
  formatCurrency,
  formatPercentage,
  describeMonthlyDifference,
  describeAnnualSavings
} from '../src/utils';

describe('Utils - ユーティリティ関数', () => {
  describe('validateUsageKwh', () => {
    it('正の数を受け入れること', () => {
      expect(validateUsageKwh(0)).toBe(true);
      expect(validateUsageKwh(100)).toBe(true);
      expect(validateUsageKwh(900)).toBe(true);
    });

    it('負の数を拒否すること', () => {
      expect(validateUsageKwh(-1)).toBe(false);
    });

    it('無限大を拒否すること', () => {
      expect(validateUsageKwh(Infinity)).toBe(false);
    });

    it('非数を拒否すること', () => {
      expect(validateUsageKwh(NaN)).toBe(false);
    });

    it('文字列を拒否すること', () => {
      expect(validateUsageKwh('100' as any)).toBe(false);
    });
  });

  describe('validateDecimal', () => {
    it('正のDecimalを受け入れること', () => {
      expect(validateDecimal(new Decimal('1000'))).toBe(true);
      expect(validateDecimal(new Decimal('0'))).toBe(true);
    });

    it('負のDecimalを拒否すること', () => {
      expect(validateDecimal(new Decimal('-100'))).toBe(false);
    });

    it('nullを受け入れること', () => {
      expect(validateDecimal(null)).toBe(true);
    });
  });

  describe('formatCurrency', () => {
    it('金額を日本円形式でフォーマットすること', () => {
      const result = formatCurrency(new Decimal('1234'));
      expect(result).toMatch(/¥|￥/);
      expect(result).toContain('1');
      expect(result).toContain('234');
    });

    it('小数点は表示しないこと', () => {
      const result = formatCurrency(new Decimal('1234.56'));
      expect(!result.includes('.'));
    });
  });

  describe('formatPercentage', () => {
    it('パーセンテージをフォーマットすること', () => {
      const result = formatPercentage(new Decimal('3.14159'), 2);
      expect(result).toBe('3.14%');
    });

    it('デフォルトで小数点以下2桁であること', () => {
      const result = formatPercentage(new Decimal('3.14159'));
      expect(result).toBe('3.14%');
    });
  });

  describe('describeMonthlyDifference', () => {
    it('正の差を「お得」と表現すること', () => {
      const result = describeMonthlyDifference(new Decimal('500'));
      expect(result).toContain('お得');
      expect(result).toContain('500');
    });

    it('負の差を「高い」と表現すること', () => {
      const result = describeMonthlyDifference(new Decimal('-500'));
      expect(result).toContain('高い');
      expect(result).toContain('500');
    });

    it('ゼロを「同額」と表現すること', () => {
      const result = describeMonthlyDifference(new Decimal('0'));
      expect(result).toBe('同額');
    });
  });

  describe('describeAnnualSavings', () => {
    it('正の削減を「年間削減額」と表現すること', () => {
      const result = describeAnnualSavings(new Decimal('6000'));
      expect(result).toContain('年間削減額');
    });

    it('負の削減を「年間追加費用」と表現すること', () => {
      const result = describeAnnualSavings(new Decimal('-6000'));
      expect(result).toContain('年間追加費用');
    });

    it('ゼロを「0円」と表現すること', () => {
      const result = describeAnnualSavings(new Decimal('0'));
      expect(result).toContain('0円');
    });
  });
});
