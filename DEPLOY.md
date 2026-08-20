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

- Phase A（静的Web App）では、Service Worker が未実装のため、ネットワーク接続が必須です
- Phase B で Service Worker を実装予定

**キャッシュ更新ポリシー**：

- Vite ビルド時にアセットファイルにハッシュが付与されます（例：`index-3ad8c8c1.js`）
- ブラウザキャッシュは自動的に新しいハッシュを検出して更新します
- 完全キャッシュクリアが必要な場合：
  - Android: 設定 → アプリ → Chrome → キャッシュをクリア
  - iOS: 設定 → Safari → 閲覧履歴とWebサイトデータを消去

### 5. 料金マスター更新手順（Phase A）

**重要**: 料金更新後、CLAUDE.md ルール #10に従い必ず人間が確認・承認を行ってください。

**5-1. JSON ファイル差し替えによる更新**

1. 新しい料金定義書を入手
   ```
   例: 【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf
   ```

2. 料金データを抽出し、`apps/web/src/data/rates.ts` を更新
   ```typescript
   export const jadenRatenA: RatePlan = {
     // ... 新しい料金を反映
     tiers: [
       {
         tierNumber: 1,
         unitPriceYenPerKwh: new Decimal('29.50'), // 新値
         sourceFile: '【新版PDF】...',
         sourcePage: '3'
       }
       // ...
     ]
   }
   ```

3. バージョンを更新（git でトラッキング）
   ```bash
   git checkout -b feature/rate-update-202610
   # rates.ts を編集
   git add apps/web/src/data/rates.ts
   ```

4. ローカルテスト実行
   ```bash
   npm test
   ```
   期待値: `Tests: 84 passed, 84 total`

5. 計算結果の事前検算（代表値確認）
   ```
   使用量 300kWh での料金計算結果をExcelと比較
   許容誤差: ±100円（端数処理の違い）
   ```

6. コミット・プッシュ
   ```bash
   git commit -m "rate-update: JAでんき 2026年10月版料金改定"
   git push origin feature/rate-update-202610
   ```

7. プルリクエスト作成
   ```
   タイトル: Rate Update: October 2026
   説明: 新版料金定義書からの抽出内容を記載
   変更ファイル: apps/web/src/data/rates.ts
   ```

8. **人間レビュー・承認**（必須ステップ）
   - PR レビュアーが料金を定義書と照合確認
   - テスト結果を確認
   - OK なら Approve

9. マージ・自動デプロイ
   ```
   GitHub Actions が自動実行:
   - npm install
   - npm run build
   - Azure Static Web Apps へ自動デプロイ
   ```

10. 本番環境で動作確認
    ```
    https://[domain]/ja-denki/
    
    確認項目:
    - 月額料金が更新されている
    - 削減額計算が正しい
    - エラーコンソール出力なし
    ```

**5-2. ロールバック手順**（問題発生時）

```bash
# 前版に戻す
git revert HEAD
git push origin main

# または前バージョンのコミットを指定
git checkout [commit-hash] -- apps/web/src/data/rates.ts
git commit -m "Revert rate update due to issues"
git push origin main
```

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
