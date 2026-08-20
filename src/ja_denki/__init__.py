"""JAでんき 料金シミュレータ.

現物 Excel（☆JAでんき簡単シミュレーション）のロジックをコード化したもの。
Excel の挙動を忠実に再現する `excel` モジュールと、単価マスタを表す `rates`
モジュールからなる。
"""

from ja_denki.rates import FuelCostAdjustment, Plan, RateBook, Tier
from ja_denki.excel import (
    LookupTable,
    breakdown,
    build_lookup_table,
    energy_charge,
    excel_float,
    rounddown,
)
from ja_denki.simulator import PlanResult, Simulation, Simulator

__all__ = [
    "FuelCostAdjustment",
    "Plan",
    "RateBook",
    "Tier",
    "LookupTable",
    "breakdown",
    "build_lookup_table",
    "energy_charge",
    "excel_float",
    "rounddown",
    "PlanResult",
    "Simulation",
    "Simulator",
]
