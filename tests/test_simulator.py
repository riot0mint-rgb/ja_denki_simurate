"""シミュレータの試算結果を Excel および正しい単価と突き合わせる。"""

from __future__ import annotations

from pathlib import Path

import pytest

from ja_denki.rates import RateBook
from ja_denki.simulator import BREAK_EVEN_KWH, Simulator

FIXTURES = Path(__file__).resolve().parent / "fixtures"
YEAR, MONTH = 2026, 5


@pytest.fixture(scope="session")
def ratebook() -> RateBook:
    return RateBook.from_json(FIXTURES / "excel_meta.json")


class TestExcelParity:
    """Excel が画面に出している値と一致すること。"""

    def test_sample_case(self, ratebook: RateBook) -> None:
        """中電従A・10,000 円 → 推定 310kWh、従量電灯A 9,625 円、従量電灯S 9,767 円。"""
        result = Simulator(ratebook, "中電従A", YEAR, MONTH).run(10_000)

        assert result.estimated_usage_kwh == 310
        assert result.tiered.monthly_bill == 9_625
        assert result.small.monthly_bill == 9_767

        # Excel は「月間削減 -375 円」と負で出すが、こちらは削減額を正で持つ
        assert result.tiered.monthly_saving == 375
        assert result.small.monthly_saving == 233

    def test_smart_sample_case(self, ratebook: RateBook) -> None:
        """中電スマート・10,000 円 → Excel は推定 315kWh。誤ったハードコードを含む現状を再現する。"""
        result = Simulator(ratebook, "中電スマート", YEAR, MONTH).run(10_000)
        assert result.estimated_usage_kwh == 315

    def test_max_simulatable_bill(self, ratebook: RateBook) -> None:
        assert Simulator(ratebook, "中電従A", YEAR, MONTH).max_simulatable_bill == 41_908


class TestPlanSelection:
    """従量電灯A と 従量電灯S の選択。"""

    @pytest.mark.parametrize("menu", ["中電従A", "中電スマート", "ソフバ おうち"])
    def test_recommendation_agrees_with_break_even(self, ratebook: RateBook, menu: str) -> None:
        """実際の削減額で選んだ推奨と、損益分岐点で選んだ推奨が一致する。

        営業資料は「217kWh/月」という単純な基準で説明している。それが
        実際の削減額と食い違わないことを確かめる。
        """
        simulator = Simulator(ratebook, menu, YEAR, MONTH)
        table_max = simulator.max_simulatable_bill

        disagreements = []
        for bill in range(1_000, table_max, 500):
            result = simulator.run(bill)
            if result.recommended.name != result.recommended_by_break_even.name:
                disagreements.append((bill, result.estimated_usage_kwh))

        # 分岐点ちょうどの近傍は刻みの都合でずれうるので、離れた点でのずれだけ問題にする
        far = [
            (bill, kwh)
            for bill, kwh in disagreements
            if abs(kwh - BREAK_EVEN_KWH) > 10
        ]
        assert not far, f"{menu}: 分岐点から離れた点で推奨が食い違う: {far[:5]}"

    def test_small_plan_wins_for_light_usage(self, ratebook: RateBook) -> None:
        """使用量が少ない世帯では 従量電灯S が有利。"""
        simulator = Simulator(ratebook, "中電従A", YEAR, MONTH)
        result = simulator.run(simulator._table.bill_for(150))
        assert result.recommended.name.endswith("従量電灯S")

    def test_tiered_plan_wins_for_heavy_usage(self, ratebook: RateBook) -> None:
        """使用量が多い世帯では 従量電灯A が有利。"""
        simulator = Simulator(ratebook, "中電従A", YEAR, MONTH)
        result = simulator.run(simulator._table.bill_for(400))
        assert result.recommended.name.endswith("従量電灯A")


class TestOutOfRange:
    def test_above_cap(self, ratebook: RateBook) -> None:
        simulator = Simulator(ratebook, "中電従A", YEAR, MONTH)
        with pytest.raises(ValueError, match="試算可能料金上限"):
            simulator.run(simulator.max_simulatable_bill + 1)

    def test_below_floor(self, ratebook: RateBook) -> None:
        with pytest.raises(ValueError, match="下回"):
            Simulator(ratebook, "中電従A", YEAR, MONTH).run(100)

    def test_unknown_month(self, ratebook: RateBook) -> None:
        with pytest.raises(KeyError, match="燃調"):
            Simulator(ratebook, "中電従A", 2031, 1)


class TestKurashiDefectInPractice:
    """`ソフバ くらし` の誤参照が、営業現場でどう出るか。

    くらしでんき の顧客に対して、削減額を実際より大きく見せてしまう。
    ここが変わったら docs/excel-audit.md も直すこと。
    """

    BILL = 20_000

    def _both(self, ratebook: RateBook):
        current = Simulator(ratebook, "ソフバ くらし", YEAR, MONTH).run(self.BILL)
        corrected = Simulator(
            ratebook, "ソフバ くらし", YEAR, MONTH, use_corrected_rates=True
        ).run(self.BILL)
        return current, corrected

    def test_usage_is_underestimated(self, ratebook: RateBook) -> None:
        """現在の料金を過大評価するぶん、推定使用量は少なく出る。"""
        current, corrected = self._both(ratebook)
        assert current.estimated_usage_kwh < corrected.estimated_usage_kwh

    def test_saving_is_overstated_by_about_10k_a_year(self, ratebook: RateBook) -> None:
        """年間削減額が 1 万円近く過大に出る。"""
        current, corrected = self._both(ratebook)
        overstatement = current.recommended.annual_saving - corrected.recommended.annual_saving
        assert 8_000 < overstatement < 12_000, f"過大表示は {overstatement:,} 円/年"

    def test_small_plan_looks_beneficial_but_is_not(self, ratebook: RateBook) -> None:
        """従量電灯S が「削減になる」と出るが、正しい単価では増額になる。

        プラン選択そのものを誤らせるので、金額のずれより質が悪い。
        """
        current, corrected = self._both(ratebook)
        assert current.small.is_beneficial
        assert not corrected.small.is_beneficial
