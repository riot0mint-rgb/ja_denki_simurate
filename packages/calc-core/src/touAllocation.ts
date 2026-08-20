import { Decimal } from './decimal-config.js';
import { TouBand } from './models.js';

/**
 * 旧プランの時間帯区分を夜トクプランの 4 区分へ振り替える。
 *
 * ファミリータイムや時間帯別電灯には「ホリデータイム」の区分がないため、
 * 公式試算表は検針期間の平日／休日の比率から按分している。
 * ここでは④の各結果シートの数式をそのまま写す。
 *
 * 按分は実測値ではなく推定である。特に「休日電力使用割合」は利用者の
 * 主観による 3 段階の選択であり、算出結果は目安として扱う必要がある。
 */

/** 休日電力使用割合。入力シート C9 → 結果シート S2 / T2 の対応。 */
export type HolidayUsageRatio = 'same' | 'more' | 'much_more';

const HOLIDAY_RATIO: Record<HolidayUsageRatio, string> = {
  same: '1',
  more: '1.2',
  much_more: '1.4'
};

export function holidayUsageRatioValue(ratio: HolidayUsageRatio): Decimal {
  return new Decimal(HOLIDAY_RATIO[ratio]);
}

export interface CalendarInput {
  /** 検針期間の日数 */
  days: number;
  /** 土日日数 */
  weekendDays: number;
  /** 国民の祝日・そのほかの日数 */
  holidayDays: number;
  holidayUsageRatio: HolidayUsageRatio;
  /** 7月検針時の 7 月日数（時間帯別電灯の夏季按分） */
  julyDays?: number;
  /** 10月検針時の 10 月日数（同上） */
  octoberDays?: number;
}

export type TouAllocation = Record<TouBand, Decimal>;

export interface AllocationResult {
  bands: TouAllocation;
  /** 按分の途中経過。画面の内訳表示と監査に使う。 */
  steps: Array<{ label: string; value: Decimal }>;
}

/** ファミリータイムⅠ/Ⅱ の 4 区分（デイタイム夏季／その他季／ファミリータイム／ナイトタイム） */
export interface FamilyTimeUsage {
  daySummerKwh: Decimal;
  dayOtherKwh: Decimal;
  familyKwh: Decimal;
  nightKwh: Decimal;
}

/**
 * ファミリータイム → 夜トク。出典: ④「ファミリーⅠ結果」「ファミリーⅡ結果」の P〜W 列。
 *
 *   平日割合   = (日数 - 土日 - 祝日) / 日数
 *   1/2FT      = ファミリータイム / 2
 *   デイタイム平日換算 = (デイタイム合計 + 1/2FT) × 平日割合
 *   ナイト平日換算     = (ナイトタイム + 1/2FT) × 平日割合
 *   ホリデータイム     = (全体 - 上記2つ) × 休日割合
 *   補正               = (上記3つの合計 - 全体) / 2 を デイタイム・ナイトから差し引く
 *   デイタイムは元の夏季／その他季の比率で振り分ける
 */
/**
 * 4 区分の合計を総使用量に厳密に一致させる。
 *
 * 按分の途中に除算が入るため、そのまま足すと有効桁の丸めで 1e-25 ほどずれる。
 * 再エネ賦課金は円未満切り捨てなので、その端数だけで **1円安くなる**。
 * しかも必ず乗り換え先が安くなる方向に出るので、削減額が過大に見える。
 *
 * そこで各区分を kWh の小数10桁に丸めたうえで、最後の 1 区分を
 * 「総使用量から残りを引いた値」として求める。10桁は検針票の分解能
 * （1kWh 単位）よりはるかに細かく、金額への影響は 0.0001 円未満。
 * 丸めた値どうしの引き算になるので合計は厳密に一致する。
 *
 * **ただし丸め誤差の範囲を超えるずれは吸収しない。** ④の按分式には
 * デイタイムが両季とも0のとき使用量がまるごと落ちる欠陥があり（S8 = IF(Q8=0,0,...)）、
 * それを黙って夜間に付け替えると、元資料に無い配分をしたうえに
 * 呼び出し側の「合計が総使用量に戻るか」の検査もすり抜けてしまう。
 * 誤差を超えるずれは式の値をそのまま返し、上位で計算不可として止めさせる。
 */
const BAND_SCALE = 10;

/** ここまでは有効桁の丸め由来とみなす（kWh） */
const ROUNDING_NOISE = new Decimal('1e-6');

function settleBands(total: Decimal, parts: TouAllocation): TouAllocation {
  const rounded: TouAllocation = {
    daySummer: parts.daySummer.toDecimalPlaces(BAND_SCALE),
    dayOther: parts.dayOther.toDecimalPlaces(BAND_SCALE),
    night: parts.night.toDecimalPlaces(BAND_SCALE),
    holiday: parts.holiday.toDecimalPlaces(BAND_SCALE)
  };
  const keys = Object.keys(rounded) as Array<keyof TouAllocation>;
  const leftover = keys.reduce((a, k) => a.minus(rounded[k]), total);

  // 誤差を超えるずれは式の値をそのまま残し、上位で計算不可として止めさせる
  if (leftover.abs().greaterThan(ROUNDING_NOISE)) return rounded;

  // 端数は**最も大きい区分**に寄せる。0 の区分に寄せると -1e-10 のような
  // 負値になり、「負の使用量が出た」として正当な検針票まで弾いてしまう
  const largest = keys.reduce((a, k) => (rounded[k].greaterThan(rounded[a]) ? k : a), keys[0]);
  return { ...rounded, [largest]: rounded[largest].plus(leftover) };
}


export function allocateFromFamilyTime(
  usage: FamilyTimeUsage,
  calendar: CalendarInput
): AllocationResult {
  const days = new Decimal(calendar.days);
  const weekdayCount = days.minus(calendar.weekendDays).minus(calendar.holidayDays);
  const weekdayRatio = weekdayCount.dividedBy(days);
  const holidayRatio = holidayUsageRatioValue(calendar.holidayUsageRatio);

  const total = usage.daySummerKwh
    .plus(usage.dayOtherKwh)
    .plus(usage.familyKwh)
    .plus(usage.nightKwh);
  const halfFamily = usage.familyKwh.dividedBy(2);
  const dayTotal = usage.daySummerKwh.plus(usage.dayOtherKwh);

  const summerShare = dayTotal.isZero() ? new Decimal('0') : usage.daySummerKwh.dividedBy(dayTotal);
  const otherShare = dayTotal.isZero() ? new Decimal('0') : usage.dayOtherKwh.dividedBy(dayTotal);

  const dayWeekday = dayTotal.plus(halfFamily).times(weekdayRatio);
  const nightWeekday = usage.nightKwh.plus(halfFamily).times(weekdayRatio);
  const holiday = total.minus(dayWeekday).minus(nightWeekday).times(holidayRatio);

  // 3 区分の合計が総使用量とずれる分をデイタイムとナイトで折半して戻す
  const excess = dayWeekday.plus(nightWeekday).plus(holiday).minus(total);
  const correction = excess.dividedBy(2);
  const day = dayWeekday.minus(correction);
  const night = nightWeekday.minus(correction);

  // 4 区分の合計は総使用量に一致していなければならない。式の上では一致するが、
  // Decimal の演算結果は有効桁で丸められるため、そのまま足すと 1e-25 ほど足りない
  // ことがある。再エネ賦課金は円未満切り捨てなので、その端数だけで
  // **1円安くなる**（しかも必ず乗り換え先が安くなる方向）。
  // 最後の 1 区分を「総使用量から残りを引いた値」として求め、合計を厳密に合わせる。
  // 値そのものは式で求めた night と同じ（algebraically identical）。
  return {
    bands: settleBands(total, {
      daySummer: day.times(summerShare),
      dayOther: day.times(otherShare),
      night,
      holiday
    }),
    steps: [
      { label: '平日数', value: weekdayCount },
      { label: '平日割合', value: weekdayRatio },
      { label: 'デイタイム平日換算', value: dayWeekday },
      { label: 'ナイトタイム平日換算', value: nightWeekday },
      { label: 'ホリデータイム', value: holiday },
      { label: '補正', value: correction },
      { label: 'ナイトタイム（式による値）', value: night }
    ]
  };
}

/** 時間帯別電灯（エコノミーナイト）の 2 区分 */
export interface EconomyNightUsage {
  dayKwh: Decimal;
  nightKwh: Decimal;
}

/**
 * 時間帯別電灯 → 夜トク。出典: ④「時間帯別結果」の Q〜X 列。
 * ファミリータイムとは別の按分式である点に注意。
 *
 *   一日平均から土日日数分を取り出して休日換算（× 休日割合）
 *   昼間・夜間はそれぞれ平日日数分を取り出して平日換算（÷ 休日割合）
 *   3 区分で割り切れなかった残りを土日／平日の日数比で振り分ける
 *   デイタイムは対象月に応じて夏季／その他季へ分ける
 */
export function allocateFromEconomyNight(
  usage: EconomyNightUsage,
  calendar: CalendarInput,
  month: number
): AllocationResult {
  const days = new Decimal(calendar.days);
  const weekend = new Decimal(calendar.weekendDays);
  const weekdayCount = days.minus(weekend).minus(calendar.holidayDays);
  const holidayRatio = holidayUsageRatioValue(calendar.holidayUsageRatio);

  const total = usage.dayKwh.plus(usage.nightKwh);
  const holidayConverted = total.dividedBy(days).times(weekend).times(holidayRatio);
  const dayConverted = usage.dayKwh.dividedBy(days).times(weekdayCount).dividedBy(holidayRatio);
  const nightConverted = usage.nightKwh.dividedBy(days).times(weekdayCount).dividedBy(holidayRatio);

  const remainder = total.minus(holidayConverted).minus(dayConverted).minus(nightConverted);
  const remainderWeekend = remainder.times(weekend.dividedBy(days));
  const remainderWeekday = remainder.minus(remainderWeekend);

  const dayTotal = dayConverted;
  const summer = summerPortion(dayTotal, calendar, month, days);
  const dayOther = dayTotal.minus(summer);
  const holiday = holidayConverted.plus(remainderWeekend);

  // ファミリー側と同じ理由で、最後の 1 区分を残りから求めて合計を厳密に合わせる。
  // 値は nightConverted + remainderWeekday と同じ
  return {
    bands: settleBands(total, {
      daySummer: summer,
      dayOther,
      holiday,
      night: nightConverted.plus(remainderWeekday)
    }),
    steps: [
      { label: '平日数', value: weekdayCount },
      { label: '休日換算', value: holidayConverted },
      { label: 'デイタイム平日換算', value: dayConverted },
      { label: 'ナイトタイム平日換算', value: nightConverted },
      { label: '按分の余り', value: remainder },
      { label: 'ナイトタイム（式による値）', value: nightConverted.plus(remainderWeekday) }
    ]
  };
}

/**
 * デイタイムのうち夏季単価が適用される分。出典: ④「時間帯別結果」R14。
 * 7月検針は期間内の 7 月分、10月検針は 10 月に入る前の分、8・9月検針は全量が夏季。
 */
function summerPortion(
  dayTotal: Decimal,
  calendar: CalendarInput,
  month: number,
  days: Decimal
): Decimal {
  if (month === 8 || month === 9) return dayTotal;
  if (month === 7) {
    const julyDays = new Decimal(calendar.julyDays ?? 0);
    return dayTotal.times(julyDays.dividedBy(days));
  }
  if (month === 10) {
    const octoberDays = new Decimal(calendar.octoberDays ?? 0);
    return dayTotal.times(new Decimal('1').minus(octoberDays.dividedBy(days)));
  }
  return new Decimal('0');
}
