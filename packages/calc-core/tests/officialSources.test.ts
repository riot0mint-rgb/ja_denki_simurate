/**
 * 各社が公表している一次資料と単価を突き合わせる。
 *
 * 実装当初の単価はすべて JAでんき公式試算表からの転記で、出典が試算表1本しかなかった。
 * 2026-08-20 に下記を直接取得して全プランを照合した結果をここに固定する。
 *
 *   中国電力 電気料金単価表（電灯）        pricelist1.html
 *   中国電力 電気料金単価表（電灯・選択約款） pricelist2.html
 *   中国電力 電気料金単価表（電力）         pricelist3.html
 *   中国電力 電気料金単価表（電力・選択約款） pricelist4.html
 *   中国電力 電気料金単価表（電灯・電力 サービス約款） pricelist5.html
 *     https://www.energia.co.jp/elec/h_menu/pricelist/
 *   JAでんき 電気料金メニュー定義書（低圧・中国）2024年4月改定
 *     https://hirokumi.net/cont/wp-content/themes/kumiai_theme/assets/pdf/price_kaitei.pdf
 *
 * 単価改定でここが落ちたときは、実装ではなく**一次資料を取り直してから**直すこと。
 * 試算表だけを見て合わせると、出典が試算表1本に逆戻りする。
 */

import * as F from './fixtures';

/** 一次資料に載っていた値。試算表からの転記ではない。 */
const OFFICIAL = {
  chugokuJuryoA: { minimum: 759.68, tiers: [32.75, 39.43, 41.55] },
  chugokuSmart: { minimum: 669.92, tiers: [32.01, 39.43, 41.55] },
  chugokuSimple: { unitPrice: 38.21, minimumMonthly: 1844.7 },
  chugokuJuryoB: { basePerKva: 447.97, tiers: [30.06, 36.15, 38.02] },
  chugokuDenkaStyle: {
    baseUpTo10Kw: 2018.72,
    basePerKwOver10: 480.37,
    daySummer: 46.46,
    dayOther: 44.4,
    night: 30.35
  },
  chugokuNightHoliday: {
    minimumMonthly: 1844.7,
    daySummer: 49.44,
    dayOther: 46.98,
    night: 34.65
  },
  jaDenkiJuryoA: { minimum: 759.68, tiers: [32.22, 38.04, 38.84] },
  jaDenkiJuryoS: { minimum: 669.92, tiers: [31.79, 39.43, 41.44] },
  jaDenkiJuryoB: { basePerKva: 447.97, tiers: [30.06, 35.41, 36.71] },
  jaDenkiLowVoltage: { basePerKw: 1132.83, summer: 26.8, other: 25.51 },
  jaDenkiYotoku: {
    baseUpTo10Kw: 1897.72,
    basePerKwOver10: 458.37,
    daySummer: 46.46,
    dayOther: 44.4,
    night: 30.35
  },
  /** 規制料金の「低圧電力」。自由料金の「動力コース」1,152.44円/kW とは別メニュー。 */
  chugokuLowVoltage: { basePerKw: 1163.92, summer: 26.8, other: 25.51 },
  chugokuFamilyTime1: {
    baseUpTo10Kva: 2577.1,
    basePerKvaOver10: 481.77,
    daySummer: 47.38,
    dayOther: 42.57,
    family: 42.33,
    night: 30.34
  },
  chugokuFamilyTime2: {
    baseUpTo10Kva: 1587.1,
    basePerKvaOver10: 481.77,
    daySummer: 50.71,
    dayOther: 45.58,
    family: 45.34,
    night: 30.34
  },
  chugokuEconomyNight: {
    baseUpTo10Kva: 1578.72,
    basePerKvaOver10: 480.37,
    dayTiers: [38.22, 43.82, 44.86],
    night: 30.34
  },
  chugokuMidnightB: { basePerKw: 375.92, unitPrice: 30.34 },
  /** auでんき公式（www.au.com/energy/denki/merit/plan/）。従量電灯A から各1銭安い。 */
  auMPlan: { minimum: 759.67, tiers: [32.74, 39.42, 41.54] },
  /** 電化住宅割引は基本料金+電力量料金の 8%、上限 3,300円。 */
  allElectricDiscount: { rate: 0.08, capYen: 3300 }
} as const;

const tierPrices = (plan: { tiers: { unitPriceYenPerKwh: { toNumber(): number } }[] }) =>
  plan.tiers.map(t => t.unitPriceYenPerKwh.toNumber());

describe('中国電力 公式単価表との突合', () => {
  it('従量電灯A（規制料金）', () => {
    expect(F.chugokuJuryoA.minimumCharge.toNumber()).toBe(OFFICIAL.chugokuJuryoA.minimum);
    expect(tierPrices(F.chugokuJuryoA)).toEqual([...OFFICIAL.chugokuJuryoA.tiers]);
  });

  it('スマートコース（サービス約款）', () => {
    expect(F.chugokuSmart.minimumCharge.toNumber()).toBe(OFFICIAL.chugokuSmart.minimum);
    expect(tierPrices(F.chugokuSmart)).toEqual([...OFFICIAL.chugokuSmart.tiers]);
  });

  it('シンプルコース（サービス約款）', () => {
    expect(F.chugokuSimple.unitPriceYenPerKwh.toNumber()).toBe(OFFICIAL.chugokuSimple.unitPrice);
    expect(F.chugokuSimple.minimumMonthlyThreshold.toNumber()).toBe(
      OFFICIAL.chugokuSimple.minimumMonthly
    );
  });

  it('従量電灯B（規制料金）', () => {
    expect(F.chugokuJuryoB.baseChargePerKva.toNumber()).toBe(OFFICIAL.chugokuJuryoB.basePerKva);
    expect(tierPrices(F.chugokuJuryoB)).toEqual([...OFFICIAL.chugokuJuryoB.tiers]);
  });

  it('低圧電力（規制料金）', () => {
    const o = OFFICIAL.chugokuLowVoltage;
    expect(F.chugokuLowVoltage.baseChargePerKw.toNumber()).toBe(o.basePerKw);
    expect(F.chugokuLowVoltage.summerUnitPriceYenPerKwh.toNumber()).toBe(o.summer);
    expect(F.chugokuLowVoltage.otherUnitPriceYenPerKwh.toNumber()).toBe(o.other);
  });

  it('ファミリータイム プランⅠ（選択約款）', () => {
    const o = OFFICIAL.chugokuFamilyTime1;
    expect(F.chugokuFamilyTime1.baseChargeUpTo10Kva.toNumber()).toBe(o.baseUpTo10Kva);
    expect(F.chugokuFamilyTime1.baseChargePerKvaOver10.toNumber()).toBe(o.basePerKvaOver10);
    expect(F.chugokuFamilyTime1.unitPrices.daySummer.toNumber()).toBe(o.daySummer);
    expect(F.chugokuFamilyTime1.unitPrices.dayOther.toNumber()).toBe(o.dayOther);
    expect(F.chugokuFamilyTime1.unitPrices.family.toNumber()).toBe(o.family);
    expect(F.chugokuFamilyTime1.unitPrices.night.toNumber()).toBe(o.night);
  });

  it('ファミリータイム プランⅡ（選択約款）', () => {
    const o = OFFICIAL.chugokuFamilyTime2;
    expect(F.chugokuFamilyTime2.baseChargeUpTo10Kva.toNumber()).toBe(o.baseUpTo10Kva);
    expect(F.chugokuFamilyTime2.baseChargePerKvaOver10.toNumber()).toBe(o.basePerKvaOver10);
    expect(F.chugokuFamilyTime2.unitPrices.daySummer.toNumber()).toBe(o.daySummer);
    expect(F.chugokuFamilyTime2.unitPrices.dayOther.toNumber()).toBe(o.dayOther);
    expect(F.chugokuFamilyTime2.unitPrices.family.toNumber()).toBe(o.family);
    expect(F.chugokuFamilyTime2.unitPrices.night.toNumber()).toBe(o.night);
  });

  it('時間帯別電灯 エコノミーナイト（選択約款）', () => {
    const o = OFFICIAL.chugokuEconomyNight;
    expect(F.chugokuEconomyNight.baseChargeUpTo10Kva.toNumber()).toBe(o.baseUpTo10Kva);
    expect(F.chugokuEconomyNight.baseChargePerKvaOver10.toNumber()).toBe(o.basePerKvaOver10);
    expect(
      F.chugokuEconomyNight.dayTiers.map(x => x.unitPriceYenPerKwh.toNumber())
    ).toEqual([...o.dayTiers]);
    expect(F.chugokuEconomyNight.nightUnitPriceYenPerKwh.toNumber()).toBe(o.night);
  });

  it('深夜電力B（電力・選択約款）', () => {
    const o = OFFICIAL.chugokuMidnightB;
    expect(F.chugokuMidnightB.baseChargePerKw.toNumber()).toBe(o.basePerKw);
    expect(F.chugokuMidnightB.unitPriceYenPerKwh.toNumber()).toBe(o.unitPrice);
  });

  it('電化住宅割引（ファミリータイム）', () => {
    const o = OFFICIAL.allElectricDiscount;
    expect(F.chugokuFamilyTime1.allElectricDiscount!.rate.toNumber()).toBe(o.rate);
    expect(F.chugokuFamilyTime1.allElectricDiscount!.capYen.toNumber()).toBe(o.capYen);
  });

  it('電化Styleコース（サービス約款）', () => {
    const o = OFFICIAL.chugokuDenkaStyle;
    expect(F.chugokuDenkaStyle.baseChargeUpTo10Kw!.toNumber()).toBe(o.baseUpTo10Kw);
    expect(F.chugokuDenkaStyle.baseChargePerKwOver10!.toNumber()).toBe(o.basePerKwOver10);
    expect(F.chugokuDenkaStyle.unitPrices.daySummer.toNumber()).toBe(o.daySummer);
    expect(F.chugokuDenkaStyle.unitPrices.dayOther.toNumber()).toBe(o.dayOther);
    expect(F.chugokuDenkaStyle.unitPrices.night.toNumber()).toBe(o.night);
  });

  describe('ナイトホリデーコース（サービス約款）', () => {
    const o = OFFICIAL.chugokuNightHoliday;

    it('基本料金を持たず、最低月額料金のみ', () => {
      expect(F.chugokuNightHoliday.baseChargeUpTo10Kw).toBeNull();
      expect(F.chugokuNightHoliday.baseChargePerKwOver10).toBeNull();
      expect(F.chugokuNightHoliday.minimumMonthly).not.toBeNull();
      expect(F.chugokuNightHoliday.minimumMonthly!.threshold.toNumber()).toBe(o.minimumMonthly);
    });

    it('時間帯別単価', () => {
      expect(F.chugokuNightHoliday.unitPrices.daySummer.toNumber()).toBe(o.daySummer);
      expect(F.chugokuNightHoliday.unitPrices.dayOther.toNumber()).toBe(o.dayOther);
      expect(F.chugokuNightHoliday.unitPrices.night.toNumber()).toBe(o.night);
    });

    it('最低月額料金はシンプルコースと同額', () => {
      expect(F.chugokuNightHoliday.minimumMonthly!.threshold.toNumber()).toBe(
        F.chugokuSimple.minimumMonthlyThreshold.toNumber()
      );
    });
  });
});

describe('auでんき 公式料金表との突合', () => {
  it('でんきMプラン（中国電力エリア）', () => {
    expect(F.auMPlan.minimumCharge.toNumber()).toBe(OFFICIAL.auMPlan.minimum);
    expect(tierPrices(F.auMPlan)).toEqual([...OFFICIAL.auMPlan.tiers]);
  });

  it('中国電力 従量電灯A から各 1 銭安い', () => {
    const chugoku = [
      F.chugokuJuryoA.minimumCharge.toNumber(),
      ...tierPrices(F.chugokuJuryoA)
    ];
    const au = [F.auMPlan.minimumCharge.toNumber(), ...tierPrices(F.auMPlan)];
    for (let i = 0; i < chugoku.length; i++) {
      expect(chugoku[i] - au[i]).toBeCloseTo(0.01, 10);
    }
  });
});

describe('JAでんき 料金メニュー定義書との突合', () => {
  it('従量電灯A', () => {
    expect(F.jaDenkiJuryoA.minimumCharge.toNumber()).toBe(OFFICIAL.jaDenkiJuryoA.minimum);
    expect(tierPrices(F.jaDenkiJuryoA)).toEqual([...OFFICIAL.jaDenkiJuryoA.tiers]);
  });

  it('従量電灯S', () => {
    expect(F.jaDenkiJuryoS.minimumCharge.toNumber()).toBe(OFFICIAL.jaDenkiJuryoS.minimum);
    expect(tierPrices(F.jaDenkiJuryoS)).toEqual([...OFFICIAL.jaDenkiJuryoS.tiers]);
  });

  it('従量電灯B', () => {
    expect(F.jaDenkiJuryoB.baseChargePerKva.toNumber()).toBe(OFFICIAL.jaDenkiJuryoB.basePerKva);
    expect(tierPrices(F.jaDenkiJuryoB)).toEqual([...OFFICIAL.jaDenkiJuryoB.tiers]);
  });

  it('低圧電力', () => {
    const o = OFFICIAL.jaDenkiLowVoltage;
    expect(F.jaDenkiLowVoltage.baseChargePerKw.toNumber()).toBe(o.basePerKw);
    expect(F.jaDenkiLowVoltage.summerUnitPriceYenPerKwh.toNumber()).toBe(o.summer);
    expect(F.jaDenkiLowVoltage.otherUnitPriceYenPerKwh.toNumber()).toBe(o.other);
  });

  it('夜トクプラン', () => {
    const o = OFFICIAL.jaDenkiYotoku;
    expect(F.jaDenkiYotoku.baseChargeUpTo10Kw!.toNumber()).toBe(o.baseUpTo10Kw);
    expect(F.jaDenkiYotoku.baseChargePerKwOver10!.toNumber()).toBe(o.basePerKwOver10);
    expect(F.jaDenkiYotoku.unitPrices.daySummer.toNumber()).toBe(o.daySummer);
    expect(F.jaDenkiYotoku.unitPrices.night.toNumber()).toBe(o.night);
  });
});

describe('営業資料の値引き幅が一次資料どうしの差と一致する', () => {
  // 広島市 JAでんき案内資料 r3.pptx（2026年8月）に載っている値引き幅。
  // 中国電力の公式単価表と JAでんき定義書の差がこれと合うことを確認する。
  it('従量電灯A 第2段階 ▲1.39円 / 第3段階 ▲2.71円', () => {
    const chugoku = tierPrices(F.chugokuJuryoA);
    const ja = tierPrices(F.jaDenkiJuryoA);
    expect(chugoku[1] - ja[1]).toBeCloseTo(1.39, 10);
    expect(chugoku[2] - ja[2]).toBeCloseTo(2.71, 10);
  });

  it('従量電灯S 最低料金 ▲89.76円', () => {
    const diff =
      F.chugokuJuryoA.minimumCharge.toNumber() - F.jaDenkiJuryoS.minimumCharge.toNumber();
    expect(diff).toBeCloseTo(89.76, 10);
  });

  it('従量電灯B 第2段階 ▲0.74円 / 第3段階 ▲1.31円', () => {
    const chugoku = tierPrices(F.chugokuJuryoB);
    const ja = tierPrices(F.jaDenkiJuryoB);
    expect(chugoku[1] - ja[1]).toBeCloseTo(0.74, 10);
    expect(chugoku[2] - ja[2]).toBeCloseTo(1.31, 10);
  });

  it('夜トクプランは電化Styleより基本料金が ▲121.00円', () => {
    const diff =
      F.chugokuDenkaStyle.baseChargeUpTo10Kw!.toNumber() -
      F.jaDenkiYotoku.baseChargeUpTo10Kw!.toNumber();
    expect(diff).toBeCloseTo(121.0, 10);
  });

  it('低圧電力 基本料金 ▲31.09円/kW', () => {
    // 比較対象が規制料金「低圧電力」(1,163.92) であることの裏付け。
    // 自由料金「動力コース」(1,152.44) を基準にすると ▲19.61 になり営業資料と合わない。
    const diff =
      F.chugokuLowVoltage.baseChargePerKw.toNumber() -
      F.jaDenkiLowVoltage.baseChargePerKw.toNumber();
    expect(diff).toBeCloseTo(31.09, 10);
  });
});
