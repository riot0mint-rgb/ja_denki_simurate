"""現物 Excel の対応表を 1 点残らず再現できることを検証する。

`tests/fixtures/lookup_*.csv` は Excel から吸い出した実物。
7 シート × 241 行 = 1,687 点すべてが一致することを Phase 2 の Exit 条件とする。
"""

from __future__ import annotations

import csv
from pathlib import Path

import pytest

from ja_denki.excel import breakdown, build_lookup_table
from ja_denki.rates import RateBook

FIXTURES = Path(__file__).resolve().parent / "fixtures"

#: 現物 Excel のサンプル月
YEAR, MONTH = 2026, 5

#: シート名 → 吸い出した CSV
SHEET_FILES = {
    "中電従A": "lookup_chugoku_juryo_a.csv",
    "中電スマート": "lookup_chugoku_smart.csv",
    "中電シンプル": "lookup_chugoku_simple.csv",
    "auでんきMプラン": "lookup_au_m.csv",
    "ドコモでんき": "lookup_docomo_basic.csv",
    "ソフバ おうち": "lookup_softbank_ouchi.csv",
    "ソフバ くらし": "lookup_softbank_kurashi.csv",
}


@pytest.fixture(scope="session")
def ratebook() -> RateBook:
    return RateBook.from_json(FIXTURES / "excel_meta.json")


def load_expected(filename: str) -> list[tuple[int, int]]:
    with open(FIXTURES / filename, encoding="utf-8") as handle:
        return [
            (int(row["kwh"]), int(row["bill_yen"]))
            for row in csv.DictReader(handle)
        ]


def table_for(ratebook: RateBook, sheet: str):
    return build_lookup_table(
        ratebook.sheet_plan(sheet),
        ratebook.fuel_cost_adjustment(YEAR, MONTH, ratebook.sheet_fca_series(sheet)),
        ratebook.renewable_levy(YEAR, MONTH),
    )


@pytest.mark.parametrize("sheet,filename", SHEET_FILES.items())
def test_lookup_table_matches_excel(ratebook: RateBook, sheet: str, filename: str) -> None:
    """対応表の全行が Excel と一致する。"""
    expected = load_expected(filename)
    table = table_for(ratebook, sheet)

    assert len(table) == len(expected), f"{sheet}: 行数が違う"

    mismatches = [
        (kwh, want, table.bill_for(kwh))
        for kwh, want in expected
        if table.bill_for(kwh) != want
    ]
    assert not mismatches, (
        f"{sheet}: {len(mismatches)}/{len(expected)} 点が不一致。"
        f"先頭 5 件 (kWh, Excel, 計算) = {mismatches[:5]}"
    )


@pytest.mark.parametrize("sheet,filename", SHEET_FILES.items())
def test_inverse_lookup_is_consistent(ratebook: RateBook, sheet: str, filename: str) -> None:
    """料金 → 使用量の逆算が、対応表の定義と整合する。

    ちょうどの金額を渡せばその使用量が返り、1 円足りなければ手前の刻みに落ちる。
    """
    expected = load_expected(filename)
    table = table_for(ratebook, sheet)

    # VLOOKUP(近似一致) は「料金以下で最大の行」を返す。
    # 15kWh 以下は全行が同じ料金なので、その金額では最後の行（15kWh）が返る。
    last_kwh_for_bill: dict[int, int] = {}
    for kwh, bill in expected:
        last_kwh_for_bill[bill] = kwh

    for bill, kwh in last_kwh_for_bill.items():
        assert table.usage_for(bill) == kwh, f"{sheet}: {bill}円 → {kwh}kWh のはず"

    # 刻みの途中の金額は、直前の刻みに切り下がる
    for bill, kwh in last_kwh_for_bill.items():
        if bill == table.max_bill:
            continue
        assert table.usage_for(bill + 0.5) == kwh, (
            f"{sheet}: {bill + 0.5}円 は {kwh}kWh に落ちるはず"
        )


def test_upper_bound_is_rejected(ratebook: RateBook) -> None:
    """試算可能料金上限を超えた入力は弾く。"""
    table = table_for(ratebook, "中電従A")
    with pytest.raises(ValueError, match="試算可能料金上限"):
        table.usage_for(table.max_bill + 1)


def test_lower_bound_is_rejected(ratebook: RateBook) -> None:
    """最低料金を下回る入力も弾く。"""
    table = table_for(ratebook, "中電従A")
    with pytest.raises(ValueError, match="下回"):
        table.usage_for(1)


class TestExcelSampleCase:
    """Excel が画面に出しているサンプル（2026年5月・電気料金 10,000 円）。"""

    def test_estimated_usage(self, ratebook: RateBook) -> None:
        table = table_for(ratebook, "中電従A")
        assert table.usage_for(10_000) == 310

    @pytest.mark.parametrize(
        "menu,expected",
        [("JAでんき 従量電灯A", 9625), ("JAでんき 従量電灯S", 9767)],
    )
    def test_ja_denki_bill(self, ratebook: RateBook, menu: str, expected: int) -> None:
        """切替後の料金が Excel の表示と一致する。"""
        result = breakdown(
            ratebook.master_plan(menu),
            310,
            ratebook.fuel_cost_adjustment(YEAR, MONTH, "liberalized"),
            ratebook.renewable_levy(YEAR, MONTH),
        )
        assert result.total == expected

    def test_current_bill_breakdown(self, ratebook: RateBook) -> None:
        """現在契約の内訳は 9,958 円。対応表の 9,957 円とは 1 円ずれる。"""
        result = breakdown(
            ratebook.sheet_plan("中電従A"),
            310,
            ratebook.fuel_cost_adjustment(YEAR, MONTH, "regulated"),
            ratebook.renewable_levy(YEAR, MONTH),
        )
        assert result.total == 9958
        assert table_for(ratebook, "中電従A").bill_for(310) == 9957
