# 実装計画書 (IMPLEMENTATION_PLAN.md)

**フェーズ1完了日**: 2026-08-20
**全体構成**: 10フェーズ（Phase A: 1-5、Phase B: 6-10）
**推定工数**: Phase A: 250時間、Phase B: 200時間（見積）

---

## フェーズ別実装計画

### フェーズ0: ✅ 完了
- [x] 作業ディレクトリ作成
- [x] Git初期化と設定
- [x] 元資料の読み取り専用確認
- [x] ASSUMPTIONS.md, SECURITY.md 初期作成

---

### フェーズ1: ✅ 進行中
**目標**: 料金計算に必須の資料を特定し、内容を理解する

#### 実施項目

1. **Google Drive内の詳細検索** （本フェーズ）
   - [ ] 全フォルダを直接開いて確認
   - [ ] ワイルドカード検索拡張（「定義」「メニュー」）
   - [ ] 優先度定義書の確認
   - [ ] JAでんき_QA_統合版.docx の内容確認

2. **料金ルール抽出**
   - [ ] JAでんき従量電灯A: 料金体系抽出
   - [ ] JAでんき従量電灯S: 適用条件抽出
   - [ ] JAでんき夜トクプラン: 時間帯・料金抽出
   - [ ] 中国電力従量電灯A: 料金体系抽出
   - [ ] 燃料費調整: 計算式抽出
   - [ ] 再エネ賦課金: 単価・期間抽出

3. **成果物作成**
   - [x] docs/source_inventory.md
   - [ ] docs/source_inventory.csv（詳細版）
   - [ ] docs/source_priority.md
   - [ ] docs/unreadable_files.md
   - [ ] docs/duplicate_candidates.md
   - [ ] ASSUMPTIONS.md 更新版

#### 成果物（フェーズ1完了時に提示）

```
docs/
├── source_inventory.md          ✅ 作成済み
├── source_inventory.csv         ⏳ 作成予定
├── source_priority.md           ⏳ 作成予定
├── unreadable_files.md          ⏳ 作成予定
├── duplicate_candidates.md      ⏳ 作成予定
├── rate_extraction_draft.md     ⏳ 下書き版
└── conflicts_draft.md           ⏳ 下書き版
```

#### 成功基準

- [ ] 料金計算に必須の定義書が全て発見されている
- [ ] 各プランの基本料金・段階別単価が確定している
- [ ] 未確認項目が明示されている
- [ ] 資料の競合・版の違いが整理されている

---

### フェーズ2: 料金マスター設計と出典管理
**目標**: 料金ルールを構造化し、JSON スキーマを定義する

#### 実施項目

1. **料金マスターJSONスキーマ設計**
   ```typescript
   // data/schemas/rate_master.schema.json
   interface RateMaster {
     provider_id: string;          // "ja_denki" | "chugoku_power"
     provider_name: string;        // "JAでんき"
     plan_id: string;              // "raten_a" | "raten_s"
     plan_name: string;
     area: string;                 // "chugoku"
     customer_type: string;        // "household"
     voltage_class: string;        // "low_voltage"
     effective_from: string;       // "2026-04-01"
     effective_to: string | null;
     
     // 基本料金
     base_charge: {
       fixed_yen: number;          // 単価（円/10A）
       applicable_amperage: number;
     };
     
     // 最低料金 or 基本料金 (実装時に詳細定義)
     minimum_charge: {
       yen: number;
       included_kwh: number;       // 0～15kWh
     };
     
     // 段階別料金（最大3段階想定）
     tiers: Array<{
       tier_number: number;        // 1, 2, 3
       start_kwh: number;          // 15, 120, 300
       end_kwh: number | null;     // 120, 300, null
       unit_price_yen_per_kwh: Decimal;
     }>;
     
     // 調整
     fuel_adjustment: {
       method: "multiplicative" | "additive" | "none";
       source_file: string;
       source_effective_date: string;
     };
     
     renewable_levy: {
       unit_price_yen_per_kwh: Decimal;
       source_file: string;
       source_effective_date: string;
     };
     
     // 端数処理
     rounding_rule: "round" | "floor" | "ceil";
     rounding_unit: "yen" | "ten_yen";
     
     // 出典
     source_file: string;
     source_page_or_sheet: string;
     verification_status: "verified" | "partially_verified" | "unverified";
     verified_by: string;
     verified_at: string;
   }
   ```

2. **出典レジストリの作成**
   ```json
   // data/source_registry.json
   {
     "sources": [
       {
         "id": "ja_denki_rate_menu_20261001",
         "filename": "【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf",
         "url": "https://drive.google.com/...",
         "effective_from": "2026-10-01",
         "effective_to": null,
         "extracted_at": "2026-08-20",
         "extracted_by": "claude",
         "relevant_plans": ["raten_a", "raten_s"],
         "notes": "..." 
       }
     ]
   }
   ```

3. **競合・未確認項目の明示**
   - docs/conflicts.md: 異なる資料で数値が異なる場合
   - docs/unconfirmed.md: 資料に記載がない項目

#### 成果物

```
data/
├── rate_master.json             ⏳ 初版
├── fuel_adjustment_master.json  ⏳ 初版
├── renewable_levy_master.json   ⏳ 初版
├── source_registry.json         ⏳ 初版
└── schemas/
    └── rate_master.schema.json  ⏳ 定義

docs/
├── rate_extraction_report.md    ⏳ 抽出ルール
├── conflicts.md                 ⏳ 競合一覧
└── unconfirmed.md               ⏳ 未確認項目
```

#### 成功基準

- [ ] 全ての料金プランが JSON 構造で定義されている
- [ ] 各数値に出典が明示されている
- [ ] 競合する数値（異なる資料）が documented されている
- [ ] 未確認項目が明示されている

---

### フェーズ3: 計算エンジン実装（calc-core）
**目標**: 10進固定小数を使用した正確な料金計算エンジンを実装する

#### 実施項目

1. **プロジェクト構造**
   ```
   packages/calc-core/
   ├── src/
   │   ├── models.ts              # 型定義
   │   ├── decimal-config.ts      # Decimal.js設定
   │   ├── rounding.ts            # 端数処理
   │   ├── tariff.ts              # 段階別料金計算
   │   ├── fuelAdjustment.ts       # 燃料費調整
   │   ├── renewableLevy.ts        # 再エネ賦課金
   │   ├── calculator.ts           # 統合計算エンジン
   │   ├── comparator.ts           # 比較計算
   │   └── utils.ts
   ├── tests/
   │   ├── tariff.test.ts
   │   ├── calculator.test.ts
   │   ├── regressionTest.ts       # 既存Excel比較
   │   └── fixtures/
   │       ├── test_cases_900kwh.json
   │       └── legacy_excel_samples.json
   ├── package.json
   └── tsconfig.json
   ```

2. **主要モジュール実装**

   **models.ts**: 型安全性を確保
   ```typescript
   import Decimal from 'decimal.js';
   
   export interface MonthlyBill {
     minimumCharge: Decimal;
     tier1: Decimal;
     tier2: Decimal;
     tier3: Decimal;
     fuelAdjustment: Decimal;
     renewableLevy: Decimal;
     subtotal: Decimal;
     beforeRounding: Decimal;
     afterRounding: Decimal;
     roundingMethod: string;
     formula: string;
     rateReference: string;
     sourceFile: string;
     verificationStatus: 'verified' | 'unverified' | 'partial';
   }
   ```

   **calculator.ts**: 統合計算
   ```typescript
   calculateMonthlyBill(
     usage_kwh: number,
     plan: RateMasterEntry,
     fuelAdjustment: FuelAdjustmentEntry,
     renewableLevy: RenewableLevyEntry
   ): MonthlyBill
   ```

3. **テスト戦略**
   - 境界値テスト: 0, 1, 14, 15, 16, 119, 120, 121, 299, 300, 301, 900 kWh
   - 既存Excel比較: 差異が1円以上なら原因分解
   - 自動CI: GitHub Actions で全テスト実行

#### 成果物

```
packages/calc-core/
├── src/            ⏳ 実装
├── tests/          ⏳ 100% カバレッジ目標
├── package.json    ⏳ 作成
└── dist/           ⏳ ビルド出力

scripts/
├── compare_legacy_excel.ts      ⏳ 既存Excel比較スクリプト

reports/
├── legacy_comparison.csv        ⏳ 差分レポート
└── regression_summary.md        ⏳ テスト結果
```

#### 成功基準

- [ ] 全ての境界値テストが成功
- [ ] 既存Excelとの差異が説明可能（0円差またはルール差異で明示）
- [ ] 計算式の出力が自然言語で説明可能
- [ ] 100% テストカバレッジ達成

---

### フェーズ4: 静的Web UI 実装（Phase A）
**目標**: 素人向けWebアプリケーションを完成させる

#### 実施項目

1. **UI フレームワーク選択**（未決定、提案）
   - React + TypeScript （推奨: エコシステム充実）
   - 候補: Svelte, Vue 3, Vanilla TS

2. **スクリーンフロー**

   ```
   ホーム画面
   ├─ 「手で入力」
   │   └─ 入力フォーム（会社・使用量）
   │       └─ 比較結果（月額・年額）
   │           └─ 計算根拠（折りたたみ）
   │               └─ PDF出力
   │
   ├─ 「検針票を撮る」（Phase B）
   │   └─ 画像アップロード
   │       └─ OCR確認画面
   │           └─ 修正フォーム
   │               └─ 比較結果
   │
   └─ 「FAQ」「出典」「管理者機能」
   ```

3. **主要ページ実装**

   1. **ホーム（Home.tsx）**
      - 2つのボタンのみ: 「手で入力」「検針票から」
      - "わからない → AIに聞く" リンク

   2. **手入力フォーム（ManualInput.tsx）**
      - 会社選択: チェックボックス（中国電力 / JAでんき）
      - 使用量入力: 数値入力
      - 「検針票のどこ?」ボタン → ツールチップで画像表示
      - 次へボタン

   3. **比較結果（ComparisonResult.tsx）**
      - ファーストビュー:
        ```
        月額 ¥500 お得!      (緑)
        年額 ¥6,000 削減見込み
        
        【比較表】
              現在     JAでんき   差分
        月額 ¥8,000  ¥7,500   ¥500▼
        ```
      - 折りたたみセクション:
        - 詳細内訳（段階別）
        - 出典・ルール
        - 試算ID
        - 警告・注意事項

   4. **計算根拠（CalculationDetails.tsx）**
      - 計算式の文章表現
      - 各プランの概要
      - 燃料費調整・再エネ賦課金の説明
      - 出典ファイル名・ページ・適用期間

   5. **PDF出力（PdfGenerator.tsx）**
      - クライアント側で jsPDF + html2canvas で生成
      - 内容:
        - 試算日、試算ID
        - 入力値（会社・使用量・契約アンペア）
        - 月額・年額・削減額
        - 詳細内訳
        - 根拠（出典・ルール）
        - 注意事項

4. **レスポンシブ設計**
   - PC / タブレット / スマートフォン対応
   - ボタン高さ最低 56px、文字 16px以上
   - 片手操作を想定

5. **PWA対応**
   - `public/manifest.json` 作成
   - Service Worker 実装（オフライン動作）
   - スマートフォンのホーム画面追加対応

#### ファイル構成

```
apps/web/
├── src/
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── ManualInput.tsx
│   │   ├── ComparisonResult.tsx
│   │   ├── CalculationDetails.tsx
│   │   └── FAQ.tsx
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── PdfGenerator.tsx
│   │   └── Tooltip.tsx
│   ├── services/
│   │   ├── calculateService.ts     # calc-core 利用
│   │   └── storageService.ts       # セッション管理
│   ├── styles/
│   │   └── theme.css               # 色分け設定
│   ├── App.tsx
│   └── index.tsx
├── public/
│   ├── manifest.json               # PWA
│   └── sw.ts                       # Service Worker
├── package.json
├── tsconfig.json
└── vite.config.ts
```

#### 成功基準

- [ ] ホーム画面から PDF 出力までの全フロー完成
- [ ] スマートフォンで動作確認（各主要ブラウザ）
- [ ] PDF出力に個人情報が含まれない
- [ ] localStorage に個人情報が保存されない
- [ ] PWA として ホーム画面追加で起動可能

---

### フェーズ5: デプロイ設定と DEPLOY.md 完成化
**目標**: 本番環境への配置方法を確立する

#### 実施項目

1. **ビルド設定**
   - package.json に build script 追加
   - 出力ファイル: dist/ フォルダ（静的）
   - MIME タイプ設定（.js, .wasm, .json）

2. **DEPLOY.md 詳細化**
   - ローカル開発セットアップ
   - ビルドコマンド実行例
   - SharePoint デプロイ手順
   - 社内Webサーバー デプロイ手順
   - Azure Static Web Apps デプロイ手順
   - PWA 追加手順（OS別）
   - トラブルシューティング

3. **自動テスト設定**
   - GitHub Actions ワークフロー
   - calc-core ユニットテスト
   - 回帰テスト（既存Excel比較）
   - セキュリティチェック

4. **ドキュメント整備**
   - README.md（プロジェクト概要）
   - CLAUDE.md（開発ルール）
   - .env.example（環境変数テンプレート）
   - .gitignore（.env, dist/, node_modules）

#### 成果物

```
./
├── README.md                ⏳ 作成
├── CLAUDE.md                ⏳ 開発ルール
├── DEPLOY.md                ✅ 詳細化
├── .env.example             ⏳ 作成
├── .gitignore               ⏳ 作成
├── package.json             ⏳ 整備
├── .github/
│   └── workflows/
│       └── build.yml        ⏳ CI/CD設定
└── dist/                    ⏳ ビルド出力

```

#### 成功基準

- [ ] DEPLOY.md の手順だけで本番デプロイ再現可能
- [ ] CI/CD で自動ビルド・テスト完成
- [ ] Phase A の静的 Web App が本番公開可能な状態

---

### フェーズ6～10: Phase B 実装（オプション）

フェーズ5完了後、以下を実装（時間・リソース許可時）:

- **フェーズ6**: 管理画面（料金マスター更新・承認）
- **フェーズ7**: 料金自動取得ボット（Python + Azure Functions）
- **フェーズ8**: OCR アダプタ設計（Azure AI Document Intelligence）
- **フェーズ9**: AI 案内役インターフェース（生成AI接続の設計）
- **フェーズ10**: セキュリティレビュー、最終テスト、手順書完成

---

## 全体スケジュール（概算）

| フェーズ | 工数 | 期間 | 状態 |
|---------|------|------|------|
| 0 | 8h | 1日 | ✅ 完了 |
| 1 | 16h | 2-3日 | ⏳ 進行中 |
| 2 | 20h | 3日 | 予定 |
| 3 | 60h | 1週間 | 予定 |
| 4 | 100h | 2週間 | 予定 |
| 5 | 30h | 3-4日 | 予定 |
| **Phase A 小計** | **234h** | **4-5週間** | - |
| 6-10 | 200h | 4-5週間 | オプション |
| **全体** | **434h** | **8-10週間** | - |

---

## リスク・依存関係

### 高リスク項目

1. **料金定義書の入手遅延** → フェーズ1で影響
   - 対策: Google Drive 詳細検索、ローカルコピー依頼

2. **既存Excel との差異** → フェーズ3で検出
   - 対策: 差分分析スクリプト、根拠文書確認

3. **ブラウザ互換性** → フェーズ4で検証
   - 対策: 対応ブラウザリスト明確化、テスト自動化

### 依存関係

- フェーズ1 → フェーズ2（料金ルール確定待ち）
- フェーズ2 → フェーズ3（JSON スキーマ確定待ち）
- フェーズ3 → フェーズ4（calc-core 実装完了待ち）
- フェーズ4 → フェーズ5（UI 完成待ち）

---

## 品質目標

- **テストカバレッジ**: 100%（calc-core）、80%（Web UI）
- **既存Excel との一致**: 差異 0円 または 説明可能な理由
- **セキュリティ**: OWASP Top 10 チェック合格
- **アクセシビリティ**: WCAG 2.1 AA 準拠目標

---

**最終更新**: 2026-08-20
**次回確認**: フェーズ1完了時
**プロジェクト管理**: このドキュメントで進捗追跡
