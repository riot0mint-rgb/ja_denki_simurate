"""燃調の取得・解析・差分検知。"""

from __future__ import annotations

import copy
import datetime
import json
from pathlib import Path

import pytest

from ja_denki.sources.chugoku import (
    FuelAdjustmentRow,
    ParseError,
    parse_fuel_adjustment,
)
from ja_denki.updater import (
    apply_fuel_adjustment,
    check_staleness,
    diff_fuel_adjustment,
    load_master,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def page() -> str:
    return (FIXTURES / "energia_nencho.html").read_text(encoding="utf-8", errors="replace")


@pytest.fixture(scope="session")
def fetched(page: str):
    return parse_fuel_adjustment(page)


@pytest.fixture()
def master() -> dict:
    return load_master(ROOT / "data" / "rates-chugoku-2026.json")


class TestParse:
    def test_both_series_are_found(self, fetched) -> None:
        assert set(fetched) == {"regulated", "liberalized"}
        assert all(rows for rows in fetched.values())

    def test_values_are_negative(self, fetched) -> None:
        """▲ 表記の値は負として読む。取り違えると料金が跳ね上がる。"""
        for rows in fetched.values():
            for row in rows:
                assert row.minimum_charge_portion < 0
                assert row.per_kwh < 0

    def test_minimum_portion_is_not_15x_per_kwh(self, fetched) -> None:
        """最低料金分は 1kWh 単価の 15 倍ではない。両方を別々に読む必要がある。"""
        row = next(r for r in fetched["regulated"] if r.key == "2026-05")
        assert row.minimum_charge_portion == pytest.approx(-147.69)
        assert row.per_kwh == pytest.approx(-9.83)
        assert row.minimum_charge_portion != pytest.approx(row.per_kwh * 15)

    def test_matches_the_excel_master(self, fetched, master: dict) -> None:
        """取得元と単価マスタが、重なっている月ですべて一致する。

        マスタは Excel 由来なので、これは Excel の燃調が正しいことの独立検証になる。
        """
        series = master["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]
        overlapping = [row for row in fetched["regulated"] if row.key in series]
        assert len(overlapping) >= 20, "重なりが少なすぎて検証にならない"

        for row in overlapping:
            entry = series[row.key]
            assert entry["minimumCharge"] == pytest.approx(row.minimum_charge_portion), row.key
            assert entry["perKwh"] == pytest.approx(row.per_kwh), row.key

    @pytest.mark.parametrize(
        "broken", ["<html><body>表がありません</body></html>", "<table><tr><td>空</td></tr></table>"]
    )
    def test_structure_change_raises(self, broken: str) -> None:
        """ページ構造が変わったら黙って通さず落ちる。"""
        with pytest.raises(ParseError):
            parse_fuel_adjustment(broken)


class TestDiff:
    def test_no_changes_against_current_master(self, fetched, master: dict) -> None:
        """更新済みのマスタに対しては差分ゼロ（冪等）。"""
        assert not diff_fuel_adjustment(master, fetched).has_changes

    def test_new_month_is_reported_as_added(self, fetched, master: dict) -> None:
        stripped = copy.deepcopy(master)
        series = stripped["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]
        newest = max(series)
        del series[newest]

        report = diff_fuel_adjustment(stripped, fetched)
        assert report.has_changes
        assert not report.needs_attention, "新しい月が増えただけなら人を呼ばない"
        assert {change.month for change in report.added} == {newest}

    def test_changed_value_needs_attention(self, fetched, master: dict) -> None:
        """過去分の値が動いたら、人が見るべき差分として上げる。"""
        tampered = copy.deepcopy(master)
        series = tampered["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]
        series["2026-05"]["perKwh"] = -99.99

        report = diff_fuel_adjustment(tampered, fetched)
        assert report.needs_attention
        assert any(
            change.month == "2026-05" and change.before == -99.99 for change in report.modified
        )

    def test_manual_series_are_left_alone(self, fetched, master: dict) -> None:
        """au・ソフトバンクは中国電力サイトに無いので触らない。"""
        report = diff_fuel_adjustment(master, fetched)
        assert not any(change.series in {"au", "softbank"} for change in report.added)


class TestApply:
    def test_adds_new_months(self, master: dict) -> None:
        rows = [FuelAdjustmentRow(2027, 1, -100.0, -6.5)]
        updated = apply_fuel_adjustment(master, {"regulated": rows}, "2026-08-20")

        series = updated["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]
        assert series["2027-01"] == {"minimumCharge": -100.0, "perKwh": -6.5}
        assert updated["surcharges"]["fuelCostAdjustment"]["lastCheckedOn"] == "2026-08-20"

    def test_does_not_overwrite_existing_by_default(self, master: dict) -> None:
        """既定では過去分を書き換えない。黙って過去が変わると取り違えに気づけない。"""
        rows = [FuelAdjustmentRow(2026, 5, -1.0, -1.0)]
        updated = apply_fuel_adjustment(master, {"regulated": rows}, "2026-08-20")

        entry = updated["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]["2026-05"]
        assert entry["perKwh"] == pytest.approx(-9.83)

    def test_overwrites_when_asked(self, master: dict) -> None:
        rows = [FuelAdjustmentRow(2026, 5, -1.0, -1.0)]
        updated = apply_fuel_adjustment(
            master, {"regulated": rows}, "2026-08-20", include_modified=True
        )

        entry = updated["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]["2026-05"]
        assert entry["perKwh"] == pytest.approx(-1.0)

    def test_input_is_not_mutated(self, master: dict) -> None:
        before = json.dumps(master, sort_keys=True)
        apply_fuel_adjustment(master, {"regulated": [FuelAdjustmentRow(2027, 2, -1.0, -1.0)]}, "x")
        assert json.dumps(master, sort_keys=True) == before

    def test_months_stay_sorted(self, master: dict) -> None:
        rows = [FuelAdjustmentRow(2027, 3, -1.0, -1.0), FuelAdjustmentRow(2027, 1, -2.0, -2.0)]
        updated = apply_fuel_adjustment(master, {"regulated": rows}, "2026-08-20")

        series = updated["surcharges"]["fuelCostAdjustment"]["series"]["regulated"]
        assert list(series) == sorted(series)


class TestStaleness:
    """単価マスタの取りこぼし検知。"""

    def test_current_master_is_clean_today(self, master: dict) -> None:
        warnings = check_staleness(master, datetime.date(2026, 8, 20))
        assert not warnings, [str(w) for w in warnings]

    def test_detects_lagging_fuel_adjustment(self, master: dict) -> None:
        """燃調が数か月ぶん遅れていたら知らせる。"""
        warnings = check_staleness(master, datetime.date(2027, 3, 1))
        assert any("燃調" in w.item for w in warnings)

    def test_detects_missing_fiscal_year_levy(self, master: dict) -> None:
        """年度が変わって再エネ賦課金が未登録なら知らせる。"""
        stripped = copy.deepcopy(master)
        levy = stripped["surcharges"]["renewableEnergyLevy"]["monthly"]
        for key in list(levy):
            if key >= "2026-05":
                del levy[key]

        warnings = check_staleness(stripped, datetime.date(2026, 8, 20))
        assert any("再エネ賦課金" in w.item for w in warnings)

    @pytest.mark.parametrize("month", [3, 4])
    def test_reminds_about_transmission_tariff_in_spring(self, master: dict, month: int) -> None:
        """託送料金改定は自動取得できないので、時期だけ知らせる。"""
        warnings = check_staleness(master, datetime.date(2026, month, 1))
        assert any("託送料金改定" in w.item for w in warnings)

    def test_no_transmission_reminder_outside_spring(self, master: dict) -> None:
        warnings = check_staleness(master, datetime.date(2026, 8, 20))
        assert not any("託送料金改定" in w.item for w in warnings)
