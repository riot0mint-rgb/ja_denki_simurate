#!/usr/bin/env python3
"""data/rates-chugoku-2026.json の単価で電気料金を計算し、
現物 Excel（☆JAでんき簡単シミュレーション 26年7月.xlsx）の出力と一致するか検証する。

Excel のサンプルケース: 2026年5月・使用量 310kWh
  JAでんき 従量電灯A → 9,625円 / JAでんき 従量電灯S → 9,767円 / 中国電力 従量電灯A → 9,958円

計算モデル（Excel の内訳から復元）:
  従量料金合計 = 最低料金 + Σ 段階別電力量料金
  燃料費調整額 = 最低料金相当分 + 単価 × (使用量 - 15)      # 円未満の切り捨てなし
  再エネ賦課金 = 賦課金単価 × 使用量                        # 円未満切り捨て
  電気料金     = 上記合計を円未満切り捨て

使い方: python3 scripts/verify_rates.py
"""

import json
import math
import pathlib
import sys

RATES = pathlib.Path(__file__).resolve().parent.parent / "data" / "rates-chugoku-2026.json"

# 中国電力エリアの燃料費調整額のうち「最低料金（15kWhまで）」に対応する分。
# 中国電力の公表単価が per-kWh 単価とは別建てのため、kWh 単価 × 15 とは一致しない。
FCA_MINIMUM_CHARGE_PORTION = {"2026-05": -147.69}


def energy_charge(tiers, kwh):
    """段階別電力量料金の合計。"""
    total = 0.0
    for tier in tiers:
        lo = tier["fromKwh"]
        if kwh <= lo:
            break
        hi = tier["toKwh"]
        top = kwh if hi is None else min(kwh, hi)
        total += tier["rate"] * (top - lo)
    return total


def monthly_bill(plan, kwh, fca_rate, fca_min, levy_rate):
    minimum = plan["minimumCharge"]["amount"]
    free_kwh = plan["minimumCharge"]["upToKwh"]

    subtotal = minimum + energy_charge(plan["tiers"], kwh)
    fca = fca_min + fca_rate * max(0, kwh - free_kwh)
    levy = math.floor(levy_rate * kwh)

    return {
        "subtotal": round(subtotal, 2),
        "fuelCostAdjustment": round(fca, 2),
        "renewableLevy": levy,
        "total": math.floor(subtotal + fca + levy),
    }


def main():
    data = json.loads(RATES.read_text(encoding="utf-8"))
    providers = data["providers"]

    month = "2026-05"
    kwh = 310
    fca_rate = data["surcharges"]["fuelCostAdjustment"]["monthly"][month]
    fca_min = FCA_MINIMUM_CHARGE_PORTION[month]
    levy_rate = data["surcharges"]["renewableEnergyLevy"]["rate"]

    cases = [
        ("JAでんき 従量電灯A", providers["ja_denki"]["plans"]["juryo_dento_a"], 9625),
        ("JAでんき 従量電灯S", providers["ja_denki"]["plans"]["juryo_dento_s"], 9767),
        ("中国電力 従量電灯A", providers["chugoku"]["plans"]["juryo_dento_a"], 9958),
    ]

    print(f"検証条件: {month} / 使用量 {kwh}kWh / 燃調 {fca_rate}円/kWh / 再エネ賦課金 {levy_rate}円/kWh\n")

    failed = 0
    for name, plan, expected in cases:
        r = monthly_bill(plan, kwh, fca_rate, fca_min, levy_rate)
        ok = r["total"] == expected
        failed += not ok
        print(
            f"{name:18s} 従量計 {r['subtotal']:>9,.2f}  燃調 {r['fuelCostAdjustment']:>9,.2f}  "
            f"再エネ {r['renewableLevy']:>5,d}  → {r['total']:>6,d}円  "
            f"(Excel: {expected:,d}円) {'OK' if ok else 'NG'}"
        )

    print()
    if failed:
        print(f"{failed} 件が Excel と不一致")
        return 1
    print("全ケースが Excel の出力と一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
