"""中国電力サイトから燃料費調整単価を取る。

燃調は毎月動くので、単価マスタのうちここだけは定期的に取り込む必要がある。
ページには規制料金と自由料金の 2 つの表があり、現状は同額だが別建てで
公表されているため両方を読む。
"""

from __future__ import annotations

import html
import re
import ssl
import urllib.request
from dataclasses import dataclass
from pathlib import Path

FUEL_ADJUSTMENT_URL = "https://www.energia.co.jp/elec/seido/nencho/"

#: 提示元が用意している CA バンドル（エージェントプロキシ経由のため）
_CA_BUNDLE = Path("/root/.ccr/ca-bundle.crt")

#: 表の見出しで規制／自由を見分ける。ページは全角英字と半角英字が混在するので
#: `_normalize_width` を通してから比較する。
_REGULATED_MARKER = "従量電灯A・臨時電灯B"
_LIBERALIZED_MARKER = "スマートコース"

#: `▲147.69|▲9.83|▲9.83|34,000|66,300|2026年5月分` を拾う。
#: 末尾に絶対年月が入っているので、年度をまたぐ行でも取り違えない。
_ROW = re.compile(
    r"▲?(?P<minimum>[\d,]+\.\d+)\|"
    r"▲?(?P<per_kwh>[\d,]+\.\d+)\|"
    r"[^|]*\|[^|]*\|[^|]*\|"
    r"(?P<year>\d{4})年(?P<month>\d{1,2})月分"
)


class ParseError(RuntimeError):
    """ページ構造が想定と違うとき。単価を黙って取り違えるより落とす。"""


@dataclass(frozen=True)
class FuelAdjustmentRow:
    """1 か月分の燃料費調整単価。"""

    year: int
    month: int
    minimum_charge_portion: float
    per_kwh: float

    @property
    def key(self) -> str:
        return f"{self.year}-{self.month:02d}"


def _normalize_width(text: str) -> str:
    """全角英数字を半角に寄せる。

    中国電力のページは「従量電灯A」と「深夜電力Ｂ」のように全角と半角が
    混ざっている。見出しの照合で取り違えないよう先に揃える。
    """
    return text.translate({code: code - 0xFEE0 for code in range(0xFF01, 0xFF5F)})


def _flatten(table_html: str) -> str:
    """タグを `|` に潰して、行の中身だけを取り出す。"""
    text = html.unescape(re.sub(r"<[^>]+>", "|", table_html))
    text = re.sub(r"[\s\u3000]+", "", text)
    return _normalize_width(re.sub(r"\|+", "|", text))


def _sign(value: str, raw_row: str) -> float:
    number = float(value.replace(",", ""))
    return -number if "▲" in raw_row else number


def parse_fuel_adjustment(page: str) -> dict[str, list[FuelAdjustmentRow]]:
    """ページの HTML から、規制料金と自由料金の燃調を読む。

    Returns:
        `{"regulated": [...], "liberalized": [...]}`。新しい月が先頭。

    Raises:
        ParseError: 表が見つからない、または 1 行も読めなかったとき。
    """
    tables = re.findall(r"<table.*?</table>", page, re.S)
    if not tables:
        raise ParseError("ページに表が 1 つもありません")

    found: dict[str, list[FuelAdjustmentRow]] = {}
    for table_html in tables:
        flat = _flatten(table_html)
        if _REGULATED_MARKER in flat:
            series = "regulated"
        elif _LIBERALIZED_MARKER in flat:
            series = "liberalized"
        else:
            continue
        if series in found:
            continue

        rows = []
        for match in _ROW.finditer(flat):
            raw = flat[max(0, match.start() - 1) : match.end()]
            rows.append(
                FuelAdjustmentRow(
                    year=int(match["year"]),
                    month=int(match["month"]),
                    minimum_charge_portion=_sign(match["minimum"], raw),
                    per_kwh=_sign(match["per_kwh"], raw),
                )
            )
        if rows:
            found[series] = rows

    missing = {"regulated", "liberalized"} - set(found)
    if missing:
        raise ParseError(
            f"{'・'.join(sorted(missing))} の燃調表が読めませんでした。"
            "ページ構造が変わった可能性があります"
        )
    return found


def fetch_fuel_adjustment(url: str = FUEL_ADJUSTMENT_URL, timeout: int = 30) -> str:
    """燃調ページを取得して HTML を返す。"""
    context = ssl.create_default_context(cafile=str(_CA_BUNDLE)) if _CA_BUNDLE.exists() else None
    request = urllib.request.Request(url, headers={"User-Agent": "ja-denki-rate-updater"})
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")
