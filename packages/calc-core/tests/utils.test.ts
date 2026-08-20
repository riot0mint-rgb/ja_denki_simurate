import { Decimal, configureDecimal } from '../src/decimal-config';
import { applyRounding, describeRounding, roundDownToYen, roundUpToYen } from '../src/rounding';
import {
  describeAnnualSavings,
  describeMonthlyDifference,
  formatCurrency,
  formatPercentage,
  validateUsageKwh
} from '../src/utils';

describe('validateUsageKwh', () => {
  it.each([0, 1, 15, 348.5, 1200])('%p は有効', v => {
    expect(validateUsageKwh(v).valid).toBe(true);
  });

  it.each([NaN, -1, Infinity, -Infinity])('%p は無効で理由を返す', v => {
    const r = validateUsageKwh(v);
    expect(r.valid).toBe(false);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('数値以外は無効', () => {
    expect(validateUsageKwh('348' as unknown as number).valid).toBe(false);
    expect(validateUsageKwh(null as unknown as number).valid).toBe(false);
    expect(validateUsageKwh(undefined as unknown as number).valid).toBe(false);
  });
});

describe('roundDownToYen', () => {
  it.each<[string, number]>([
    ['1234.99', 1234],
    ['1234.01', 1234],
    ['1234', 1234],
    ['0.99', 0],
    ['0', 0]
  ])('%s → %d', (input, expected) => {
    expect(roundDownToYen(new Decimal(input)).toNumber()).toBe(expected);
  });

  it('負数は 0 方向に切り捨てる（Excel ROUNDDOWN と同じ）', () => {
    expect(roundDownToYen(new Decimal('-1234.01')).toNumber()).toBe(-1234);
    expect(roundDownToYen(new Decimal('-1234.99')).toNumber()).toBe(-1234);
  });

  it('Decimal.floor（-∞方向）とは負数で異なる', () => {
    const v = new Decimal('-1234.01');
    expect(roundDownToYen(v).toNumber()).toBe(-1234);
    expect(v.floor().toNumber()).toBe(-1235);
  });

  it('端数処理の説明文を返す', () => {
    expect(describeRounding('down')).toBe('円未満切り捨て');
    expect(describeRounding('up')).toBe('円未満切り上げ');
    expect(describeRounding('none')).toBe('端数処理なし');
  });

  it('切り上げは 0 から離れる方向', () => {
    expect(roundUpToYen(new Decimal('1234.01')).toNumber()).toBe(1235);
    expect(roundUpToYen(new Decimal('-1234.01')).toNumber()).toBe(-1235);
  });

  it('applyRounding はモードどおりに適用する', () => {
    const v = new Decimal('100.5');
    expect(applyRounding(v, 'none').toNumber()).toBe(100.5);
    expect(applyRounding(v, 'up').toNumber()).toBe(101);
    expect(applyRounding(v, 'down').toNumber()).toBe(100);
  });
});

describe('formatCurrency', () => {
  it.each<[string, string]>([
    ['0', '￥0'],
    ['1234', '￥1,234'],
    ['1234.56', '￥1,234'],
    ['10275', '￥10,275'],
    ['-436', '-￥436']
  ])('%s → %s', (input, expected) => {
    expect(formatCurrency(new Decimal(input))).toBe(expected);
  });

  it('2^53 を超える金額でも下位桁を壊さない', () => {
    expect(formatCurrency(new Decimal('90071992547409919'))).toBe('￥90,071,992,547,409,919');
  });
});

describe('formatPercentage', () => {
  it('既定は小数第1位', () => {
    expect(formatPercentage(new Decimal('4.0705'))).toBe('4.1%');
  });

  it('桁数を指定できる', () => {
    expect(formatPercentage(new Decimal('4.0705'), 2)).toBe('4.07%');
  });
});

describe('説明文', () => {
  it('月額差の表現', () => {
    expect(describeMonthlyDifference(new Decimal('0'))).toBe('同額');
    expect(describeMonthlyDifference(new Decimal('436'))).toBe('￥436お得');
    expect(describeMonthlyDifference(new Decimal('-436'))).toBe('￥436高い');
  });

  it('年間削減額の表現', () => {
    expect(describeAnnualSavings(new Decimal('0'))).toBe('年間削減額: 0円');
    expect(describeAnnualSavings(new Decimal('5232'))).toBe('年間削減額: ￥5,232');
    expect(describeAnnualSavings(new Decimal('-5232'))).toBe('年間追加費用: ￥5,232');
  });
});

describe('decimal-config', () => {
  it('精度 28・ROUND_HALF_UP が適用されている', () => {
    configureDecimal();
    expect(Decimal.precision).toBe(28);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
  });

  it('0.1 + 0.2 が厳密に 0.3 になる', () => {
    expect(new Decimal('0.1').plus('0.2').equals('0.3')).toBe(true);
  });
});
