"""コマンドラインの入出力。"""

from __future__ import annotations

import argparse

import pytest

from ja_denki.cli import format_result, main, parse_month, resolve_menu
from ja_denki.rates import RateBook
from ja_denki.simulator import Simulator
from tests.test_simulator import FIXTURES, MONTH, YEAR


class TestParseMonth:
    @pytest.mark.parametrize("value", ["2026-05", "2026/5", "202605", "2026/05"])
    def test_accepted_forms(self, value: str) -> None:
        assert parse_month(value) == (2026, 5)

    @pytest.mark.parametrize(
        "value", ["2026-13", "26-05", "abcdef", "2026-0", "2026-", "20265", "2026-005"]
    )
    def test_rejected_forms(self, value: str) -> None:
        with pytest.raises(argparse.ArgumentTypeError):
            parse_month(value)


class TestResolveMenu:
    AVAILABLE = ["中電従A", "中電スマート", "ソフバ くらし"]

    def test_exact_name(self) -> None:
        assert resolve_menu("中電従A", self.AVAILABLE) == "中電従A"

    def test_alias(self) -> None:
        assert resolve_menu("くらしでんき", self.AVAILABLE) == "ソフバ くらし"

    def test_unknown_lists_the_options(self) -> None:
        with pytest.raises(SystemExit, match="中電従A"):
            resolve_menu("存在しないプラン", self.AVAILABLE)


def test_format_result_mentions_both_plans() -> None:
    ratebook = RateBook.from_json(FIXTURES / "excel_meta.json")
    text = format_result(Simulator(ratebook, "中電従A", YEAR, MONTH).run(10_000))

    assert "310 kWh" in text
    assert "9,625" in text and "9,767" in text
    assert "◀ 推奨" in text
    assert "試算可能料金上限" in text


class TestMain:
    def test_success(self, capsys: pytest.CaptureFixture[str]) -> None:
        code = main(["--menu", "中電従A", "--bill", "10000", "--month", "2026-05"])
        assert code == 0
        assert "推定使用量" in capsys.readouterr().out

    def test_out_of_range_reports_and_exits_nonzero(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        code = main(["--menu", "中電従A", "--bill", "999999", "--month", "2026-05"])
        assert code == 1
        assert "試算できません" in capsys.readouterr().err

    def test_list_menus(self, capsys: pytest.CaptureFixture[str]) -> None:
        assert main(["--list-menus"]) == 0
        assert "中電従A" in capsys.readouterr().out

    def test_corrected_flag_changes_the_answer(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        args = ["--menu", "くらしでんき", "--bill", "20000", "--month", "2026-05"]
        main(args)
        current = capsys.readouterr().out
        main(args + ["--corrected"])
        corrected = capsys.readouterr().out
        assert current != corrected
