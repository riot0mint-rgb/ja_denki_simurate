"""単価マスタのデータモデル。

Excel の `基本項目` シートに相当する。段階別の従量料金、事業者ごとに分かれた
燃料費調整額、再生可能エネルギー発電促進賦課金を保持する。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

#: 最低料金・基本料金がカバーする使用量（kWh）
FREE_KWH = 15


@dataclass(frozen=True)
class Tier:
    """段階別電力量料金の 1 段階。

    `to_kwh` が None なら上限なし。区間は `from_kwh` を含まず `to_kwh` を含む。
    """

    from_kwh: int
    to_kwh: int | None
    rate: float

    def kwh_in(self, usage: int) -> int:
        """使用量 `usage` のうち、この段階に入る kWh 数。"""
        if usage <= self.from_kwh:
            return 0
        top = usage if self.to_kwh is None else min(usage, self.to_kwh)
        return top - self.from_kwh


@dataclass(frozen=True)
class Plan:
    """1 つの料金メニュー。

    従量電灯型は `minimum_charge`（最初の 15kWh をカバーする最低料金）を持つ。
    シンプルコース型は `minimum_monthly` を持ち、料金合計がこれを下回る月は
    最低月額料金が適用される。
    """

    name: str
    tiers: tuple[Tier, ...]
    minimum_charge: float | None = None
    minimum_monthly: float | None = None

    def __post_init__(self) -> None:
        if (self.minimum_charge is None) == (self.minimum_monthly is None):
            raise ValueError(
                f"{self.name}: minimum_charge と minimum_monthly は"
                "どちらか一方だけを指定してください"
            )

    @property
    def is_minimum_monthly(self) -> bool:
        """最低月額料金型（シンプルコース型）なら True。"""
        return self.minimum_monthly is not None

    @classmethod
    def flat(cls, name: str, minimum_monthly: float, rate: float) -> Plan:
        """全量一律単価のメニューを作る（シンプルコース型）。"""
        return cls(
            name=name,
            tiers=(Tier(0, None, rate),),
            minimum_monthly=minimum_monthly,
        )

    @classmethod
    def tiered(cls, name: str, minimum_charge: float, rates: tuple[float, float, float]) -> Plan:
        """中国電力エリアの標準的な 3 段階メニューを作る。

        段階の境界は 15 / 120 / 300 kWh で固定。
        """
        t1, t2, t3 = rates
        return cls(
            name=name,
            minimum_charge=minimum_charge,
            tiers=(
                Tier(FREE_KWH, 120, t1),
                Tier(120, 300, t2),
                Tier(300, None, t3),
            ),
        )


@dataclass(frozen=True)
class FuelCostAdjustment:
    """ある月の燃料費調整額。

    中国電力エリアでは最低料金分（15kWh まで、1 契約あたり）と超過分
    （1kWh あたり）が別建てで公表される。前者は後者の 15 倍にはならない。
    """

    minimum_charge_portion: float
    per_kwh: float

    def amount(self, usage: int) -> float:
        return self.minimum_charge_portion + self.per_kwh * max(0, usage - FREE_KWH)


class RateBook:
    """単価マスタ一式。

    Excel から吸い出した `tests/fixtures/excel_meta.json` を読む。
    燃料費調整額は事業者ごとに 4 系統（規制料金・自由料金・auでんき・
    ソフトバンク）あり、`series` で選ぶ。
    """

    #: 燃調の系統名 → excel_meta.json のキー接頭辞
    FCA_SERIES = {
        "regulated": "regulated",
        "liberalized": "liberalized",
        "au": "au",
        "softbank": "softbank",
    }

    def __init__(self, raw: dict) -> None:
        self._raw = raw
        self._fca = raw["fuelCostAdjustment"]
        self._levy = raw["renewableLevy"]

    @classmethod
    def from_json(cls, path: str | Path) -> RateBook:
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    @staticmethod
    def _key(year: int, month: int) -> str:
        return f"{year}-{month:02d}"

    def fuel_cost_adjustment(self, year: int, month: int, series: str) -> FuelCostAdjustment:
        """指定月・指定系統の燃料費調整額。"""
        if series not in self.FCA_SERIES:
            raise KeyError(f"未知の燃調系統: {series!r}")
        key = self._key(year, month)
        prefix = self.FCA_SERIES[series]
        try:
            return FuelCostAdjustment(
                minimum_charge_portion=self._fca[f"{prefix}_min"][key],
                per_kwh=self._fca[f"{prefix}_per_kwh"][key],
            )
        except KeyError as exc:
            raise KeyError(f"{key} の燃調（{series}）が単価マスタにありません") from exc

    def renewable_levy(self, year: int, month: int) -> float:
        """指定月の再エネ賦課金単価（円/kWh）。"""
        key = self._key(year, month)
        try:
            return self._levy[key]
        except KeyError as exc:
            raise KeyError(f"{key} の再エネ賦課金が単価マスタにありません") from exc

    def sheet_plan(self, sheet: str) -> Plan:
        """契約シートが実際に使っている単価でメニューを組み立てる。

        誤参照やハードコードを含む「Excel の現状」をそのまま再現する。
        正しい単価は `master_plan` を使う。
        """
        entry = self._raw["sheetHardcodedRates"][sheet]
        minimum, *rates = entry["rates"]
        if entry["planType"] == "minimum_monthly":
            return Plan.flat(sheet, minimum_monthly=minimum, rate=rates[0])
        return Plan.tiered(sheet, minimum_charge=minimum, rates=tuple(rates))

    def sheet_fca_series(self, sheet: str) -> str:
        return self._raw["sheetHardcodedRates"][sheet]["fcaSeries"]

    def master_plan(self, name: str) -> Plan:
        """`基本項目` マスタの単価でメニューを組み立てる。"""
        minimum, *rates = self._raw["masterRates"][name]
        if name == "中国電力 シンプルコース":
            return Plan.flat(name, minimum_monthly=minimum, rate=rates[0])
        return Plan.tiered(name, minimum_charge=minimum, rates=tuple(rates))

    @property
    def sheets(self) -> list[str]:
        return list(self._raw["sheetHardcodedRates"])

    @property
    def master_menus(self) -> list[str]:
        return list(self._raw["masterRates"])
