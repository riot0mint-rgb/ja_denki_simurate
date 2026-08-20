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
| [src/ja_denki/](src/ja_denki/) | **料金計算エンジンとシミュレータ**。段階別料金、燃調 4 系統、料金 → 使用量の逆算、CLI |

## 使い方

```bash
python -m ja_denki --menu 中電従A --bill 10000 --month 2026-05
```

```
使用年月       2026年5月
現在のご契約   中電従A
電気料金       10,000 円
推定使用量     310 kWh

  JAでんき 従量電灯A            9,625 円   月間削減   375 円   年間  4,500 円  ◀ 推奨
  JAでんき 従量電灯S            9,767 円   月間削減   233 円   年間  2,796 円
```

`--corrected` を付けると、シートの誤参照を無視して単価マスタの正しい単価で試算する。
`--list-menus` で指定できるメニューが出る。

## 単価の更新

燃料費調整額は毎月動く。月次で取り込む。

```bash
python3 scripts/update_rates.py            # 差分を見るだけ
python3 scripts/update_rates.py --apply    # 新しい月を取り込む
```

新しい月が増えるのは平常運転として黙って取り込むが、**過去分の値が変わったら
終了コード 2 で止まる**。取得元の訂正か、こちらの取り違えかを人が見る必要があるため。

`.github/workflows/update-rates.yml` が毎月 3 日に実行し、差分があればテストを
通したうえで PR を立てる。auでんき・ソフトバンクの燃調は中国電力サイトに
載らないため自動更新の対象外で、手動で入れる。

## 検証

```bash
python3 -m pytest          # 27 件。Excel の対応表 1,687 点との突合を含む
python3 scripts/verify_rates.py
```

エンジン本体は標準ライブラリのみで動く。テストには pytest が要る。
