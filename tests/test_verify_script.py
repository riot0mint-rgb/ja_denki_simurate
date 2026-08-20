"""`scripts/verify_rates.py` が単価マスタの構造変更に追従しているか。

このスクリプトは CI で別ステップとして走るため、pytest だけ緑で
スクリプトが壊れている状態が起きうる。実際に一度それをやったので、
テストからも呼んで同じ失敗を二度やらないようにする。
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "verify_rates.py"


@pytest.fixture(scope="module")
def script():
    spec = importlib.util.spec_from_file_location("verify_rates", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["verify_rates"] = module
    spec.loader.exec_module(module)
    return module


def test_script_exits_zero(script, capsys: pytest.CaptureFixture[str]) -> None:
    """単価マスタを読んで Excel の 3 ケースと一致する。"""
    assert script.main() == 0
    assert "全ケースが Excel の出力と一致" in capsys.readouterr().out


def test_reads_the_current_master_structure(script) -> None:
    """マスタの構造を変えたらここで落ちる。

    燃調は 4 系統、最低料金分と 1kWh 単価を別々に持つ。再エネ賦課金は月別。
    """
    data = __import__("json").loads(script.RATES.read_text(encoding="utf-8"))
    surcharges = data["surcharges"]

    regulated = surcharges["fuelCostAdjustment"]["series"]["regulated"]["2026-05"]
    assert set(regulated) == {"minimumCharge", "perKwh"}
    assert regulated["minimumCharge"] != regulated["perKwh"] * 15

    assert surcharges["renewableEnergyLevy"]["monthly"]["2026-05"] == 4.18
