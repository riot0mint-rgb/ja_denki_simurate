import { Decimal } from './decimal-config.js';
import { MonthlyDemandProfile } from './demandProfile.js';
import { DEFAULT_READING_DAY, meterCalendarOf, summerFractionOf } from './meterCalendar.js';
import { UsageAmount, UsageFormKind, UsageInput } from './models.js';

/**
 * 年間の試算で、検針票の1か月ぶんから「ほかの月の使用量」を組み立てる。
 *
 * 総使用量だけのプランは、季節の使われ方（MonthlyDemandProfile）の比で増減させるだけで済む。
 * 時間帯別・季節別のプランは、それに加えて次の2点を月ごとに作り直す。
 *
 * **① 夏季／その他季の区分**。デイタイム（低圧電力は全量）が夏季単価か
 *    その他季単価かは、使い方ではなく**カレンダー**で決まる。7月・10月の検針は
 *    期間が季節をまたぐので、検針日から夏季にかかる割合を数える。
 *    ここを検針票の月のままにすると、1月の使用量を夏季単価で計算してしまう。
 *
 * **② 夜トクへ振り替える検針期間**（ファミリー・時間帯別電灯）。土日・祝日の日数は
 *    月ごとに違うので、月ごとのカレンダーで数え直す。
 *
 * 一方、**昼・夜・休日（ファミリータイム）の割合は入力した月のまま動かさない。**
 * 季節でその割合がどう変わるかを示す統計が見つかっていないため（CLAUDE.md ルール8）。
 * 割合が実際には動くぶんの誤差は、上下どちらに出るか分からない。画面にもそう書く。
 *
 * 入力した月（基準月）の使用量は、丸めずそのまま返す。
 */
export interface UsageForMonthInput {
  form: UsageFormKind;
  base: UsageInput;
  baseMonth: { year: number; month: number };
  target: { year: number; month: number };
  /** null なら使用量は増減させない（毎月おなじ）。区分の振り分けだけは月に合わせる */
  profile: MonthlyDemandProfile | null;
  /** 毎月の検針日。省略時は月の中ごろ */
  readingDay?: number;
}

const toDecimal = (v: UsageAmount | undefined): Decimal => new Decimal(v ?? 0);

/** 検針票と同じ整数 kWh に丸める */
const wholeKwh = (v: Decimal): Decimal => v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/**
 * 指定した月の使用量。組み立てられないときは null（検針日が範囲外、
 * 夜トクへの振り替えに要る検針期間の情報が元の入力に無い、など）。
 */
export function usageForMonth(input: UsageForMonthInput): UsageInput | null {
  const { form, base, baseMonth, target, profile } = input;
  if (baseMonth.year === target.year && baseMonth.month === target.month) return base;

  const readingDay = input.readingDay ?? DEFAULT_READING_DAY;
  const scale = profile
    ? profile.monthlyIndex[target.month - 1].dividedBy(profile.monthlyIndex[baseMonth.month - 1])
    : new Decimal(1);
  const scaled = (v: UsageAmount | undefined) => wholeKwh(toDecimal(v).times(scale));

  if (form === 'total') {
    return { ...base, totalKwh: scaled(base.totalKwh).toNumber() };
  }

  // 夏季にかかる割合。検針日が範囲外なら全体を組み立てられない
  const summer = summerFractionOf(target.year, target.month, readingDay);
  if (summer === null) return null;
  const splitDay = (dayTotal: Decimal) => {
    const daySummer = wholeKwh(dayTotal.times(summer));
    return { daySummer, dayOther: dayTotal.minus(daySummer) };
  };

  if (form === 'seasonal') {
    const total = scaled(toDecimal(base.seasonal?.summerKwh).plus(toDecimal(base.seasonal?.otherKwh)));
    const { daySummer, dayOther } = splitDay(total);
    return {
      ...base,
      seasonal: { summerKwh: daySummer.toNumber(), otherKwh: dayOther.toNumber() },
      totalKwh: total.toNumber()
    };
  }

  if (form === 'tou') {
    const day = scaled(toDecimal(base.tou?.daySummer).plus(toDecimal(base.tou?.dayOther)));
    const split = splitDay(day);
    return {
      ...base,
      tou: {
        daySummer: split.daySummer.toNumber(),
        dayOther: split.dayOther.toNumber(),
        night: scaled(base.tou?.night).toNumber(),
        holiday: scaled(base.tou?.holiday).toNumber()
      }
    };
  }

  // 夜トクへ振り替える2つの形式。月ごとの検針期間が要る
  const ratio = base.calendar?.holidayUsageRatio;
  if (!ratio) return null;
  // 検針日は上で夏季の割合を求めるときに検証済みなので、calendar が null になることはない
  const calendar = meterCalendarOf(target.year, target.month, readingDay, ratio);
  if (form === 'family') {
    const day = scaled(toDecimal(base.familyTime?.daySummer).plus(toDecimal(base.familyTime?.dayOther)));
    const split = splitDay(day);
    return {
      ...base,
      familyTime: {
        daySummer: split.daySummer.toNumber(),
        dayOther: split.dayOther.toNumber(),
        family: scaled(base.familyTime?.family).toNumber(),
        night: scaled(base.familyTime?.night).toNumber()
      },
      calendar: calendar!
    };
  }
  return {
    ...base,
    economyNight: {
      dayKwh: scaled(base.economyNight?.dayKwh).toNumber(),
      nightKwh: scaled(base.economyNight?.nightKwh).toNumber()
    },
    calendar: calendar!
  };
}

/** 画面に出す、その月の総使用量 */
export function totalKwhOf(form: UsageFormKind, usage: UsageInput): number {
  const sum = (values: Array<UsageAmount | undefined>) =>
    values.reduce<Decimal>((a, v) => a.plus(toDecimal(v)), new Decimal(0)).toNumber();
  switch (form) {
    case 'total':
      return usage.totalKwh ?? 0;
    case 'seasonal':
      return sum([usage.seasonal?.summerKwh, usage.seasonal?.otherKwh]);
    case 'tou':
      return sum([usage.tou?.daySummer, usage.tou?.dayOther, usage.tou?.night, usage.tou?.holiday]);
    case 'family':
      return sum([
        usage.familyTime?.daySummer,
        usage.familyTime?.dayOther,
        usage.familyTime?.family,
        usage.familyTime?.night
      ]);
    case 'economy_night':
      return sum([usage.economyNight?.dayKwh, usage.economyNight?.nightKwh]);
  }
}
