# ja_denki_simurate

JAでんき（中国電力エリア・広島市農協管内）への切替メリットを試算するツールのリポジトリ。

現在は実務で使われている Excel 版シミュレータの仕様整理と、各社料金メニューの調査結果を管理している。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | プロジェクトの引き継ぎ。Excel 版の仕様、料金計算モデル、次にやること |
| [ASSUMPTIONS.md](ASSUMPTIONS.md) | 試算が依存している前提、未確認事項、意図的に扱っていない項目 |
| [docs/pricing-menus.md](docs/pricing-menus.md) | **各社 電気料金メニュー調査（中国電力エリア・低圧家庭用）** |
| [docs/excel-audit.md](docs/excel-audit.md) | **現物 Excel の監査結果**（構造・不整合・計算モデル） |
| [tests/fixtures/](tests/fixtures/) | Excel から吸い出したゴールデンデータ（対応表 7 枚＋マスタ） |
| [data/rates-chugoku-2026.json](data/rates-chugoku-2026.json) | 単価マスタ（機械可読） |
| [scripts/verify_rates.py](scripts/verify_rates.py) | 単価マスタでの計算結果を Excel の出力と突合する検証スクリプト |

## 検証

```bash
python3 scripts/verify_rates.py
```

Python 3 のみ（追加依存なし）。
