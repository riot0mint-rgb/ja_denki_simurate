# 実装計画書 (IMPLEMENTATION_PLAN.md)

**フェーズ1完了日**: 2026-08-20
**全体構成**: 10フェーズ（Phase A: 1-5、Phase B: 6-10）
**推定工数**: Phase A: 250時間（完了）、Phase B: 約62人日（下記「規模の見積り」参照）

---

## フェーズ別実装計画

### フェーズ0: ✅ 完了
- [x] 作業ディレクトリ作成
- [x] Git初期化と設定
- [x] 元資料の読み取り専用確認
- [x] ASSUMPTIONS.md, SECURITY.md 初期作成

---

### フェーズ1: ✅ 完了
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

### フェーズ2: ✅ 完了 — 料金マスター設計と出典管理
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

### フェーズ3: ✅ 完了 — 計算エンジン実装（calc-core）
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

### フェーズ4: ✅ 完了 — 静的Web UI 実装（Phase A）
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

- [x] ホーム画面から PDF 出力までの全フロー完成
- [x] PDF出力に個人情報が含まれない — 氏名・住所・連絡先の入力欄がそもそも無い。テストで固定
- [x] localStorage に個人情報が保存されない — `localStorage` をアプリ全体で使っていない
- [x] PWA として ホーム画面追加で起動可能 — Service Worker でオフライン起動も確認済み
- [ ] スマートフォン実機での動作確認（各主要ブラウザ） — Chromium での自動確認のみ

---

### フェーズ5: ✅ 完了 — デプロイ設定と DEPLOY.md 完成化
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
├── README.md                ✅ 作成
├── CLAUDE.md                ✅ 開発ルール
├── DEPLOY.md                ✅ 詳細化
├── .gitignore               ✅ 作成
├── package.json             ✅ 整備
├── .github/
│   └── workflows/
│       └── build.yml        ✅ CI/CD設定
└── dist/                    ✅ ビルド出力

`.env.example` は作らない。Phase A はブラウザ内で完結し、環境変数を1つも読んでいない
（`import.meta.env` / `process.env` の参照がゼロ）。空のテンプレートを置くと
「設定すべき何かがある」と誤解させるため。Phase B で必要になった時点で作る。

```

#### 成功基準

- [x] DEPLOY.md の手順だけで本番デプロイ再現可能
- [x] CI/CD で自動ビルド・テスト完成 — テスト・カバレッジ閾値・型検査・料金マスターdriftを検証
- [x] Phase A の静的 Web App が本番公開可能な状態

---

### フェーズ6: ✅ 完了 — 料金改定レビュー

**2026-08-20 に設計変更**。当初は「管理画面で人が単価を打ち込み、承認ボタンで反映」
だったが、フェーズ1〜4で **単価が元資料から機械的に取り出せることが確定した**ため、
画面ではなくパイプラインにした。承認は Pull Request のレビュー、
監査証跡は Git の履歴とする。

詳細: **[PHASE_6_DESIGN.md](./PHASE_6_DESIGN.md)**

| 部品 | 状態 |
|---|---|
| `scripts/generate-rate-master.ts`（正本→JSON） | ✅ 完了 |
| `scripts/rateMasterDiff.ts`（改定差分レポート） | ✅ 完了 |
| 出典据え置きの検知（転記ミス対策） | ✅ 完了 |
| 回帰テストによる関門（1201点） | ✅ 完了 |
| `scripts/rate-intake.ts`（試算表との突合） | ✅ 完了 |
| GitHub Actions での改定PR自動作成 | ⏳ 未実装 |

### フェーズ7: 料金自動取得 🔻 縮小

比較対象は **JAでんきが自ら作った試算表**であり、Google Drive で確実に入手できる。
各社サイトのスクレイピングで取り直す必要はない。

さらにフェーズ1で **同じプランでも試算表ごとにモデル化が食い違う**ことが判明している
（夜トクの基本料金半額の扱い、JA従量電灯A 最低料金の 759.68 と 759.67 など）。
機械的な取り込みではこの食い違いを解決できない。

→ スクレイピングは **裏取り専用**に位置づけ直す。値の反映元にはしない。

### フェーズ8〜11（2026-08-21 に順序変更）

| フェーズ | 内容 | 状態 |
|---|---|---|
| **8** | 説明の自動生成（AI案内役） | ✅ 完了（テンプレート方式・2026-08-21） |
| **8-b** | 商談ナビ（営業支援）| ✅ 完了（2026-08-21・テンプレート方式） |
| **8-c** | 商談の確度判定・再訪の管理・集計の管理者向け切り離し | ✅ 完了（2026-08-22） |
| **9** | セキュリティレビュー・受け入れテスト | ✅ 完了（2026-08-21、2026-08-22 に46項目へ拡張） |
| **10** | ローンチ（配布方法と運用手順の確定） | 着手（オンプレミス VM 前提で DEPLOY.md 3-4／3-5 を追加） |
| **11以降** | アップデート候補（OCR・生成AI・動力コース・他エリア） | 未着手 |

**OCRをローンチ後に回したのは妥当。** 一番重いうえ、Phase A で唯一
「個人情報がブラウザの外に出る」変更であり、ルール9の改定と委託契約が要る。
ローンチを人質に取る作業ではない。

#### フェーズ9でやったこと（2026-08-21）

**方針を書くのをやめて、検査できるようにした。** SECURITY.md には
Azure Functions・Entra ID・jsPDF・localStorage への保存といった、
実装されていない仕組みが書かれていた。実装されていない対策が書いてある
監査文書は、無いより有害なので全面的に書き直した。

| 成果物 | 中身 |
|---|---|
| `npm run security:check` | ソース・配布物・SW を9規則で検査。CI の関門。検査自体を24件のテストで固定（カバレッジ100%） |
| `npm run security:runtime` | 実機で全12シナリオを操作し、外部通信0本・保存API0件・入力値のログ出力0行を確認 |
| `npm run accept` | 受け入れテスト13項目。**配る物そのもの**を本物のブラウザ・HTTP・SW込みで通す |
| `docs/ACCEPTANCE_TEST.md` | 第1部＝機械（開発担当5分）／第2部＝人（業務担当30分） |
| `npm audit --omit=dev` の関門化 | 本番依存は decimal.js / react / react-dom の3つだけ |

**直したもの**:

- Node 18（2025-04 にEOL）→ 20/22 LTS。vite 4→7 / vitest 1→3
  （旧版に High・Critical の勧告があった）。脆弱性 7件 → 2件（残りは
  改定取り込みツール専用の exceljs→uuid で、前進する修正版が無い）
- 検索避け（`noindex` メタ + `robots.txt`）と `referrer: no-referrer`
- 画面に「JA職員向け」の表記とフッターの但し書き
- 配信時のヘッダ（CSP・X-Robots-Tag 等）を DEPLOY.md に明記

**受け入れテストが自分の欠陥を3件見つけた。** いずれもアプリではなくテスト側の
誤りだったが（印刷の可視判定が祖先の display:none を見ていない、
かんたん試算のボタン探索が結果画面の「条件を変えて試算する」に当たって往復していた、
auでんきの有利不利が月で入れ替わることを見落としていた）、
**書いたテストが本当に落ちるかを確かめないと、合格は何も意味しない。**

#### フェーズ8-c でやったこと（2026-08-22）

商談ナビが「今日どう話すか」までで終わっていて、**次にいつ行くかが決められなかった**。
素人がいちばん詰まるのはそこで、行かないか、間を置かずに行って嫌われるかに割れる。

| 成果物 | 中身 |
|---|---|
| `services/confidence.ts` | 確度 A〜E を**起きた事実から**判定。感触は ±1 までしか効かせない。26件のテスト・カバレッジ100% |
| 再訪の口実 | 料金改定の予定と、前回どの検針月で試算したかから、言う理由のほうを用意する |
| 打ち切りの規則 | 「今後の訪問はご遠慮したい」→ 無条件で E。高くなる結果 → D（追いかけない） |
| 商談ログの3列追加 | 確度・次回の目安・前回の止まり。名簿へ書き写すぶん |
| `admin.html` / `AdminApp.tsx` | 集計を管理者向けの別ビルドへ切り離し |
| `admin-separated` / `admin-not-precached` | 切り離しが壊れたら CI が落ちる関門 |

**このアプリは何も覚えていない。** 確度も次回の目安も、その場で計算して画面に出し、
職員がJAの名簿へ書き写す。オンプレミス VM を持っていても、
**アプリを「もう一つの顧客名簿」にはしない**（docs/VISIT_LOG_DESIGN.md）。

**集計を職員の画面から外したのは、事故を防ぐため。** 何件回って何件決まったかは
訪問中の職員には要らない情報で、お客様の前で開いてしまう。ビルドごと分けたので
職員側のバンドルに集計のコードは1バイトも入らない。
アクセス制限は配信する VM 側でかける（DEPLOY.md 3-5）。画面の中で判定しても、
JavaScript は誰でも読めるので意味がない。

**確度の重みは仮説である。** 集計画面に「確度の判定は当たっているか」（確度別の
実際の申込率）を置いた。A より B が高いなど順序が崩れていたら重みが間違っている。
**実績が溜まったら直す前提の数字**として扱う（ASSUMPTIONS.md）。

#### 前提条件: URLを知っている職員が使えること（アカウント不要）

これは配布の条件であると同時に、**フェーズ8の中身を決める条件**でもある。

生成AIのAPIキーは静的サイトに置けない（配ったページから誰でも抜ける）。
よってAI案内役には必ずサーバー（プロキシ）が要る。そのサーバーが
アカウント不要で誰でも叩ける状態だと、第三者に無料でLLMを使われる。
認証なしで守る手段はレート制限とOrigin制限しかなく、どちらも決定打にならない。

**「アカウント不要」と「生成AIによる案内役」は、素直には両立しない。**

| 案 | サーバー | アカウント | 説明の中身 |
|---|---|---|---|
| **8-a テンプレート方式**（推奨） | 不要 | 不要 | 計算の内訳から機械的に文章を組み立てる |
| 8-b 合言葉つきプロキシ | 要 | 不要（URLに合言葉） | 生成AI。合言葉が漏れたら差し替え |
| 8-c 認証つき | 要 | **要** | 生成AI。前提条件に反する |

**8-a で実装した（2026-08-21）。** 「なぜ安くなるのか」の説明は、実は生成AIを必要としない。
第1段階の単価が何円違う、基本料金が何円違う、この使用量ではどの段階が効く、
といったことは**計算の内訳からそのまま導ける**。テンプレートなら文言を
人がレビューでき、同じ入力には必ず同じ説明が出て、ルール1とも整合する。
生成AIは、ローンチ後に 8-b として足せる。

#### 配布先（フェーズ10の前提）

**JAが保有するオンプレミス VM に置く（2026-08-22 決定）。** 配るのは
`apps/web/dist/` の中身だけで、サーバー側で動くプログラムは無い
（Phase A はブラウザ内計算のため、DB・API・実行環境のいずれも不要）。
手順は DEPLOY.md「3-4. オンプレミス VM へのデプロイ」。

職員向けの画面には引き続き認証をかけない（＝URLを知れば誰でも開ける）。

- 検索避け（noindex）と画面への「社内向け」表記は最低限入れる
- **JAの既存ドメイン配下に置くのが、社内プロキシに弾かれにくい。**
  見慣れないドメインは弾かれる（claude.ai が実際に弾かれた）
- HTTPS は必須（Service Worker の要件）。単体HTMLの配布はオフライン動作を失う
- **`/admin.html` にはサーバー側で制限をかける**（DEPLOY.md 3-5）。
  IdP・IP制限・Basic認証のどれにするかは未決定

⚠️ SPA のリライト規則には「実在するファイルでないとき」の条件を必ず付ける。
条件なしで全部を `index.html` へ送ると、`admin.html` や `assets/*.js` まで
職員向けの画面に化ける。

#### 規模の見積り（2026-08-20 更新）

当初の「200時間」は実装工数だけの数字だった。実際の規模を決めるのは
**コード量ではなく前提の変更**である。

Phase A はブラウザ内で完結し、サーバーを1台も持たず環境変数を1つも読んでいない
（CLAUDE.md ルール9 が構造として成立している）。Phase B で検針票の画像を
OCR に送った時点で、**個人情報がブラウザの外に出る**。ルール9 の改定承認・
委託契約（DPA）・プライバシーポリシー・同意フロー・保持期間・ログのマスキングが
そろって必要になり、**法務と契約が実装と同等かそれ以上のクリティカルパス**になる。

| フェーズ | 作業 | 人日 | 社外依存 |
|---|---|---:|---|
| 8 | 検針票サンプルの収集・ラベリング | 4 | JA（実物が要る） |
| 8 | カスタムモデルの学習・精度評価 | 5 | |
| 8 | アダプタ実装（画像→`UsageInput`・信頼度・確認画面） | 8 | |
| 8 | 精度回帰の自動化（正解データセット） | 4 | |
| 8 | サーバー基盤（API・秘密管理・レート制限） | 6 | 契約 |
| 8 | 個人情報の設計（保存しない・マスキング・保持期間） | 4 | 法務 |
| 9 | 出力契約の設計（数値は calc-core だけが出す） | 3 | |
| 9 | 実装（プロンプト・テンプレート・拒否経路） | 5 | |
| 9 | 幻覚検出の評価スイート | 6 | |
| 9 | 費用・レート管理 | 2 | |
| 10 | 脅威モデリング・セキュリティレビュー | 4 | |
| 10 | 委託契約・ポリシー・同意フロー | 5 | 法務 |
| 10 | 運用手順書・障害時対応 | 3 | |
| 10 | 受け入れテスト | 3 | JA |
| | **合計** | **約62人日** | 1人で3か月弱 |

Phase A の実績は本体 5,102行・テスト 4,294行・49コミット。Phase B の本体は
同規模だが、**テストの性質が変わる**。OCR の読み取り精度と LLM の出力は
決定論ではないため、合否ではなく閾値で管理することになり、正解データセットの
整備そのものが工数になる。料金計算だけは決定論のまま据え置く（ルール1）。

ランニングコストは **未見積り**（Azure・LLM の単価を確認していないため、
ここに数字を書かない。ルール4）。

#### 縮小案（フェーズ11以降の候補）

「個人情報をサーバーに出すか」の一点だけが判断事項。

| 案 | 内容 | 人日 | ルール9 | アカウント |
|---|---|---:|---|---|
| **8-a テンプレート説明** | 生成AIを使わず、計算の内訳から文章を組み立てる | 約5 | 維持 | 不要 |
| B-2 端末内OCR | ブラウザ内でOCRし画像を送らない。精度は落ちるので確認画面が前提 | 約15 | 維持 | 不要 |
| B-3 生成AIの案内役 | 数値は calc-core が出し、文章だけ生成AIに書かせる | 約18 | 維持 | **プロキシが要る** |
| B-1 サーバーOCR | 上表のとおり | 約62 | **改定が必要** | 要 |

**推奨は 8-a → B-2 → B-3 → B-1 の順。**
8-a はサーバーもアカウントも要らず、ローンチ前に入れられる。

なお **2026年10月改定への対応が Phase B より優先**（「次にやること」参照）。

---

## 全体スケジュール（概算）

| フェーズ | 状態 | 備考 |
|---------|------|------|
| 0 資料棚卸し | ✅ 完了 | |
| 1 元資料の分析 | ✅ 完了 | 公式試算表8ファイルを解読 |
| 2 料金マスター設計 | ✅ 完了（設計変更） | 正本は JSON ではなく TypeScript。下記参照 |
| 3 計算エンジン | ✅ 完了 | 8構造・156テスト・カバレッジ100% |
| 4 Web UI | ✅ 完了 | PDF出力・Service Worker を含む |
| 5 デプロイ設定 | ✅ 完了 | |
| **Phase A** | **✅ 完了** | |
| 6 料金改定レビュー | ✅ 完了（設計変更） | 突合・差分レポート・回帰の関門 |
| 7 料金自動取得 | 🔻 縮小 | 裏取り専用に位置づけ直し |
| 8 説明の自動生成 | ✅ 完了 | サーバー不要のテンプレート方式。生成AIは使わない |
| 9 セキュリティレビュー・受け入れテスト | 未着手 | |
| 10 ローンチ | 未着手 | 配布先と運用手順の確定 |
| 11以降 | 未着手 | OCR・生成AI・動力コース・他エリア |

#### フェーズ2 の設計変更（2026-08-20）

計画では `data/rate_master.json` を JSON スキーマ付きの正本にする想定だったが、
実際の正本は **TypeScript**（`apps/web/src/data/rates.ts` と
`packages/calc-core/src/monthlyRates.ts`）になった。

理由は、型と `Decimal` をそのまま持てること、すべての値に出典
（ファイル名・シート名・セル番地）が付いた状態で**コンパイル時に検証できる**こと。
JSON では出典の欠落を型で防げない（ルール4）。

`data/rate_master.json` は正本からの**生成物**とし、監査とフェーズ6の
改定レビューが読む。CI が `npm run rate-master:check` で drift を落とす。

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
  → 達成。calc-core 100% / Web UI 97.6% / scripts 100%。CI が閾値を強制
  （テスト計 805件：calc-core 298 / Web 412 / scripts 95）
- **既存Excel との一致**: 差異 0円 または 説明可能な理由
- **セキュリティ**: OWASP Top 10 チェック合格
- **アクセシビリティ**: WCAG 2.1 AA 準拠目標

---

**最終更新**: 2026-08-22（フェーズ8-c 完了、オンプレミス VM 前提でフェーズ10 着手）
**次回確認**: 2026年10月改定の定義書が入手できた時点
**プロジェクト管理**: このドキュメントで進捗追跡
