"""現物 Excel の計算ロジックを忠実に再現する。

Excel は同じ使用量に対して 2 つの答えを持つ。

* **対応表**（`Q6:T246`）— 5kWh 刻みで「使用量 → 電気料金」を並べたもの。
  入力された電気料金から使用量を逆算するのに使う。
  15kWh 行の小計を `ROUNDDOWN` してから積み上げるため、端数が切り捨てられる。
* **表示用内訳**（`V22:AB35`）— 画面に出す料金内訳。切り捨ては最後だけ。

両者は同じ使用量でも 1 円程度ずれる。310kWh・中電従A で対応表 9,957 円、
内訳 9,958 円。どちらも Excel の実際の出力なので、両方を再現する。
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass

from ja_denki.rates import FREE_KWH, FuelCostAdjustment, Plan

#: 対応表がカバーする使用量の上限（kWh）
MAX_KWH = 1200

#: 対応表の刻み（kWh）
STEP_KWH = 5


def excel_float(value: float) -> float:
    """Excel の 15 桁正規化。

    Excel は計算結果を有効数字 15 桁に丸めてから次の演算に渡す。
    これがないと `450 * 4.18 + 62` が 1942.9999999999998 のままになり、
    切り捨てで 1 円ずれる（465kWh など 4 点で実際に起きる）。
    """
    if value == 0 or not math.isfinite(value):
        return value
    return float(f"{value:.15g}")


def rounddown(value: float, digits: int = 0) -> float:
    """Excel の ROUNDDOWN。

    0 方向への切り捨てで、Python の floor とは負数で挙動が違う。
    切り捨て前に Excel の 15 桁正規化をかける。
    """
    factor = 10**digits
    return math.trunc(excel_float(value * factor)) / factor


def energy_charge(plan: Plan, usage: int) -> float:
    """段階別電力量料金の合計（最低料金・基本料金を含まない）。"""
    return sum(tier.rate * tier.kwh_in(usage) for tier in plan.tiers)


@dataclass(frozen=True)
class Breakdown:
    """表示用内訳（`V22:AB35` 相当）。"""

    usage_kwh: int
    base: float
    energy: float
    fuel_cost_adjustment: float
    renewable_levy: int
    total: int

    @property
    def usage_subtotal(self) -> float:
        """従量料金合計（最低料金 + 電力量料金）。"""
        return self.base + self.energy


def breakdown(
    plan: Plan,
    usage: int,
    fca: FuelCostAdjustment,
    levy_rate: float,
) -> Breakdown:
    """表示用内訳を計算する（Excel の `AB35` 系）。

    再エネ賦課金だけ先に切り捨て、最後に合計を切り捨てる。
    """
    energy = energy_charge(plan, usage)

    if plan.is_minimum_monthly:
        # シンプルコース型: 従量料金合計が最低月額料金を下回るなら最低月額料金
        base = 0.0
        subtotal = max(energy, plan.minimum_monthly)
    else:
        base = plan.minimum_charge
        subtotal = base + energy

    fca_amount = fca.amount(usage)
    levy = int(rounddown(levy_rate * FREE_KWH + levy_rate * max(0, usage - FREE_KWH)))

    if plan.is_minimum_monthly and subtotal + fca_amount < plan.minimum_monthly:
        # Excel: =IF(AB28+AB31<1844.7,1845,...) — 最低月額料金を割り込んだ月の特例
        total = int(math.ceil(plan.minimum_monthly))
    else:
        total = int(rounddown(subtotal + fca_amount + levy))

    return Breakdown(
        usage_kwh=usage,
        base=base,
        energy=energy,
        fuel_cost_adjustment=fca_amount,
        renewable_levy=levy,
        total=total,
    )


class LookupTable:
    """5kWh 刻みの「使用量 → 電気料金」対応表と、その逆引き。"""

    def __init__(self, rows: list[tuple[int, int, float, int]]) -> None:
        #: (使用量kWh, 電気料金円, 従量料金+燃調費, 再エネ賦課金)
        self.rows = rows
        self._bills = [bill for _, bill, _, _ in rows]

    def __len__(self) -> int:
        return len(self.rows)

    def bill_for(self, usage: int) -> int:
        """使用量に対応する電気料金。刻みに乗らない使用量は許さない。"""
        for kwh, bill, _, _ in self.rows:
            if kwh == usage:
                return bill
        raise KeyError(f"{usage}kWh は対応表にありません（刻みは {STEP_KWH}kWh）")

    @property
    def max_bill(self) -> int:
        """試算可能料金上限。これを超える電気料金は逆算できない。"""
        return self._bills[-1]

    def usage_for(self, bill: float) -> int:
        """電気料金から使用量を逆算する（Excel の `VLOOKUP(..., TRUE)` 相当）。

        料金以下で最大の行の使用量を返す。近似一致なので、実際の使用量は
        戻り値以上・次の刻み未満のどこかにある。
        """
        if bill < self._bills[0]:
            raise ValueError(
                f"{bill:,.0f} 円は試算可能な下限 {self._bills[0]:,} 円を下回っています"
            )
        if bill > self.max_bill:
            raise ValueError(
                f"{bill:,.0f} 円は試算可能料金上限 {self.max_bill:,} 円を超えています"
            )
        # bisect_right - 1 で「bill 以下の最大の行」を得る
        index = bisect.bisect_right(self._bills, bill) - 1
        return self.rows[index][0]


def build_lookup_table(
    plan: Plan,
    fca: FuelCostAdjustment,
    levy_rate: float,
    max_kwh: int = MAX_KWH,
    step: int = STEP_KWH,
) -> LookupTable:
    """対応表を組み立てる（Excel の `Q6:T246` 相当）。

    15kWh 以下の行は最低料金そのもの。それを超える行は、15kWh 行の小計を
    `ROUNDDOWN` した値を起点に、段階ごとに（従量単価 + 燃調単価）を積む。
    この起点の切り捨てが、表示用内訳との 1 円のずれを生む。
    """
    levy_at_free = rounddown(levy_rate * FREE_KWH)

    if plan.is_minimum_monthly:
        return _build_flat_table(plan, fca, levy_rate, levy_at_free, max_kwh, step)

    # 15kWh までの行
    base_energy = rounddown(plan.minimum_charge + fca.minimum_charge_portion)
    rows: list[tuple[int, int, float, int]] = []
    for kwh in range(0, FREE_KWH + 1, step):
        rows.append((kwh, int(base_energy + levy_at_free), base_energy, int(levy_at_free)))

    # 15kWh 超の行。段階の境界ごとに小計を持ち越す
    anchors = [(FREE_KWH, base_energy)]
    for tier in plan.tiers:
        if tier.to_kwh is None:
            break
        span = tier.to_kwh - tier.from_kwh
        prev_kwh, prev_value = anchors[-1]
        anchors.append((tier.to_kwh, excel_float(prev_value + span * (tier.rate + fca.per_kwh))))

    for kwh in range(FREE_KWH + step, max_kwh + 1, step):
        tier = _tier_for(plan, kwh)
        anchor_kwh, anchor_value = _anchor_for(anchors, kwh)
        energy_fca = excel_float(anchor_value + (kwh - anchor_kwh) * (tier.rate + fca.per_kwh))
        levy = int(rounddown(levy_at_free + (kwh - FREE_KWH) * levy_rate))
        rows.append((kwh, int(rounddown(energy_fca + levy)), energy_fca, levy))

    return LookupTable(rows)


def _build_flat_table(
    plan: Plan,
    fca: FuelCostAdjustment,
    levy_rate: float,
    levy_at_free: float,
    max_kwh: int,
    step: int,
) -> LookupTable:
    """シンプルコース型（全量一律単価・最低月額料金）の対応表。

    Excel: `=IF(S<1844.3, 1844, S+T)` — 最低月額料金を割り込む行は
    賦課金を足さずに 1844 で頭打ちになる。
    """
    rate = plan.tiers[0].rate
    floor_value = int(plan.minimum_monthly)
    threshold = plan.minimum_monthly - 0.4  # Excel の 1844.3

    rows: list[tuple[int, int, float, int]] = []
    for kwh in range(0, max_kwh + 1, step):
        if kwh <= FREE_KWH:
            energy_fca = rounddown(rate * kwh + fca.minimum_charge_portion)
            levy = int(levy_at_free)
        else:
            energy_fca = rounddown((rate + fca.per_kwh) * kwh)
            levy = int(rounddown(levy_at_free + (kwh - FREE_KWH) * levy_rate))
        bill = floor_value if energy_fca < threshold else int(energy_fca + levy)
        rows.append((kwh, bill, energy_fca, levy))

    return LookupTable(rows)


def _tier_for(plan: Plan, kwh: int):
    for tier in plan.tiers:
        if tier.to_kwh is None or kwh <= tier.to_kwh:
            return tier
    return plan.tiers[-1]


def _anchor_for(anchors: list[tuple[int, float]], kwh: int) -> tuple[int, float]:
    chosen = anchors[0]
    for anchor in anchors:
        if anchor[0] < kwh:
            chosen = anchor
    return chosen
