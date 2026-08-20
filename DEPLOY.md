# デプロイメント・運用ガイド (DEPLOY.md)

**状態**: ✅ Phase 5 - ビルド・デプロイ設定完成

本ドキュメントは、JAでんき料金比較シミュレータの導入・運用・更新手順をボタン操作レベルで説明します。

---

## Phase A デプロイメント（静的Web App）

### 前提条件

- Node.js 18+ がインストール済み
- npm または yarn が利用可能
- HTTPS対応のホスティング環境（SharePoint / 社内Webサーバー / Azure Static Web Apps）

### 1. ローカル開発環境のセットアップ

**1-1. リポジトリクローン**
```bash
git clone https://github.com/riot0mint-rgb/ja_denki_simurate.git
cd ja_denki_simurate
```

**1-2. 依存パッケージインストール**
```bash
npm install
```
このコマンドは自動的に以下を実行します：
- Root ワークスペース設定の読み込み
- `packages/calc-core` のビルド
- `apps/web` の依存関係インストール

**1-3. 全テスト実行（オプション）**
```bash
npm test
```
期待値：
- `Test Suites: 6 passed, 6 total`
- `Tests: 84 passed, 84 total`
- 実行時間: ~4 秒

**1-4. ローカルサーバー起動**
```bash
npm run dev
```
出力例：
```
  VITE v4.5.14  ready in 250 ms
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

ブラウザで `http://localhost:5173` にアクセスしてアプリケーションが表示されることを確認してください。

### 2. ビルドと本番成果物作成

**2-1. プロダクションビルド**
```bash
npm run build
```

期待される出力：
```
vite v4.5.14 building for production...
✓ 47 modules transformed.
dist/index.html                   0.55 kB │ gzip:  0.38 kB
dist/assets/index-[hash].css      1.86 kB │ gzip:  0.81 kB
dist/assets/index-[hash].js     187.20 kB │ gzip: 63.40 kB
✓ built in 2.24s
```

**2-2. 出力ファイル確認**
```bash
ls -la dist/
```

生成ファイル：
- `dist/index.html` - SPA エントリーポイント
- `dist/assets/index-[hash].css` - 最適化された CSS
- `dist/assets/index-[hash].js` - バンドルされた React アプリケーション
- `dist/manifest.json` - PWA マニフェスト（public/ からコピー）

**2-3. PWA マニフェスト確認**
```bash
cat dist/manifest.json | head -20
```

確認項目：
- ✓ `"name"`: "JAでんき料金比較シミュレーター"
- ✓ `"theme_color"`: "#2d9d78"
- ✓ `"icons"` 配列が存在
- ✓ `"start_url"`: "/" で指定

### 3. デプロイメント先別手順

#### 3-1. Azure Static Web Apps へのデプロイ（推奨）

**前提**：
- Azure アカウント（JAグループ共通）
- GitHub リポジトリへの権限

**手順**：

1. Azure Portal で Static Web App を作成
   ```
   リソースタイプ: Static Web App
   リソース名: ja-denki-simulator
   SKU: Free (開発・テスト用)
   GitHub リポジトリ: riot0mint-rgb/ja_denki_simurate
   ブランチ: main
   ```

2. GitHub Actions ワークフロー自動生成を確認
   ```
   .github/workflows/azure-static-web-apps-[id].yml
   ```
   確認項目：
   - ✓ `npm run build` コマンドが実行される
   - ✓ 出力フォルダが `dist` に設定されている
   - ✓ Node.js 18 以上が指定されている

3. ワークフローが自動実行
   ```
   - Build job starts
   - npm install && npm run build
   - Artifact upload
   - Deployment
   ```

4. デプロイ完了後、割り当てられたドメインでアクセス可能
   ```
   https://<app-id>.azurestaticapps.net/
   ```

#### 3-2. SharePoint へのアップロード

**手順**：

1. SharePoint Online にアクセス
   ```
   URL: https://[organization].sharepoint.com/sites/[site]
   ```

2. ドキュメントライブラリを選択
   ```
   例: /sites/sales/Shared Documents/tools/
   ```

3. `npm run build` で生成された `dist/` フォルダ内の全ファイルをアップロード
   - index.html
   - assets/ フォルダ（CSS・JS）
   - manifest.json

4. ライブラリ設定で index.html をデフォルトドキュメントに指定
   ```
   ライブラリ設定 → 詳細設定 → デフォルト ドキュメント: index.html
   ```

5. SharePoint URL でアクセス可能
   ```
   https://[organization].sharepoint.com/sites/[site]/Shared Documents/tools/index.html
   ```

#### 3-3. 社内 Web サーバー（IIS）へのデプロイ

**前提**：
- Windows Server + IIS インストール済み
- 管理者権限

**手順**：

1. IIS マネージャーを起動
   ```
   Win+R → inetmgr.exe
   ```

2. 新規 Web サイト作成
   ```
   サイト名: ja-denki-simulator
   物理パス: C:\inetpub\wwwroot\ja-denki-simulator
   バインディング: https://[domain]/ja-denki/
   ```

3. `npm run build` で生成された `dist/` フォルダの全ファイルを配置
   ```powershell
   Copy-Item -Path ".\dist\*" -Destination "C:\inetpub\wwwroot\ja-denki-simulator\" -Recurse -Force
   ```

4. MIME タイプ設定（Application の設定を確認）
   | ファイル拡張子 | MIME タイプ |
   |---|---|
   | .js | application/javascript |
   | .css | text/css |
   | .json | application/json |
   | .woff2 | font/woff2 |

5. URL Rewrite モジュール設定（SPA ルーティング対応）
   ```
   - インバウンドルール追加
   - パターン: ^(.*)$
   - アクション: index.html にリライト
   ```

6. HTTPS 設定
   - SSL 証明書をバインディングに割り当て
   - HTTP → HTTPS リダイレクト設定

7. アクセス確認
   ```
   https://[domain]/ja-denki/
   ```

### 4. PWA としてのスマートフォン追加

**Android（Chrome）**：

1. デプロイされたアプリケーションをスマートフォン（Android）で開く
2. Chrome メニュー（3 点アイコン）→ 「アプリをインストール」をタップ
3. または Chrome アドレスバーに表示される「インストール」アイコンをタップ
4. 確認ダイアログで「インストール」をタップ
5. ホーム画面に「JAでんき料金比較」アイコンが追加される

**iOS（Safari）**：

1. デプロイされたアプリケーションを Safari で開く
2. 下部の共有アイコン（四角から矢印）をタップ
3. 「ホーム画面に追加」をタップ
4. アプリ名を確認して「追加」をタップ
5. ホーム画面に「JAでんき料金比較」アイコンが追加される

**オフライン動作**：

Service Worker（`dist/sw.js`）により、**電波の届かない場所でも起動して試算できます**。
単価は JS バンドルに含まれているため、バンドルがキャッシュされていれば計算は成立します。

- 初回アクセス時に画面・アセット一式をキャッシュします
- 2回目以降は通信がなくても起動します
- `sw.js` は `public/sw.js` を雛形に、ビルド時にアセット一覧とキャッシュ名が埋め込まれます
  （`apps/web/vite.config.ts` の `sw-manifest` プラグイン）

**キャッシュ更新ポリシー**：

料金アプリで最も避けたいのは**古い単価のまま試算し続けること**です。
そのため次の方針にしています。

| 対象 | 方針 | 理由 |
|---|---|---|
| 画面遷移（HTML） | network-first | 通信があれば必ず最新を取りに行く |
| JS / CSS / 画像 | cache-first | ハッシュ付きなので内容が変われば URL が変わる |
| 古いキャッシュ | 有効化時に全削除 | 版が混ざらないようにする |

**新しい単価をデプロイしたときの利用者の見え方**：

1. 次回アクセス時にブラウザが `sw.js` の更新を検知します
2. 画面上部に「**新しい料金データがあります／更新する**」のバナーが出ます
3. 「更新する」を押すと新しい版に切り替わり、画面が読み込み直されます

自動では切り替えません（試算の入力途中で画面が作り直されると入力が消えるため）。
またバナーに「閉じる」は用意していません。単価の改定を見逃さないためです。

**強制的に配り直したい場合**：

再ビルドしてデプロイすれば `sw.js` のキャッシュ名が変わり、上記の更新導線が働きます。
それでも古い版が残る端末があれば、完全キャッシュクリアを案内してください。

- Android: 設定 → アプリ → Chrome → キャッシュをクリア
- iOS: 設定 → Safari → 閲覧履歴とWebサイトデータを消去

**配信サーバー側の注意**：

`sw.js` に長い `Cache-Control` を付けないでください。更新が検知されなくなります
（`Cache-Control: no-cache` を推奨）。

### 4-2. 試算結果の PDF 保存・印刷

結果画面の「**PDFで保存・印刷**」から、内訳と単価の出典まで含めて1枚に出力できます。
ブラウザの印刷機能を使うため追加のライブラリはありません。

- 操作用のボタン・チェックボックスは紙には出ません
- 「計算の内訳」は畳んだままでも印刷には展開されます
- 試算日と適用単価の月が紙にだけ入ります（いつ時点の試算か分かるように）
- **個人情報は載りません**。そもそもこのアプリは氏名・住所・連絡先を入力させません
  （CLAUDE.md ルール7・9）

PDF にするには印刷ダイアログで送信先に「PDFに保存」を選びます。

### 5. 料金マスター更新手順（Phase A）

**重要**: 料金更新後、CLAUDE.md ルール #10に従い必ず人間が確認・承認を行ってください。

**5-1. 料金改定の反映手順**

設計の全体像は [PHASE_6_DESIGN.md](./docs/PHASE_6_DESIGN.md) を参照してください。
承認は Pull Request のレビューで行い、監査証跡は Git の履歴になります。

1. **新しい試算表を入手**

   適用月ごとに Google Drive の `シミュレーション【YY年M月適用】/` に置かれます。
   **元資料は読むだけ**です。移動・改名・削除は禁止（CLAUDE.md ルール3）。

2. **ブランチを切る**

   ```bash
   git checkout -b rate-update-202610
   ```

3. **正本を更新**

   単価: `apps/web/src/data/rates.ts`
   燃料費調整額・再エネ賦課金: `packages/calc-core/src/monthlyRates.ts`

   ```typescript
   export const jaDenkiJuryoA: TieredMinimumPlan = {
     // ...
     tiers: tiers15('33.00', '38.04', '38.84'),   // 新しい単価
     sources: [src(DOC.juryoA, '基本項目!E26:E29（規制料金）')]  // ★出典も必ず更新
   }
   ```

   **出典を据え置いたまま単価だけ変えないでください。** 手順7の差分レポートが
   これを転記ミスとして警告します（ルール4）。

4. **料金マスターを再生成**

   ```bash
   npm run rate-master:generate
   ```

5. **テストを走らせる**

   ```bash
   npm test
   ```

   期待値: calc-core 156件 / web 80件 / scripts 13件がすべて通過。

   単価を変えると早見表1201点の回帰や分岐点のテストが落ちます。
   **これは正常です。** 新しい単価に対する期待値へテストを更新し、
   なぜその値になるのかをコミットメッセージに書いてください（ルール6）。

6. **検算**

   ```bash
   npm run test:coverage
   ```

   `excelReference.test.ts` が新しい試算表の早見表と **差異0円**であることを確認します。
   ±100円といった許容誤差は設けていません。差が出るなら理由を特定してください。

7. **差分レポートを作る**

   ```bash
   npm run rate-master:diff -- --out /tmp/rate-diff.md
   ```

   「どの値が、いくらから、いくらに、どの出典で変わったか」が Markdown で出ます。
   これをそのまま PR の本文に貼ります。

8. **コミット・プッシュ**

   ```bash
   git add -A
   git commit -m "rate-update: JAでんき 2026年10月適用の単価改定"
   git push -u origin rate-update-202610
   ```

9. **Pull Request を作成** — 本文に手順7の差分レポートを貼る

10. **人によるレビュー・承認**（必須。CLAUDE.md ルール10）

    確認すること:
    - 差分レポートの各値が、示された出典のセルと一致しているか
    - 「出典が据え置き」の警告が出ていないか
    - テストがすべて通っているか（CI が緑か）
    - 落ちたテストの期待値変更に根拠が書かれているか

    **merge しない限り本番には出ません。** merge が承認です。

11. **マージ・自動デプロイ**

    GitHub Actions がビルドとテストを実行し、成果物を配信します。

12. **本番環境で動作確認**

    - 代表的な使用量で月額が更新されているか
    - 利用者の画面に「新しい料金データがあります」のバナーが出るか
      （Service Worker の更新導線。詳細は「4. PWA」参照）
    - コンソールエラーが出ていないか

**5-2. ロールバック手順**（問題発生時）

```bash
# 前版に戻す（履歴を残す。強制プッシュは厳禁）
git revert <改定のマージコミット>
npm run rate-master:generate   # 生成物を正本に合わせ直す
npm test
git add -A && git commit --amend --no-edit
git push origin main
```

`git revert` を使うのは、ログを残すためです。CLAUDE.md の
「**削除・強制プッシュは厳禁**（ログ消失で対応不可に）」に従ってください。

利用者の端末には Service Worker のキャッシュが残っています。
戻した版をデプロイすれば「新しい料金データがあります」のバナーが出ますが、
**利用者が「更新する」を押すまで古い版のまま**です。
誤った単価を配ってしまった場合は、営業経由でも更新を案内してください。

### 6. トラブルシューティング

**ローカル開発時の問題**：

| 症状 | 原因 | 対応 |
|------|------|------|
| `npm install` 失敗 | Node.js バージョン不一致 | `node --version` で 18.0 以上確認 |
| `npm run build` 失敗 | メモリ不足 | `export NODE_OPTIONS=--max_old_space_size=4096` |
| `npm run dev` ポート競合 | ポート 5173 が使用中 | `npm run dev -- --port 5174` で別ポート指定 |

**本番環境での問題**：

| 症状 | 原因 | 対応 |
|------|------|------|
| 白い画面が表示 | CSS/JS ロード失敗 | ブラウザ DevTools (F12) でエラー確認 |
| 計算結果が異常 | 料金データ反映失敗 | 定義書と rates.ts を再確認 |
| PWA インストール失敗 | manifest.json 不正 | HTTPS アクセスを確認 |

**ログ確認**：

- **Azure Static Web Apps**:
  ```
  Azure Portal → Resource → Logs → Application Insights
  ```

- **ブラウザコンソール（F12）**:
  ```
  Console タブでエラー・警告を確認
  個人情報（使用量など）がログ出力されていないか確認
  ```

- **GitHub Actions ワークフロー**:
  ```
  Actions タブ → 実行履歴 → ビルドログを確認
  ```

**キャッシュクリア手順**：

- **Azure Static Web Apps**: 自動的にハッシュが付与されるため不要
- **ブラウザ**: Ctrl+Shift+Delete でキャッシュ削除 → ページ再読み込み
- **DevTools**: F12 → Network タブで「Disable cache」にチェック

---

## Phase B デプロイメント（Azure Functions + OCR）

### セクション構成（TBD フェーズ7-9で記載）

1. Azure Functions の設定
2. Azure AI Document Intelligence（OCR）の設定
3. 料金自動取得ボットのスケジュール設定
4. AI案内役の API 統合

---

## トレーニング・運用マニュアル

### 対象者別手順

**営業担当者向け**:
- シミュレーターの起動方法
- 基本的な操作フロー
- よくあるご質問への回答

**システム管理者向け**:
- 月次更新（燃料費調整・再エネ賦課金）
- 料金改定時の対応
- エラーログの確認

**開発チーム向け**:
- calc-core の更新手順
- テストの実行方法
- CI/CD パイプラインの確認

---

## セキュリティ・チェックリスト

デプロイ前に以下を確認：

- [ ] HTTPS のみ（HTTPリダイレクト有効）
- [ ] CSP（Content Security Policy）ヘッダー設定
- [ ] localStorage に個人情報なし
- [ ] API キー等が環境変数（.env）に外出しなし
- [ ] コンソールから個人情報出力なし（console.log削除）

---

## CI/CD パイプライン（GitHub Actions）

### ワークフロー自動実行

**トリガー**:
- Push to `main` ブランチ
- Pull Request to `main`

**実行内容**:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
        
      - name: Build application
        run: npm run build
      
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: apps/web/dist/
```

### デプロイ前の自動テスト

各プルリクエスト時に自動実行：

```bash
npm test                # ユニットテスト（全84テスト）
npm run build           # ビルド確認
npm run type-check      # 型チェック確認
```

期待値：
- ✓ Test Suites: 6 passed, 6 total
- ✓ Tests: 84 passed, 84 total
- ✓ Build success (no TypeScript errors)

### 本番デプロイメント

1. PR をレビュー・承認
2. `main` ブランチにマージ
3. GitHub Actions が自動実行
   ```
   Build → Test → Deploy to Azure Static Web Apps
   ```
4. デプロイ完了後、Azure が自動通知

### GitHub Actions ログ確認

```
Repository → Actions → [Workflow Name]
```

ログ項目：
- ✓ `npm install` 出力
- ✓ `npm test` テスト結果
- ✓ `npm run build` ビルド結果
- ✓ Deploy task 完了通知

---

## 監査・コンプライアンス

### 記録・監視すべき項目

**デプロイ実績**:
- デプロイ日時、実行者
- マージコミット SHA
- デプロイ対象ブランチ
- エラーの有無

**料金マスター変更履歴**:
- 変更日時、更新者
- 更新前後の料金比較
- テスト結果（Excel との差異確認）
- 定義書参照（ファイルパス・ページ番号）

**エラー・インシデント管理**:
- エラー発生日時
- 影響範囲（何件のユーザーが計算したか）
- 原因特定
- 対応内容

### Azure Monitor での監視

```
Azure Portal → Resource → Logs → Application Insights
```

監視指標：
- ページビュー数
- エラー率
- ページロード時間

### Git 監査ログ

```bash
# デプロイ履歴確認
git log --oneline main | head -20

# 特定コミットの詳細
git show [commit-hash]

# rate-update タグの確認
git tag -l "rate-*"
```

---

## よくある質問（FAQ）

**Q. Phase A（静的Web）と Phase B（OCR連携）の違いは？**

| 項目 | Phase A | Phase B |
|------|---------|---------|
| デプロイ形式 | 静的Web App | Azure Functions + OCR |
| 料金更新方法 | JSON手修正 | 自動スクレイピング |
| 画像処理 | 未対応 | 電気代請求書 OCR |
| 個人情報送信 | なし | Azure (GDPR準拠) |
| 実装予定 | ✅ 完了 | ⏳ フェーズ7-9 |

**Q. オフライン動作に対応していないのはなぜ？**

Service Worker がまだ未実装だから。Phase B で実装予定。
現在のブラウザキャッシュで基本的なページキャッシュには対応しています。

**Q. 料金更新のたびに全テストが走るのはなぜ？**

金銭計算は正確性が最優先。GitHub Actions により自動テストが実行されます。
詳細は CLAUDE.md の ルール #6 を参照。

---

**最終更新**: 2026-08-20（Phase 5 完成）
**実装完了項目**:
- ✅ Root package.json ワークスペース設定
- ✅ calc-core ESM ビルド設定
- ✅ Web app Vite ビルド設定
- ✅ ローカル開発環境 (npm run dev)
- ✅ プロダクションビルド (npm run build)
- ✅ Azure Static Web Apps デプロイ手順
- ✅ GitHub Actions CI/CD パイプライン
- ✅ 料金更新・ロールバック手順

**次フェーズ予定**: Phase B（OCR・自動取得）フェーズ 7-9
**関連文書**: SCRAPING_POLICY.md, SECURITY.md, CLAUDE.md, PHASE_3_4_STATUS.md
