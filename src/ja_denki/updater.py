"""単価マスタの更新と差分検知。

燃料費調整額は毎月動く。取得元から読んだ値をマスタと突き合わせ、
「増えた月」と「値が変わった月」を分けて報告する。

**値が変わった月は要注意。** 過去分の燃調が動くことは通常なく、
取得元の訂正か、こちらの取り違えのどちらかを疑う必要がある。
"""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass, field
from pathlib import Path

from ja_denki.sources.chugoku import FuelAdjustmentRow

#: 浮動小数の比較許容差（銭単位なので 0.001 で十分）
TOLERANCE = 1e-3


@dataclass(frozen=True)
class Change:
    """1 か月分の差分。"""

    series: str
    month: str
    field_name: str
    before: float | None
    after: float

    @property
    def is_new(self) -> bool:
        return self.before is None

    def __str__(self) -> str:
        if self.is_new:
            return f"  + {self.series:12s} {self.month} {self.field_name} = {self.after}"
        return (
            f"  ! {self.series:12s} {self.month} {self.field_name}: "
            f"{self.before} → {self.after}"
        )


@dataclass
class DiffReport:
    """取得結果とマスタの差分。"""

    added: list[Change] = field(default_factory=list)
    modified: list[Change] = field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        return bool(self.added or self.modified)

    @property
    def needs_attention(self) -> bool:
        """人が見るべきか。

        過去分の値が変わったときだけ True。新しい月が増えるのは平常運転。
        """
        return bool(self.modified)

    def render(self) -> str:
        if not self.has_changes:
            return "変更なし。単価マスタは取得元と一致しています。"

        lines = []
        if self.added:
            months = sorted({change.month for change in self.added})
            lines.append(f"新しい月 {len(months)} 件: {', '.join(months)}")
            lines += [str(change) for change in self.added]
        if self.modified:
            lines.append("")
            lines.append(
                f"既存の値が変わった月 {len(self.modified)} 件 "
                "── 取得元の訂正か、取り違えの可能性があります"
            )
            lines += [str(change) for change in self.modified]
        return "\n".join(lines)


FIELDS = {"minimumCharge": "minimum_charge_portion", "perKwh": "per_kwh"}


def diff_fuel_adjustment(
    master: dict,
    fetched: dict[str, list[FuelAdjustmentRow]],
) -> DiffReport:
    """マスタと取得結果を突き合わせる。

    Args:
        master: `data/rates-chugoku-2026.json` の中身
        fetched: `parse_fuel_adjustment` の戻り値
    """
    report = DiffReport()
    block = master["surcharges"]["fuelCostAdjustment"]
    auto = set(block["autoUpdatable"])

    for series, rows in sorted(fetched.items()):
        if series not in auto:
            continue
        current = block["series"].setdefault(series, {})
        for row in rows:
            existing = current.get(row.key)
            for json_field, attr in FIELDS.items():
                after = getattr(row, attr)
                before = existing.get(json_field) if existing else None
                if before is None:
                    report.added.append(Change(series, row.key, json_field, None, after))
                elif abs(before - after) > TOLERANCE:
                    report.modified.append(Change(series, row.key, json_field, before, after))
    return report


def apply_fuel_adjustment(
    master: dict,
    fetched: dict[str, list[FuelAdjustmentRow]],
    checked_on: str,
    *,
    include_modified: bool = False,
) -> dict:
    """取得結果をマスタに反映した新しい dict を返す。

    既定では**新しい月だけ**を足す。過去分の値の書き換えは
    `include_modified=True` を明示したときだけ行う。
    黙って過去を書き換えると、取り違えに気づけなくなるため。
    """
    updated = json.loads(json.dumps(master))
    block = updated["surcharges"]["fuelCostAdjustment"]
    auto = set(block["autoUpdatable"])

    for series, rows in fetched.items():
        if series not in auto:
            continue
        current = block["series"].setdefault(series, {})
        for row in rows:
            entry = current.get(row.key)
            values = {
                "minimumCharge": row.minimum_charge_portion,
                "perKwh": row.per_kwh,
            }
            if entry is None:
                current[row.key] = values
            elif include_modified:
                entry.update(values)
        block["series"][series] = dict(sorted(current.items()))

    block["lastCheckedOn"] = checked_on
    return updated


@dataclass(frozen=True)
class StalenessWarning:
    """単価マスタが古くなっている兆候。"""

    item: str
    detail: str

    def __str__(self) -> str:
        return f"  ! {self.item}: {self.detail}"


def check_staleness(master: dict, today: datetime.date) -> list[StalenessWarning]:
    """単価マスタの取りこぼしを探す。

    燃調は毎月、再エネ賦課金は年度ごと、託送料金は毎年 4 月に動く。
    それぞれ「あるはずの月／年度が無い」ことを検知して知らせる。
    """
    warnings: list[StalenessWarning] = []
    block = master["surcharges"]["fuelCostAdjustment"]

    for series in sorted(block["autoUpdatable"]):
        months = block["series"].get(series) or {}
        if not months:
            warnings.append(StalenessWarning(f"燃調（{series}）", "1 か月分も入っていません"))
            continue
        newest = max(months)
        year, month = (int(part) for part in newest.split("-"))
        behind = (today.year - year) * 12 + (today.month - month)
        if behind > 1:
            warnings.append(
                StalenessWarning(
                    f"燃調（{series}）",
                    f"最新が {newest} で {behind} か月ぶん遅れています",
                )
            )

    # 再エネ賦課金は 4 月使用分（5 月請求分）から改定される
    levy = master["surcharges"]["renewableEnergyLevy"].get("monthly") or {}
    fiscal_year = today.year if today.month >= 5 else today.year - 1
    expected = f"{fiscal_year}-05"
    if expected not in levy:
        warnings.append(
            StalenessWarning(
                "再エネ賦課金",
                f"{fiscal_year} 年度（{expected} 以降）の単価が入っていません",
            )
        )

    # 託送料金改定は毎年 4 月。自動取得できないので時期だけ知らせる
    if today.month in (3, 4):
        warnings.append(
            StalenessWarning(
                "託送料金改定",
                "毎年 4 月に改定されます。各社の単価と JAでんき 定義書を確認してください",
            )
        )

    return warnings


def load_master(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save_master(master: dict, path: str | Path) -> None:
    Path(path).write_text(
        json.dumps(master, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
