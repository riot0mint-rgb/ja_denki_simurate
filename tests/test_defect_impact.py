"""シートの誤参照・ハードコードが試算にどれだけ効くかを数値で押さえる。

`docs/excel-audit.md` のクラス A（3 件）について、Excel の現状と
正しい単価を使った場合の差を計算し、影響の向きと大きさを固定する。
ここが変わったら、監査文書のほうも直す必要がある。
"""

from __future__ import annotations

from pathlib import Path

import pytest

from ja_denki.excel import build_lookup_table
from ja_denki.rates import RateBook

FIXTURES = Path(__file__).resolve().parent / "fixtures"
YEAR, MONTH = 2026, 5

#: 不具合のあるシート → (正しいマスタのメニュー名, 燃調系統)
DEFECTIVE = {
    "中電スマート": ("中国電力 スマートコース", "regulated"),
    "auでんきMプラン": ("auでんき でんきMプラン", "au"),
    "ソフバ くらし": ("ソフトバンク くらしでんき", "softbank"),
}

#: 影響を測る代表的な使用量
SAMPLE_USAGES = (150, 310, 400, 600)


@pytest.fixture(scope="session")
def ratebook() -> RateBook:
    return RateBook.from_json(FIXTURES / "excel_meta.json")


def tables(ratebook: RateBook, sheet: str):
    """(Excel の現状, 正しい単価) の対応表を返す。"""
    menu, series = DEFECTIVE[sheet]
    fca = ratebook.fuel_cost_adjustment(YEAR, MONTH, series)
    levy = ratebook.renewable_levy(YEAR, MONTH)
    return (
        build_lookup_table(ratebook.sheet_plan(sheet), fca, levy),
        build_lookup_table(ratebook.master_plan(menu), fca, levy),
    )


@pytest.mark.parametrize("sheet", DEFECTIVE)
def test_defect_actually_changes_the_answer(ratebook: RateBook, sheet: str) -> None:
    """3 件とも、実際に試算結果を変えている（無害な差ではない）。"""
    current, correct = tables(ratebook, sheet)
    differing = [
        kwh for kwh, _, _, _ in current.rows if current.bill_for(kwh) != correct.bill_for(kwh)
    ]
    assert differing, f"{sheet}: 差が出ないなら監査の前提が誤っている"


def test_smart_course_understates_current_bill(ratebook: RateBook) -> None:
    """中電スマート: 最低料金 622.91 → 669.92 で、現在の料金を 47 円過小評価している。"""
    current, correct = tables(ratebook, "中電スマート")
    for usage in SAMPLE_USAGES:
        gap = correct.bill_for(usage) - current.bill_for(usage)
        assert gap == 47, f"{usage}kWh で差が {gap} 円（47 円のはず）"


def test_au_difference_is_negligible(ratebook: RateBook) -> None:
    """auでんき: 各 1 銭の誤参照。310kWh で数円にとどまり、実務上は許容範囲。"""
    current, correct = tables(ratebook, "auでんきMプラン")
    gap = current.bill_for(310) - correct.bill_for(310)
    assert 0 < gap <= 5, f"310kWh の差が {gap} 円。想定は 5 円以内"


def test_kurashi_overstates_current_bill(ratebook: RateBook) -> None:
    """ソフバ くらし: くらしでんき を従量電灯A として計算しており、現在の料金を過大評価する。

    向きが他の 2 件と逆で、JAでんき の削減額を大きく見せてしまう。
    使用量が多いほど差が開く（第2段階 ▲1.19 円、第3段階 ▲2.08 円のため）。
    """
    current, correct = tables(ratebook, "ソフバ くらし")

    gaps = {usage: current.bill_for(usage) - correct.bill_for(usage) for usage in SAMPLE_USAGES}

    for usage, gap in gaps.items():
        assert gap > 0, f"{usage}kWh で過大評価になっていない（差 {gap} 円）"

    ordered = [gaps[u] for u in SAMPLE_USAGES]
    assert ordered == sorted(ordered), f"使用量が増えるほど差が開くはず: {gaps}"
    assert gaps[600] > 700, f"600kWh の差が {gaps[600]} 円。想定は 700 円超"


def test_kurashi_is_the_largest_defect(ratebook: RateBook) -> None:
    """3 件のうち ソフバ くらし の影響がいちばん大きい（修正の優先順位の根拠）。"""
    worst = {
        sheet: max(
            abs(current.bill_for(u) - correct.bill_for(u))
            for u in SAMPLE_USAGES
            for current, correct in [tables(ratebook, sheet)]
        )
        for sheet in DEFECTIVE
    }
    assert max(worst, key=worst.get) == "ソフバ くらし", worst
