"""単価の取得元。

各社サイトから現行単価を取り、単価マスタと突き合わせるためのモジュール群。
取得は best-effort で、ページ構造が変われば `ParseError` を上げて気づけるようにする。
"""

from ja_denki.sources.chugoku import (
    FUEL_ADJUSTMENT_URL,
    ParseError,
    fetch_fuel_adjustment,
    parse_fuel_adjustment,
)

__all__ = [
    "FUEL_ADJUSTMENT_URL",
    "ParseError",
    "fetch_fuel_adjustment",
    "parse_fuel_adjustment",
]
