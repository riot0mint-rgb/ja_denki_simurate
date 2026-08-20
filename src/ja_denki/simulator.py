"""JAでんき 切替シミュレータ。

現在の電気料金から使用量を逆算し、JAでんき に切り替えた場合の料金と
削減額を返す。現物 Excel のシート 1 枚分に相当する。

Excel と同じく、これは**簡易試算**であることを前提にした精度しか出ない。
入力が請求額 1 点だけで、そこから 5kWh 刻みで使用量を推定するため、
実際の使用量は推定値と次の刻みの間のどこかにある。
"""

from __future__ import annotations

from dataclasses import dataclass

from ja_denki.excel import LookupTable, breakdown, build_lookup_table
from ja_denki.rates import Plan, RateBook

#: 従量電灯S と 従量電灯A の損益分岐点（kWh/月）。
#: これ以下なら S、これを超えるなら A が有利。JA 推進資料 p.17 より。
BREAK_EVEN_KWH = 217

#: JAでんき 側のメニュー名（`基本項目` マスタのキー）
JA_TIERED = "JAでんき 従量電灯A"
JA_SMALL = "JAでんき 従量電灯S"

#: JAでんき は自由料金メニューなので燃調も自由料金系統
JA_FCA_SERIES = "liberalized"


@dataclass(frozen=True)
class PlanResult:
    """切替先 1 プランの試算結果。"""

    name: str
    monthly_bill: int
    monthly_saving: int

    @property
    def annual_saving(self) -> int:
        """年間削減額。単純に 12 倍したもので、季節変動は考慮していない。"""
        return self.monthly_saving * 12

    @property
    def is_beneficial(self) -> bool:
        return self.monthly_saving > 0


@dataclass(frozen=True)
class Simulation:
    """試算 1 件分の結果。"""

    year: int
    month: int
    current_menu: str
    current_bill: int
    estimated_usage_kwh: int
    max_simulatable_bill: int
    tiered: PlanResult
    small: PlanResult

    @property
    def recommended(self) -> PlanResult:
        """推奨プラン。

        損益分岐点（217kWh/月）で機械的に決めるのではなく、実際に削減額が
        大きいほうを返す。両者が一致することを `test_recommendation` で確認している。
        """
        return max((self.tiered, self.small), key=lambda plan: plan.monthly_saving)

    @property
    def recommended_by_break_even(self) -> PlanResult:
        """損益分岐点だけで決めた場合の推奨プラン（営業資料の説明と同じ論法）。"""
        return self.small if self.estimated_usage_kwh <= BREAK_EVEN_KWH else self.tiered

    @property
    def any_benefit(self) -> bool:
        """どちらかのプランで削減になるか。"""
        return self.tiered.is_beneficial or self.small.is_beneficial


class Simulator:
    """ある月・ある現契約メニューについての試算器。

    対応表の構築は使い回せるので、同じ条件で複数の料金を試算するときは
    インスタンスを再利用する。
    """

    def __init__(
        self,
        ratebook: RateBook,
        current_menu: str,
        year: int,
        month: int,
        *,
        use_corrected_rates: bool = False,
    ) -> None:
        """
        Args:
            current_menu: 現契約のシート名（`中電従A` など）
            use_corrected_rates: True なら、シートの誤参照を無視して
                `基本項目` マスタの正しい単価で試算する。既定は Excel の現状を再現。
        """
        self.ratebook = ratebook
        self.current_menu = current_menu
        self.year = year
        self.month = month

        current_plan = self._current_plan(current_menu, use_corrected_rates)
        current_fca = ratebook.fuel_cost_adjustment(
            year, month, ratebook.sheet_fca_series(current_menu)
        )
        levy = ratebook.renewable_levy(year, month)

        self._levy = levy
        self._ja_fca = ratebook.fuel_cost_adjustment(year, month, JA_FCA_SERIES)
        self._table: LookupTable = build_lookup_table(current_plan, current_fca, levy)
        self._ja_plans = {
            JA_TIERED: ratebook.master_plan(JA_TIERED),
            JA_SMALL: ratebook.master_plan(JA_SMALL),
        }

    def _current_plan(self, menu: str, corrected: bool) -> Plan:
        if not corrected:
            return self.ratebook.sheet_plan(menu)
        master_name = CORRECTED_MENU.get(menu)
        if master_name is None:
            return self.ratebook.sheet_plan(menu)
        return self.ratebook.master_plan(master_name)

    @property
    def max_simulatable_bill(self) -> int:
        """試算可能料金上限。"""
        return self._table.max_bill

    def run(self, current_bill: float) -> Simulation:
        """現在の電気料金から切替後の料金と削減額を試算する。

        Raises:
            ValueError: 電気料金が試算可能な範囲の外にあるとき。
        """
        usage = self._table.usage_for(current_bill)
        bill = int(current_bill)

        results = {
            name: self._plan_result(name, plan, usage, bill)
            for name, plan in self._ja_plans.items()
        }

        return Simulation(
            year=self.year,
            month=self.month,
            current_menu=self.current_menu,
            current_bill=bill,
            estimated_usage_kwh=usage,
            max_simulatable_bill=self.max_simulatable_bill,
            tiered=results[JA_TIERED],
            small=results[JA_SMALL],
        )

    def _plan_result(self, name: str, plan: Plan, usage: int, current_bill: int) -> PlanResult:
        result = breakdown(plan, usage, self._ja_fca, self._levy)
        return PlanResult(
            name=name,
            monthly_bill=result.total,
            monthly_saving=current_bill - result.total,
        )


#: 誤参照のあるシート → `基本項目` マスタの正しいメニュー名
CORRECTED_MENU = {
    "中電従A": "中国電力 従量電灯A",
    "中電スマート": "中国電力 スマートコース",
    "中電シンプル": "中国電力 シンプルコース",
    "auでんきMプラン": "auでんき でんきMプラン",
    "ドコモでんき": "ドコモでんき Basic",
    "ソフバ おうち": "ソフトバンク おうちでんき",
    "ソフバ くらし": "ソフトバンク くらしでんき",
}
