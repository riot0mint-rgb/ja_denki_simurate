#!/usr/bin/env python3
"""単価マスタの燃料費調整額を、中国電力サイトの最新値で更新する。

燃調は毎月動くので定期実行を想定している。既定は差分の表示だけで、
`--apply` を付けたときにマスタを書き換える。

    python3 scripts/update_rates.py                 # 差分を見るだけ
    python3 scripts/update_rates.py --apply         # 新しい月を取り込む
    python3 scripts/update_rates.py --page saved.html   # 保存済み HTML から

終了コード:
    0  変更なし、または新しい月を取り込んだだけ
    1  取得や解析に失敗した
    2  既存の月の値が変わっていた（人が見る必要がある）
"""

from __future__ import annotations

import argparse
import datetime
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from ja_denki.sources.chugoku import (  # noqa: E402
    FUEL_ADJUSTMENT_URL,
    ParseError,
    fetch_fuel_adjustment,
    parse_fuel_adjustment,
)
from ja_denki.updater import (  # noqa: E402
    apply_fuel_adjustment,
    check_staleness,
    diff_fuel_adjustment,
    load_master,
    save_master,
)

DEFAULT_MASTER = ROOT / "data" / "rates-chugoku-2026.json"

EXIT_OK = 0
EXIT_FETCH_FAILED = 1
EXIT_NEEDS_ATTENTION = 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="update_rates",
        description="中国電力サイトの燃料費調整額を単価マスタに取り込みます。",
    )
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER, help="単価マスタの JSON")
    parser.add_argument("--url", default=FUEL_ADJUSTMENT_URL, help="取得元 URL")
    parser.add_argument("--page", type=Path, help="保存済み HTML を使う（取得しない）")
    parser.add_argument("--apply", action="store_true", help="マスタを書き換える")
    parser.add_argument(
        "--overwrite-existing",
        action="store_true",
        help="既存の月の値も上書きする（取得元の訂正を取り込むとき）",
    )
    parser.add_argument("--today", help="lastCheckedOn に入れる日付（既定は今日）")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        page = (
            args.page.read_text(encoding="utf-8", errors="replace")
            if args.page
            else fetch_fuel_adjustment(args.url)
        )
        fetched = parse_fuel_adjustment(page)
    except ParseError as exc:
        print(f"解析できません: {exc}", file=sys.stderr)
        return EXIT_FETCH_FAILED
    except OSError as exc:
        print(f"取得できません: {exc}", file=sys.stderr)
        return EXIT_FETCH_FAILED

    master = load_master(args.master)
    report = diff_fuel_adjustment(master, fetched)
    print(report.render())

    if args.apply and report.has_changes:
        today = args.today or datetime.date.today().isoformat()
        updated = apply_fuel_adjustment(
            master, fetched, today, include_modified=args.overwrite_existing
        )
        save_master(updated, args.master)
        print(f"\n{args.master} を更新しました（lastCheckedOn={today}）")
        if report.needs_attention and not args.overwrite_existing:
            print("既存の月の値は書き換えていません。--overwrite-existing で取り込めます。")

    today = datetime.date.fromisoformat(args.today) if args.today else datetime.date.today()
    warnings = check_staleness(load_master(args.master), today)
    if warnings:
        print("\n単価マスタの取りこぼし:")
        print("\n".join(str(warning) for warning in warnings))

    if report.needs_attention:
        return EXIT_NEEDS_ATTENTION
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
