import { Decimal } from '../src/decimal-config.js';
import {
  MonthlyDemandProfile,
  distributeAnnualUsage,
  monthlyIndexFromYears,
  monthlyRatios
} from '../src/demandProfile.js';

const SOURCE = {
  document: 'テスト用',
  locator: 'テスト用',
  effectiveFrom: '2026-01',
  verificationStatus: 'verified' as const,
  verifiedAt: '2026-08-21'
};

/** 1月だけ2倍、あとは全部1。倍率が読み取りやすい形にしてある */
function profileOf(values: string[]): MonthlyDemandProfile {
  return {
    id: 'test',
    label: 'テスト',
    description: 'テスト',
    monthlyIndex: values.map(v => new Decimal(v)),
    source: SOURCE
  };
}

const FLAT = profileOf(Array(12).fill('1'));
const WINTER_HEAVY = profileOf(['2', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1']);

describe('distributeAnnualUsage', () => {
  it('指数が全部おなじなら、どの月も入力どおりになる', () => {
    const out = distributeAnnualUsage(new Decimal('300'), 8, FLAT);
    expect(out).toHaveLength(12);
    expect(out.every(v => v.equals(300))).toBe(true);
  });

  it('基準月は入力した値をそのまま返す', () => {
    // 端数の出る指数でも、入力した月だけは絶対に動かさない
    const profile = profileOf(['1.7', '2.3', '3.1', '1.1', '1.3', '1.9', '2.9', '3.7', '4.1', '4.3', '4.7', '5.3']);
    for (let month = 1; month <= 12; month++) {
      const out = distributeAnnualUsage(new Decimal('348'), month, profile);
      expect(out[month - 1].toString()).toBe('348');
    }
  });

  it('指数の比のぶんだけ増える', () => {
    const out = distributeAnnualUsage(new Decimal('100'), 2, WINTER_HEAVY);
    expect(out[0].toString()).toBe('200'); // 1月は2倍
    expect(out[1].toString()).toBe('100'); // 基準月
    expect(out[11].toString()).toBe('100');
  });

  it('基準月が重い月なら、ほかの月は減る', () => {
    const out = distributeAnnualUsage(new Decimal('200'), 1, WINTER_HEAVY);
    expect(out[0].toString()).toBe('200');
    expect(out[5].toString()).toBe('100');
  });

  it('検針票と同じ整数kWhに丸める', () => {
    const profile = profileOf(['3', '2', '2', '2', '2', '2', '2', '2', '2', '2', '2', '2']);
    // 100 × 3 ÷ 2 = 150、100 × 2 ÷ 3 = 66.66… → 67
    expect(distributeAnnualUsage(new Decimal('100'), 2, profile)[0].toString()).toBe('150');
    expect(distributeAnnualUsage(new Decimal('100'), 1, profile)[1].toString()).toBe('67');
  });

  it('使用量0なら全部0', () => {
    const out = distributeAnnualUsage(new Decimal('0'), 6, WINTER_HEAVY);
    expect(out.every(v => v.isZero())).toBe(true);
  });

  it('12か月ぶん揃っていない指数は受け付けない', () => {
    expect(() => distributeAnnualUsage(new Decimal('100'), 1, profileOf(['1', '1', '1']))).toThrow(
      /12か月ぶん必要/
    );
  });

  it('0以下の指数は受け付けない（0除算になる）', () => {
    const broken = profileOf(['1', '0', '1', '1', '1', '1', '1', '1', '1', '1', '1', '1']);
    expect(() => distributeAnnualUsage(new Decimal('100'), 1, broken)).toThrow(/0より大きい/);
  });

  it('1〜12以外の月は受け付けない', () => {
    expect(() => distributeAnnualUsage(new Decimal('100'), 0, FLAT)).toThrow(/1〜12/);
    expect(() => distributeAnnualUsage(new Decimal('100'), 13, FLAT)).toThrow(/1〜12/);
    expect(() => distributeAnnualUsage(new Decimal('100'), 1.5, FLAT)).toThrow(/1〜12/);
  });

  it('負の使用量は受け付けない', () => {
    expect(() => distributeAnnualUsage(new Decimal('-1'), 1, FLAT)).toThrow(/負の値/);
  });
});

describe('monthlyRatios', () => {
  it('基準月は必ず1倍', () => {
    expect(monthlyRatios(3, WINTER_HEAVY)[2].toString()).toBe('1');
  });

  it('基準月に対する倍率を返す', () => {
    const ratios = monthlyRatios(2, WINTER_HEAVY);
    expect(ratios[0].toString()).toBe('2');
    expect(ratios[5].toString()).toBe('1');
  });

  it('壊れた指数は受け付けない', () => {
    expect(() => monthlyRatios(1, profileOf(['1']))).toThrow(/12か月ぶん必要/);
  });
});

describe('monthlyIndexFromYears', () => {
  const dec = (values: number[]) => values.map(v => new Decimal(v));

  it('毎月おなじ実績なら、指数はすべて 1', () => {
    const out = monthlyIndexFromYears([dec(Array(12).fill(120))], 4);
    expect(out.every(v => v.equals(1))).toBe(true);
  });

  it('4月始まりの12か月を、1月が先頭の並びに直す', () => {
    // 4月=1, 5月=2, …, 3月=12。平均は 6.5
    const out = monthlyIndexFromYears([dec([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], 4);
    expect(out[0].toFixed(6)).toBe((10 / 6.5).toFixed(6)); // 1月 = 10番目
    expect(out[3].toFixed(6)).toBe((1 / 6.5).toFixed(6)); // 4月 = 先頭
    expect(out[2].toFixed(6)).toBe((12 / 6.5).toFixed(6)); // 3月 = 末尾
  });

  it('1月始まりなら並べ替えない', () => {
    const out = monthlyIndexFromYears([dec([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], 1);
    expect(out[0].toFixed(6)).toBe((1 / 6.5).toFixed(6));
    expect(out[11].toFixed(6)).toBe((12 / 6.5).toFixed(6));
  });

  it('年度の水準が違っても、形が同じなら指数は同じになる', () => {
    const shape = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const one = monthlyIndexFromYears([dec(shape)], 4);
    const both = monthlyIndexFromYears([dec(shape), dec(shape.map(v => v * 3))], 4);
    both.forEach((v, i) => expect(v.toFixed(12)).toBe(one[i].toFixed(12)));
  });

  it('年度どうしは倍率の平均を取る（水準の平均ではない）', () => {
    // 1年目: 4月だけ大きい。2年目: 5月だけ大きい。水準は10倍違う
    const y1 = dec([2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const y2 = dec([10, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const out = monthlyIndexFromYears([y1, y2], 4);
    const meanY1 = 13 / 12;
    const meanY2 = 130 / 12;
    expect(out[3].toFixed(9)).toBe(((2 / meanY1 + 10 / meanY2) / 2).toFixed(9));
    expect(out[4].toFixed(9)).toBe(((1 / meanY1 + 20 / meanY2) / 2).toFixed(9));
  });

  it('12か月の指数の平均はちょうど 1', () => {
    const out = monthlyIndexFromYears([dec([3, 5, 8, 2, 9, 4, 7, 6, 1, 10, 12, 11])], 4);
    const mean = out.reduce((a, b) => a.plus(b), new Decimal(0)).dividedBy(12);
    expect(mean.toFixed(12)).toBe('1.000000000000');
  });

  it('不正な入力は例外にする', () => {
    expect(() => monthlyIndexFromYears([dec(Array(12).fill(1))], 0)).toThrow(/1〜12/);
    expect(() => monthlyIndexFromYears([dec(Array(12).fill(1))], 13)).toThrow(/1〜12/);
    expect(() => monthlyIndexFromYears([dec(Array(12).fill(1))], 1.5)).toThrow(/1〜12/);
    expect(() => monthlyIndexFromYears([], 4)).toThrow(/1年度も/);
    expect(() => monthlyIndexFromYears([dec([1, 2, 3])], 4)).toThrow(/12か月ぶん必要/);
    expect(() => monthlyIndexFromYears([dec([0, ...Array(11).fill(1)])], 4)).toThrow(/0より大きい/);
  });
});
