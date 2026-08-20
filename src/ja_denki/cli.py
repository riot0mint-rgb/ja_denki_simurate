"""JAでんき 切替シミュレータのコマンドライン。

    $ python -m ja_denki --menu 中電従A --bill 10000 --month 2026-05
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ja_denki.rates import RateBook
from ja_denki.simulator import BREAK_EVEN_KWH, Simulation, Simulator

DEFAULT_RATEBOOK = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "excel_meta.json"

#: シート名の別名。現場が呼びそうな名前でも通るようにする。
ALIASES = {
    "従量電灯A": "中電従A",
    "中電従量電灯A": "中電従A",
    "スマート": "中電スマート",
    "スマートコース": "中電スマート",
    "シンプル": "中電シンプル",
    "シンプルコース": "中電シンプル",
    "au": "auでんきMプラン",
    "auでんき": "auでんきMプラン",
    "ドコモ": "ドコモでんき",
    "docomo": "ドコモでんき",
    "おうちでんき": "ソフバ おうち",
    "くらしでんき": "ソフバ くらし",
    "softbank": "ソフバ おうち",
}


def parse_month(value: str) -> tuple[int, int]:
    """`2026-05` / `2026/5` / `202605` を (年, 月) に解く。

    区切りがあれば 1 桁の月も受ける。区切りがなければ YYYYMM の 6 桁のみ。
    """
    text = value.strip()
    separators = [sep for sep in ("-", "/") if sep in text]

    if separators:
        parts = text.split(separators[0])
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise argparse.ArgumentTypeError(
                f"使用年月の形式が不正です: {value!r}（例: 2026-05）"
            )
        year_text, month_text = parts
        if len(year_text) != 4 or not 1 <= len(month_text) <= 2:
            raise argparse.ArgumentTypeError(
                f"使用年月の形式が不正です: {value!r}（例: 2026-05）"
            )
    elif len(text) == 6 and text.isdigit():
        year_text, month_text = text[:4], text[4:]
    else:
        raise argparse.ArgumentTypeError(
            f"使用年月の形式が不正です: {value!r}（例: 2026-05）"
        )

    year, month = int(year_text), int(month_text)
    if not 1 <= month <= 12:
        raise argparse.ArgumentTypeError(f"月が範囲外です: {month}（1〜12）")
    return year, month


def resolve_menu(value: str, available: list[str]) -> str:
    """入力されたメニュー名を、単価マスタのシート名に解決する。"""
    if value in available:
        return value
    if value in ALIASES and ALIASES[value] in available:
        return ALIASES[value]
    raise SystemExit(
        f"メニュー {value!r} は見つかりません。\n"
        f"指定できるのは: {', '.join(available)}"
    )


def format_result(result: Simulation) -> str:
    lines = [
        f"使用年月       {result.year}年{result.month}月",
        f"現在のご契約   {result.current_menu}",
        f"電気料金       {result.current_bill:,} 円",
        f"推定使用量     {result.estimated_usage_kwh:,} kWh",
        "",
    ]

    for plan in (result.tiered, result.small):
        marker = "◀ 推奨" if plan is result.recommended else "      "
        sign = "削減" if plan.is_beneficial else "増額"
        lines.append(
            f"  {plan.name:20s} {plan.monthly_bill:>7,} 円   "
            f"月間{sign} {abs(plan.monthly_saving):>5,} 円   "
            f"年間 {abs(plan.annual_saving):>6,} 円  {marker}"
        )

    lines.append("")
    if not result.any_benefit:
        lines.append("  ※ この使用量ではどちらのプランでも削減になりません。")
    elif result.recommended is not result.recommended_by_break_even:
        lines.append(
            f"  ※ 損益分岐点（{BREAK_EVEN_KWH}kWh/月）では "
            f"{result.recommended_by_break_even.name} ですが、"
            f"実際の削減額は {result.recommended.name} のほうが大きくなります。"
        )

    lines += [
        "",
        "  簡易試算です。実際の削減額とは異なります。",
        f"  試算可能料金上限 {result.max_simulatable_bill:,} 円",
    ]
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ja-denki",
        description="現在の電気料金から JAでんき への切替メリットを試算します。",
    )
    parser.add_argument("--menu", "-m", required=True, help="現在のご契約（例: 中電従A）")
    parser.add_argument("--bill", "-b", required=True, type=float, help="電気料金（円）")
    parser.add_argument(
        "--month", "-t", required=True, type=parse_month, help="使用年月（例: 2026-05）"
    )
    parser.add_argument(
        "--corrected",
        action="store_true",
        help="シートの誤参照を無視し、単価マスタの正しい単価で試算する",
    )
    parser.add_argument(
        "--ratebook", type=Path, default=DEFAULT_RATEBOOK, help="単価マスタの JSON"
    )
    parser.add_argument("--list-menus", action="store_true", help="指定できるメニューを並べる")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    # --list-menus だけは他の必須引数なしで通したい
    if argv is None:
        argv = sys.argv[1:]
    if "--list-menus" in argv:
        ratebook = RateBook.from_json(DEFAULT_RATEBOOK)
        print("\n".join(ratebook.sheets))
        return 0

    args = parser.parse_args(argv)
    ratebook = RateBook.from_json(args.ratebook)
    menu = resolve_menu(args.menu, ratebook.sheets)
    year, month = args.month

    try:
        simulator = Simulator(
            ratebook, menu, year, month, use_corrected_rates=args.corrected
        )
        result = simulator.run(args.bill)
    except (ValueError, KeyError) as exc:
        print(f"試算できません: {exc}", file=sys.stderr)
        return 1

    print(format_result(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
