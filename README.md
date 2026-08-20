# JAでんき料金比較シミュレータ Web版

電気料金制度に詳しくない営業担当者や職員向けの、Web ベースの料金比較シミュレーションシステムです。

## 概要

- **対象**: 広島県、中国電力ネットワークエリアの家庭向け低圧契約
- **機能**: 現在契約と JAでんきの料金を同一条件で計算し、月額・年額差を表示
- **デバイス**: PC、タブレット、スマートフォン対応（PWA 化予定）
- **サーバー不要**: Phase A は静的 Web App、個人情報をサーバーに送信しない

## プロジェクト構成

```
ja_denki_simulator_web/
├── packages/
│   └── calc-core/               # 計算エンジン（Decimal・8構造）
│       ├── src/monthlyRates.ts  # ★正本: 燃料費調整額・再エネ賦課金（年×月）
│       └── tests/               # 156テスト・カバレッジ100%
├── apps/
│   ├── web/                     # Phase A: 静的Webアプリ
│   │   └── src/data/rates.ts    # ★正本: 全プランの単価と出典
│   └── admin/                   # Phase B: 改定レビュー画面（未実装）
├── services/
│   └── rate-fetcher/            # Phase B: 料金取得（未実装）
├── data/
│   └── rate_master.json         # 生成物（監査用エクスポート）
├── scripts/
│   └── generate-rate-master.ts  # rates.ts → rate_master.json
├── docs/
│   ├── source_inventory.md      # 資料棚卸し
│   ├── rate_extraction_report.md # ルール抽出
│   ├── PHASE_6_DESIGN.md        # Phase B 改定レビューの設計
│   └── IMPLEMENTATION_PLAN.md   # 実装計画
└── archive/                     # 元資料のローカルコピー（読み取り専用）
```

### 料金の正本はどこか

単価の正本は **TypeScript 側**（`apps/web/src/data/rates.ts` と
`packages/calc-core/src/monthlyRates.ts`）です。型と `Decimal` をそのまま持てるうえ、
すべての値に出典（ファイル名・シート名・セル番地）が付いた状態でコンパイル時に検証できます。

`data/rate_master.json` は **そこからの生成物**で、監査とフェーズ6の改定レビュー画面が
読むためのものです。手で編集しても計算には反映されません。

```bash
npm run rate-master:generate   # 正本から書き出す
npm run rate-master:check      # 正本とズレていないか検証（CIで実行）
```

## ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [CLAUDE.md](./CLAUDE.md) | 開発ルール・設計方針 |
| [ASSUMPTIONS.md](./ASSUMPTIONS.md) | 仮定・未確認項目 |
| [SECURITY.md](./SECURITY.md) | セキュリティ・個人情報保護 |
| [DEPLOY.md](./DEPLOY.md) | デプロイメント手順 |
| [SCRAPING_POLICY.md](./SCRAPING_POLICY.md) | スクレイピング・自動取得ポリシー |
| [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) | フェーズ別実装計画 |

## 開発の進捗

### Phase A（初期・必須）

- ✅ **フェーズ0**: 作業ディレクトリ・Git初期化
- ⏳ **フェーズ1**: 資料棚卸し・料金ルール抽出（進行中）
- **フェーズ2**: 料金マスター設計・出典管理
- **フェーズ3**: calc-core 実装・テスト
- **フェーズ4**: 静的 Web UI 実装
- **フェーズ5**: デプロイ設定・CI/CD

### Phase B（拡張・オプション）

- **フェーズ6**: 管理画面実装
- **フェーズ7**: 料金自動取得ボット
- **フェーズ8**: OCR アダプタ
- **フェーズ9**: AI 案内役
- **フェーズ10**: セキュリティレビュー・最終テスト

## 関連リソース

- [Google Drive 資料フォルダ](https://drive.google.com/drive/folders/1Y8SYyOE659NQHI34RY5PEb1mQ1IFZYFz?usp=drive_link)
  （読み取り専用・変更禁止）

---

**詳細な技術ドキュメント**は [docs/](./docs/) フォルダを参照してください。