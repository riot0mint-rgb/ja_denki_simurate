import { Decimal } from './decimal-config.js';
import { RateSource } from './models.js';

/**
 * 季節ごとの電気の使われ方。
 *
 * 1か月分の検針票しかないお客様に「1年でいくら変わるか」を出すとき、
 * 毎月おなじ使用量が続くとみなすか、季節に合わせて増減させるかで結果が変わる。
 * その増減のもとになる数字をここに置く。
 *
 * **推計した数字を勝手に置かない。** これは単価と同じく計算結果を動かす値なので、
 * 公表統計からそのまま取り、出典を必ず添える（CLAUDE.md ルール4）。
 */
export interface MonthlyDemandProfile {
  id: string;
  /** 画面に出す名前。お客様が読む前提でやさしく書く */
  label: string;
  /** どんな数字なのかの一文。画面に出す */
  description: string;
  /**
   * 1月〜12月の使われ方。比しか使わないので単位は問わない。
   * 12個ちょうどで、すべて 0 より大きいこと。
   */
  monthlyIndex: Decimal[];
  source: RateSource;
}

const MONTHS = 12;

function assertProfile(profile: MonthlyDemandProfile): void {
  if (profile.monthlyIndex.length !== MONTHS) {
    throw new Error(`使われ方の指数は12か月ぶん必要です（${profile.id}: ${profile.monthlyIndex.length}件）`);
  }
  if (profile.monthlyIndex.some(v => !v.greaterThan(0))) {
    throw new Error(`使われ方の指数は0より大きい必要があります（${profile.id}）`);
  }
}

/**
 * 基準月の使用量を、季節ごとの使われ方に合わせて12か月へ広げる。
 *
 *   その月の使用量 = 基準月の使用量 × その月の指数 ÷ 基準月の指数
 *
 * 年間合計をいったん出してから配り直す形にはしない。割って掛けるだけで
 * 同じ値になるうえ、途中で丸めが2回入らない。
 *
 * 戻り値は 0 番目が1月。検針票と同じ整数 kWh に丸める。画面に出す使用量と
 * 実際に計算へ渡す使用量が食い違わないようにするため。
 */
export function distributeAnnualUsage(
  baseUsageKwh: Decimal,
  baseMonth: number,
  profile: MonthlyDemandProfile
): Decimal[] {
  assertProfile(profile);
  if (!Number.isInteger(baseMonth) || baseMonth < 1 || baseMonth > MONTHS) {
    throw new Error(`基準月は1〜12で指定してください（${baseMonth}）`);
  }
  if (baseUsageKwh.lessThan(0)) {
    throw new Error(`使用量に負の値は使えません（${baseUsageKwh.toString()}）`);
  }

  const baseIndex = profile.monthlyIndex[baseMonth - 1];
  return profile.monthlyIndex.map((index, i) =>
    // 基準月はお客様が入力した値そのもの。丸めを通すと入力と1kWhずれることがある
    i === baseMonth - 1
      ? baseUsageKwh
      : baseUsageKwh.times(index).dividedBy(baseIndex).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
  );
}

/**
 * 基準月に対する各月の倍率。画面で「8月は1.2倍使う想定です」と示すのに使う。
 * 戻り値は 0 番目が1月。
 */
export function monthlyRatios(baseMonth: number, profile: MonthlyDemandProfile): Decimal[] {
  assertProfile(profile);
  const baseIndex = profile.monthlyIndex[baseMonth - 1];
  return profile.monthlyIndex.map(index => index.dividedBy(baseIndex));
}

/**
 * 年度ごとの月別の実績から、1月〜12月の指数を作る。
 *
 *   1. 年度ごとに、12か月の平均を1とした倍率にする（年度の水準の違いを消す）
 *   2. 年度どうしで倍率を平均する（その年の猛暑・冷夏に引きずられにくくする）
 *   3. 1月が先頭になる並びにする
 *
 * 比にしてから平均するのは、契約口数の減少や燃料価格に連動した節電で
 * 年度ごとの使用量の水準が動くため。水準のまま平均すると新しい年度の重みが偏る。
 *
 * @param years 年度ごとの12か月ぶん。先頭が firstMonth 月、以降1か月ずつ進む
 * @param firstMonth 先頭の月（4月始まりの年度なら 4）
 */
export function monthlyIndexFromYears(years: Decimal[][], firstMonth: number): Decimal[] {
  if (!Number.isInteger(firstMonth) || firstMonth < 1 || firstMonth > MONTHS) {
    throw new Error(`先頭の月は1〜12で指定してください（${firstMonth}）`);
  }
  if (years.length === 0) {
    throw new Error('年度の実績が1年度も渡されていません');
  }
  const normalized = years.map((values, i) => {
    if (values.length !== MONTHS) {
      throw new Error(`年度の実績は12か月ぶん必要です（${i + 1}年度目: ${values.length}件）`);
    }
    if (values.some(v => !v.greaterThan(0))) {
      throw new Error(`年度の実績は0より大きい必要があります（${i + 1}年度目）`);
    }
    const mean = values.reduce((a, b) => a.plus(b), new Decimal(0)).dividedBy(MONTHS);
    return values.map(v => v.dividedBy(mean));
  });
  const averaged = Array.from({ length: MONTHS }, (_, i) =>
    normalized.reduce((a, year) => a.plus(year[i]), new Decimal(0)).dividedBy(normalized.length)
  );
  return Array.from({ length: MONTHS }, (_, m) => averaged[(m + 1 - firstMonth + MONTHS) % MONTHS]);
}
