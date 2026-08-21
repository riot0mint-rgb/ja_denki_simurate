import { BillingCalculator } from './calculator.js';
import { FuelAdjustment, RatePlan, RenewableLevy, UsageInput } from './models.js';

/**
 * 電気料金（円）から使用量（kWh）を逆算する。
 *
 * 検針票が手元にないお客様向けの「かんたん試算」で使う。
 * 請求額は使用量に対して単調非減少なので、二分探索で求まる。
 * **生成AIも近似式も使わない。** 実際の計算式をそのまま逆に引くだけ。
 *
 * 逆算は一意に決まらない。円未満を切り捨てているため、同じ請求額になる
 * 使用量に幅がある。幅の中央を返し、幅そのものも返す。
 * 画面では「およそ◯kWh」と出し、概算であることを明示すること。
 */

/** 逆算の上限。低圧の家庭用で月3,000kWhを超える契約は想定しない */
const MAX_KWH = 3000;

export interface UsageEstimate {
  /** 逆算した使用量（kWh・整数） */
  kwh: number;
  /** 同じ請求額になる使用量の下限と上限（整数kWh） */
  rangeKwh: { min: number; max: number };
  /** その使用量で計算し直した請求額。入力額と一致しないことがある */
  billYen: number;
  /** 入力された請求額をぴったり再現できたか */
  exact: boolean;
}

export type UsageEstimateResult =
  | { status: 'ok'; estimate: UsageEstimate }
  | { status: 'unsupported'; reason: string; nextSteps: string[] };

const calculator = new BillingCalculator();

/**
 * 使用量を差し替えて請求額を出す。総使用量だけで決まるプランにしか使えない
 * （時間帯別・季節別は月ごとの内訳が料金からは決まらないため）。
 */
function billAt(
  kwh: number,
  plan: RatePlan,
  usage: UsageInput,
  fuelAdjustment: FuelAdjustment,
  renewableLevy: RenewableLevy
): number | null {
  const result = calculator.calculate({
    usage: { ...usage, totalKwh: kwh },
    plan,
    fuelAdjustment,
    renewableLevy
  });
  return result.status === 'ok' ? result.bill.total.toNumber() : null;
}

export function estimateUsageFromBill(input: {
  targetYen: number;
  plan: RatePlan;
  usage: UsageInput;
  fuelAdjustment: FuelAdjustment;
  renewableLevy: RenewableLevy;
}): UsageEstimateResult {
  const { targetYen, plan, usage, fuelAdjustment, renewableLevy } = input;

  if (!Number.isFinite(targetYen) || targetYen <= 0) {
    return {
      status: 'unsupported',
      reason: '電気料金は0より大きい金額を入力してください',
      nextSteps: ['1か月の電気料金を円単位で入力してください']
    };
  }

  const at = (kwh: number) => billAt(kwh, plan, usage, fuelAdjustment, renewableLevy);

  const atZero = at(0);
  const atMax = at(MAX_KWH);
  if (atZero === null || atMax === null) {
    return {
      status: 'unsupported',
      reason: 'このプランは電気料金からの逆算に対応していません',
      nextSteps: ['「くわしい試算」からご使用量を入力してください']
    };
  }

  // 基本料金や最低料金があるため、下限より安い請求額にはならない
  if (targetYen < atZero) {
    return {
      status: 'unsupported',
      reason: `このご契約では請求額が ${atZero.toLocaleString()}円 を下回りません`,
      nextSteps: [
        '検針票の請求額をもう一度ご確認ください',
        'ご契約容量が検針票と合っているかご確認ください'
      ]
    };
  }
  if (targetYen > atMax) {
    return {
      status: 'unsupported',
      reason: `${MAX_KWH.toLocaleString()}kWh を超えるご使用量は試算に対応していません`,
      nextSteps: ['「くわしい試算」からご使用量を直接入力してください']
    };
  }

  // 請求額は使用量に対して単調非減少。targetYen 以上になる最小の kWh を探す
  let lo = 0;
  let hi = MAX_KWH;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    // 0kWh と上限の両方が計算できているので、その間で null にはならない
    // （総使用量だけで決まるプランに限って呼ばれるため）
    const value = at(mid)!;
    if (value >= targetYen) hi = mid;
    else lo = mid + 1;
  }

  // 1kWh あたり数十円動くので、入力額ぴったりの使用量は無いことが多い。
  // 直前の kWh と比べ、入力額に近いほうを採る
  const upper = at(lo)!;
  const lowerKwh = lo > 0 ? lo - 1 : null;
  const lower = lowerKwh === null ? null : at(lowerKwh)!;
  const pickLower =
    lower !== null && Math.abs(lower - targetYen) < Math.abs(upper - targetYen);
  const kwh = pickLower ? lowerKwh! : lo;
  const billYen = pickLower ? lower! : upper;
  const exact = billYen === targetYen;

  // 同じ請求額になる範囲。円未満を切り捨てているため幅が出ることがある
  let min = kwh;
  while (min - 1 >= 0 && at(min - 1) === billYen) min--;
  let max = kwh;
  while (max + 1 <= MAX_KWH && at(max + 1) === billYen) max++;

  return {
    status: 'ok',
    estimate: {
      kwh: Math.round((min + max) / 2),
      rangeKwh: { min, max },
      billYen,
      exact
    }
  };
}
