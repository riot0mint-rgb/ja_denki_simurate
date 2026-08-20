import { BillingCalculator } from '../src/calculator';
import { lookupFuelAdjustment, lookupRenewableLevy, RatePeriod } from '../src/monthlyRates';
import { RatePlan, RoundingProfile, UsageInput } from '../src/models';
import * as F from './fixtures';

const calculator = new BillingCalculator();
const JULY: RatePeriod = { year: 2026, month: 7 };

function run(plan: RatePlan, usage: UsageInput, provider: 'chugoku' | 'au' = 'chugoku') {
  return calculator.calculate({
    usage,
    plan,
    fuelAdjustment: lookupFuelAdjustment(JULY, provider)!.value,
    renewableLevy: lookupRenewableLevy(JULY)!.value
  });
}
function bill(plan: RatePlan, usage: UsageInput, provider: 'chugoku' | 'au' = 'chugoku') {
  const r = run(plan, usage, provider);
  if (r.status !== 'ok') throw new Error(r.reason);
  return r.bill;
}

describe('最低料金型（従量電灯A/S）', () => {
  it('15kWh までは電力量料金が発生しない', () => {
    for (const kwh of [0, 1, 14, 15]) {
      expect(bill(F.jaDenkiJuryoA, { totalKwh: kwh }).energySubtotal.toNumber()).toBe(0);
    }
  });

  it('各段階の課金kWhの合計は 使用量-15（二重計上も欠落もない）', () => {
    for (const kwh of [16, 50, 120, 121, 300, 301, 1200]) {
      const b = bill(F.jaDenkiJuryoA, { totalKwh: kwh });
      const sum = b.lines.reduce((a, l) => a.plus(l.quantity!), b.lines[0].quantity!.times(0));
      expect(sum.toNumber()).toBe(kwh - 15);
    }
  });
});

describe('契約容量型（従量電灯B）', () => {
  it('段階は 0kWh から始まる（15kWh の控除がない）', () => {
    const b = bill(F.chugokuJuryoB, { totalKwh: 100, contractKva: 6 });
    expect(b.lines[0].quantity!.toNumber()).toBe(100);
  });

  it('使用量0で基本料金が半額になる', () => {
    const zero = bill(F.chugokuJuryoB, { totalKwh: 0, contractKva: 6 });
    const some = bill(F.chugokuJuryoB, { totalKwh: 1, contractKva: 6 });
    expect(zero.baseCharge.times(2).toNumber()).toBe(some.baseCharge.toNumber());
    expect(zero.notes.some(n => n.includes('半額'))).toBe(true);
  });

  it('契約容量が未入力なら unsupported', () => {
    const r = run(F.chugokuJuryoB, { totalKwh: 100 });
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') expect(r.reason).toContain('ご契約容量');
  });

  it('再エネ賦課金に切り捨てを適用しない（元資料どおり）', () => {
    const b = bill(F.chugokuJuryoB, { totalKwh: 100, contractKva: 6 });
    expect(b.renewableLevy.toNumber()).toBeCloseTo(418, 6);
    expect(b.renewableLevy.isInteger()).toBe(true);
    const b2 = bill(F.chugokuJuryoB, { totalKwh: 101, contractKva: 6 });
    expect(b2.renewableLevy.isInteger()).toBe(false);
  });
});

describe('季節別型（低圧電力）', () => {
  it('夏季とその他季で単価が変わる', () => {
    const summer = bill(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 100, otherKwh: 0 } });
    const other = bill(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: 100 } });
    expect(summer.energySubtotal.toNumber()).toBe(2680);
    expect(other.energySubtotal.toNumber()).toBe(2551);
  });

  it('季節別使用量が未入力なら unsupported', () => {
    const r = run(F.chugokuLowVoltage, { contractKw: 6 });
    expect(r.status).toBe('unsupported');
  });

  it('負の使用量は unsupported（夏季・その他季とも）', () => {
    expect(run(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: -1, otherKwh: 0 } }).status)
      .toBe('unsupported');
    expect(run(F.chugokuLowVoltage, { contractKw: 6, seasonal: { summerKwh: 0, otherKwh: NaN } }).status)
      .toBe('unsupported');
  });

  it('契約電力が未入力なら unsupported', () => {
    const r = run(F.chugokuLowVoltage, { seasonal: { summerKwh: 100, otherKwh: 0 } });
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') expect(r.reason).toContain('ご契約電力');
  });

  it('契約電力が0以下なら unsupported', () => {
    expect(run(F.chugokuLowVoltage, { contractKw: 0, seasonal: { summerKwh: 1, otherKwh: 0 } }).status)
      .toBe('unsupported');
  });
});

describe('時間帯別型（電化Style / 夜トク）', () => {
  const usage = (tou: Record<string, number>): UsageInput => ({ contractKw: 6, tou });

  it('4区分すべてに単価が適用される', () => {
    const b = bill(F.chugokuDenkaStyle, usage({ dayOther: 10, daySummer: 20, night: 30, holiday: 40 }));
    expect(b.totalKwh.toNumber()).toBe(100);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(
      44.4 * 10 + 46.46 * 20 + 30.35 * 30 + 30.35 * 40,
      6
    );
  });

  it('契約電力が10kWを超えると基本料金が増える', () => {
    const at10 = bill(F.jaDenkiYotoku, { contractKw: 10, tou: { night: 100 } });
    const at12 = bill(F.jaDenkiYotoku, { contractKw: 12, tou: { night: 100 } });
    expect(at12.baseCharge.minus(at10.baseCharge).toNumber()).toBeCloseTo(458.37 * 2, 6);
  });

  // ③明細では半額の IF が「10kWまで」と「10kW超過分の単価」の両方に掛かっている。
  //   J9  = IF(D4=0, 早見表!E5/2, 早見表!E5)
  //   E10 = IF(D4=0, 早見表!E6/2, 早見表!E6)   ← 超過分の単価も半額
  // 0kWh のテストが 6kW ばかりだと overKw が 0 になりこの経路を通らない
  it('使用量0のとき10kW超過分の単価も半額になる', () => {
    const b = bill(F.chugokuDenkaStyle, { contractKw: 12, tou: { night: 0 } });
    expect(b.baseCharge.toNumber()).toBeCloseTo(2018.72 / 2 + (480.37 / 2) * 2, 6);
    expect(b.notes.some(n => n.includes('半額'))).toBe(true);
  });

  it('夜トクは電化Styleと同じ単価で基本料金だけが安い', () => {
    const u = usage({ dayOther: 100, night: 200, holiday: 50 });
    const style = bill(F.chugokuDenkaStyle, u);
    const yotoku = bill(F.jaDenkiYotoku, u);
    expect(yotoku.energySubtotal.toNumber()).toBe(style.energySubtotal.toNumber());
    expect(style.baseCharge.minus(yotoku.baseCharge).toNumber()).toBeCloseTo(121, 6);
  });

  // ナイトホリデーコースは契約電力ベースの基本料金を持たず、最低月額料金型。
  // 中国電力の公式単価表で確認済み。③明細 J8:J10 の空欄は記載漏れではなく、
  // そこに入る金額が存在しないためだった。
  // 出典: https://www.energia.co.jp/elec/h_menu/pricelist/pricelist5.html
  describe('最低月額料金型（ナイトホリデー）', () => {
    it('基本料金を取らない', () => {
      const b = bill(F.chugokuNightHoliday, usage({ dayOther: 100, night: 200 }));
      expect(b.baseCharge.toNumber()).toBe(0);
      expect(b.energySubtotal.toNumber()).toBeCloseTo(46.98 * 100 + 34.65 * 200, 6);
    });

    it('契約電力の入力がなくても計算できる', () => {
      const r = run(F.chugokuNightHoliday, { tou: { dayOther: 100, night: 200 } });
      expect(r.status).toBe('ok');
    });

    it('契約電力を変えても請求額が変わらない', () => {
      const tou = { dayOther: 100, night: 200 };
      const at6 = bill(F.chugokuNightHoliday, { contractKw: 6, tou });
      const at12 = bill(F.chugokuNightHoliday, { contractKw: 12, tou });
      expect(at12.total.toNumber()).toBe(at6.total.toNumber());
    });

    // 判定は (従量料金 + 燃料費調整額) で行うため、境界は燃調の改定で動く。
    // 26年7月適用: (34.65 - 9.57) × 使用量 < 1844.7 → ナイトのみなら 73kWh まで
    it('73kWh までは最低月額料金 1,845円', () => {
      for (const kwh of [0, 1, 50, 73]) {
        const b = bill(F.chugokuNightHoliday, usage({ night: kwh }));
        expect(b.total.toNumber()).toBe(1845);
        expect(b.notes.some(n => n.includes('最低月額料金'))).toBe(true);
      }
    });

    it('74kWh から通常計算に切り替わる', () => {
      const b = bill(F.chugokuNightHoliday, usage({ night: 74 }));
      expect(b.notes).toEqual([]);
      expect(b.total.toNumber()).toBeGreaterThan(1845);
    });

    it('電化Styleより昼間が高く夜間も高い（乗り換え提案の前提）', () => {
      expect(F.chugokuNightHoliday.unitPrices.dayOther.toNumber()).toBeGreaterThan(
        F.chugokuDenkaStyle.unitPrices.dayOther.toNumber()
      );
      expect(F.chugokuNightHoliday.unitPrices.night.toNumber()).toBeGreaterThan(
        F.chugokuDenkaStyle.unitPrices.night.toNumber()
      );
    });

    it('使用量が多ければJAでんき夜トクへの切替で削減になる', () => {
      const u = usage({ dayOther: 150, daySummer: 0, night: 300, holiday: 80 });
      const now = bill(F.chugokuNightHoliday, { ...u, contractKw: 6 });
      const ja = bill(F.jaDenkiYotoku, { ...u, contractKw: 6 });
      expect(ja.total.lessThan(now.total)).toBe(true);
    });
  });

  it('基本料金も最低月額料金も無いプランは unsupported のまま', () => {
    const r = run(F.touWithoutAnyBaseCharge, usage({ dayOther: 100, night: 200 }));
    expect(r.status).toBe('unsupported');
    if (r.status === 'unsupported') {
      expect(r.reason).toContain('基本料金');
      expect(r.nextSteps.length).toBeGreaterThan(0);
    }
  });

  it('時間帯別使用量が未入力なら unsupported', () => {
    const r = run(F.jaDenkiYotoku, { contractKw: 6 });
    expect(r.status).toBe('unsupported');
  });

  it('負の時間帯使用量は unsupported', () => {
    const r = run(F.jaDenkiYotoku, usage({ night: -5 }));
    expect(r.status).toBe('unsupported');
  });

  it('契約電力が未入力なら unsupported', () => {
    const r = run(F.jaDenkiYotoku, { tou: { night: 100 } });
    expect(r.status).toBe('unsupported');
  });
});

describe('契約電力＋一律単価型（深夜電力B）', () => {
  it('使用量があれば通常計算', () => {
    const b = bill(F.chugokuMidnightB, { totalKwh: 100, contractKw: 4 });
    expect(b.baseCharge.toNumber()).toBeCloseTo(375.92 * 4, 6);
    expect(b.energySubtotal.toNumber()).toBeCloseTo(3034, 6);
    expect(b.notes).toEqual([]);
  });

  it('使用量0で請求額全体が半額になる（基本料金だけではない）', () => {
    const b = bill(F.chugokuMidnightB, { totalKwh: 0, contractKw: 4 });
    expect(b.total.toNumber()).toBe(751.5);
    expect(b.notes.some(n => n.includes('半額'))).toBe(true);
  });

  it('契約電力が未入力なら unsupported', () => {
    expect(run(F.chugokuMidnightB, { totalKwh: 100 }).status).toBe('unsupported');
  });
});

describe('一律単価型（シンプルコース）', () => {
  // 判定は (従量料金 + 燃料費調整額) で行うため、閾値を跨ぐ使用量は燃調の改定で動く。
  // 26年7月適用: (38.21 - 9.57) × 使用量 < 1844.7 → 64kWh まで最低月額料金
  it('64kWh までは最低月額料金 1,845円', () => {
    for (const kwh of [0, 10, 50, 64]) {
      const b = bill(F.chugokuSimple, { totalKwh: kwh });
      expect(b.total.toNumber()).toBe(1845);
      expect(b.notes.length).toBe(1);
    }
  });

  it('65kWh から通常計算に切り替わる', () => {
    const b = bill(F.chugokuSimple, { totalKwh: 65 });
    expect(b.notes).toEqual([]);
    expect(b.total.toNumber()).toBeGreaterThan(1845);
  });
});

// 丸め方は事業者ごとに違う（auでんきは従量料金と燃調を切り上げる）。
// 以前は最低料金型だけが plan.rounding を見ており、他の構造は素通りしていた。
// 今は該当プランが無いが、au 低圧電力を足した瞬間に静かに切り上げが消える状態だった。
describe('丸め方はどの構造でもプランの定義に従う', () => {
  const UP: RoundingProfile = {
    energyTotal: 'up',
    fuelSubtotal: 'up',
    levySubtotal: 'down',
    finalTotal: 'none'
  };

  const cases: Array<[string, RatePlan, UsageInput]> = [
    ['最低料金型', F.jaDenkiJuryoA, { totalKwh: 348 }],
    ['一律単価型', F.chugokuSimple, { totalKwh: 348 }],
    ['契約容量型', F.chugokuJuryoB, { totalKwh: 348, contractKva: 10 }],
    ['契約電力＋季節別', F.chugokuLowVoltage, { seasonal: { summerKwh: 300, otherKwh: 0 }, contractKw: 6 }],
    ['時間帯別', F.chugokuDenkaStyle, { contractKw: 6, tou: { night: 348 } }],
    ['契約電力＋一律', F.chugokuMidnightB, { totalKwh: 348, contractKw: 4 }]
  ];

  // energyTotal は au明細 I13（基本料金＋電力量料金の合計）の位置に掛かる
  it.each(cases)('%s: 切り上げ指定なら基本料金＋電力量料金が整数になる', (_label, plan, usage) => {
    const b = bill({ ...plan, rounding: UP } as RatePlan, usage);
    expect(b.energyChargeTotal.isInteger()).toBe(true);
  });

  it.each(cases)('%s: 切り上げ指定なら燃料費調整額が整数になる', (_label, plan, usage) => {
    const b = bill({ ...plan, rounding: UP } as RatePlan, usage);
    expect(b.fuelAdjustment.isInteger()).toBe(true);
  });

  it('丸め指定が none なら端数がそのまま残る', () => {
    const b = bill(F.chugokuDenkaStyle, { contractKw: 6, tou: { night: 348 } });
    expect(b.energyChargeTotal.isInteger()).toBe(false);
  });

  // 丸めた値が請求額の計算に使われているか。内訳だけ丸めて合計は元の値、
  // という取りこぼしを防ぐ（finalTotal は none なので単純な足し算になる）
  it.each(cases)('%s: 丸めた内訳がそのまま請求額に積まれる', (_label, plan, usage) => {
    const b = bill({ ...plan, rounding: UP } as RatePlan, usage);
    const sum = b.energyChargeTotal.plus(b.discount).plus(b.fuelAdjustment).plus(b.renewableLevy);
    expect(b.total.toString()).toBe(sum.toString());
  });
});

describe('入力検証（CLAUDE.md ルール8）', () => {
  it.each([NaN, -1, Infinity])('%p は unsupported', v => {
    expect(run(F.jaDenkiJuryoA, { totalKwh: v }).status).toBe('unsupported');
  });

  it('使用量そのものが無ければ unsupported', () => {
    expect(run(F.jaDenkiJuryoA, {}).status).toBe('unsupported');
  });
});

describe('内訳の表示（紙に出る）', () => {
  // 按分した使用量には端数が出る。0桁で丸めると紙の上で掛け算が合わなくなる
  it('端数のある使用量でも掛け算が合う', () => {
    const b = bill(F.chugokuDenkaStyle, { contractKw: 6, tou: { dayOther: 67.18, night: 200 } });
    const line = b.formula.split('→').find(x => x.includes('デイタイムその他季'))!;
    const m = line.match(/([\d.]+)円 × ([\d.]+)kWh = ([\d.]+)円/)!;
    // 表示は小数2桁までなので、掛け算との差は1銭未満に収まっていればよい
    expect(Math.abs(Number(m[1]) * Number(m[2]) - Number(m[3]))).toBeLessThan(0.01);
  });

  it('整数の使用量に不要な小数を付けない', () => {
    const b = bill(F.chugokuDenkaStyle, { contractKw: 6, tou: { night: 200 } });
    expect(b.formula).toContain('× 200kWh');
  });
});

describe('出典と内訳', () => {
  it('計算結果はプランの出典を持ち回る', () => {
    const b = bill(F.jaDenkiYotoku, { contractKw: 6, tou: { night: 100 } });
    expect(b.sources[0].verificationStatus).toBe('verified');
    expect(b.sources[0].effectiveFrom).toBe('2026-07');
  });

  it('計算式に主要項目が並ぶ', () => {
    const f = bill(F.jaDenkiYotoku, { contractKw: 6, tou: { night: 100 } }).formula;
    expect(f).toContain('基本料金');
    expect(f).toContain('ナイトタイム');
    expect(f).toContain('燃料費調整額');
    expect(f).toContain('再エネ賦課金');
  });

  it('割引がある場合は計算式に現れる', () => {
    const withDiscount = {
      ...F.jaDenkiYotoku,
      allElectricDiscount: { rate: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('0.08'), capYen: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('3300') }
    };
    const b = bill(withDiscount as RatePlan, {
      contractKw: 6,
      tou: { night: 1000 },
      allElectricDiscount: true
    });
    expect(b.discount.isNegative()).toBe(true);
    expect(b.formula).toContain('割引');
    expect(b.notes.some(n => n.includes('電化住宅割'))).toBe(true);
  });

  it('電化住宅割は上限額でクリップされる', () => {
    const withDiscount = {
      ...F.jaDenkiYotoku,
      allElectricDiscount: { rate: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('0.08'), capYen: new (F.jaDenkiYotoku.baseChargeUpTo10Kw!.constructor as any)('3300') }
    };
    const b = bill(withDiscount as RatePlan, {
      contractKw: 6,
      tou: { night: 100000 },
      allElectricDiscount: true
    });
    expect(b.discount.toNumber()).toBe(-3300);
  });
});
