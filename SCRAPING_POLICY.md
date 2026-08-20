# 料金情報スクレイピング・自動取得ポリシー (SCRAPING_POLICY.md)

**状態**: フェーズ1 - ポリシー定義中

このドキュメントは、Phase B で実装予定の料金自動取得ボットが遵守すべき方針を定めます。

---

## 基本原則

### 法的・倫理的ガイドライン

1. **robots.txt の完全遵守**
   - 各社の robots.txt を事前に確認
   - Disallow 対象のパスは絶対にアクセスしない
   - User-Agent を明示

2. **利用規約の確認**
   - 各社の利用規約で自動取得を禁止していないか確認
   - 問い合わせが必要な場合は事前取得

3. **適切なアクセス間隔**
   - リクエスト間隔: 最低 5秒以上
   - 1回のスクレイピング実行: 最大 1分以内

4. **User-Agent の明示**
   - `JA-Denki-Rate-Fetcher/1.0 (Azure Functions; +https://example.com/policy)`
   - 社内システムであることを明記

---

## 取得対象データ

### Phase B で自動取得予定

| 電力会社 | データ | 形式 | 更新頻度 |
|---------|--------|------|---------|
| JAでんき | 料金メニュー定義書 | PDF | 年1回（4月） |
| JAでんき | 燃料費調整単価 | PDF | 月1回 |
| JAでんき | 再エネ賦課金 | PDF | 月1回 |
| 中国電力 | 料金メニュー定義書 | PDF | 年1回（4月） |
| 中国電力 | 燃料費調整単価 | PDF | 月1回 |
| 中国電力 | 再エネ賦課金 | PDF | 月1回 |

### 取得しない情報

- 個別顧客の使用実績
- 企業機密情報
- 技術詳細仕様
- キャンペーン・割引情報（料金に直結しないもの）

---

## 実装要件（フェーズ7で詳細化）

### 取得元 URL の登録

```json
{
  "sources": [
    {
      "provider": "ja_denki",
      "type": "rate_definition",
      "url": "https://example.com/ja-denki/rate_menu.pdf",
      "schedule": "0 0 1 4 *",
      "user_agent": "JA-Denki-Rate-Fetcher/1.0",
      "robots_txt_checked": true,
      "terms_checked": true,
      "notes": "04月1日に新版公開"
    }
  ]
}
```

### エラーハンドリング

**取得失敗時の動作**:

1. robots.txt エラー → 手入力フォームに自動フォールバック
2. ネットワークエラー → リトライ（最大3回）
3. PDF解析エラー → 手入力フォームに自動フォールバック
4. 値の異常（前月比 ±30% 超） → 承認画面で警告表示

### 差分検算

取得値の自動検証：

```python
# 疑似コード
old_rate = load_previous_rate()
new_rate = scraped_rate

if abs(new_rate - old_rate) > old_rate * 0.3:  # 30% 超の変動
    alert("異常変動を検出: 要確認")
    send_to_approval_screen(old_rate, new_rate)
else:
    auto_approve = True
```

---

## 人間承認プロセス

### 承認画面（管理画面）の要件

**表示項目**:

- [ ] 取得元URL、取得日時
- [ ] 前月値 vs 今月値（横並び）
- [ ] PDFハッシュ値（改ざん検知用）
- [ ] 差分金額（300kWh, 900kWh での見積差）
- [ ] 承認・却下ボタン

**検算プレビュー**:

```
【前月版での試算】
  使用量 300kWh → 月額 ¥7,500
  使用量 900kWh → 月額 ¥21,000

【今月版での試算（案）】
  使用量 300kWh → 月額 ¥7,520（+¥20）
  使用量 900kWh → 月額 ¥21,100（+¥100）
```

### 監査ログ記録

承認・却下・反映時に記録：

```json
{
  "timestamp": "2026-09-01T10:30:00Z",
  "action": "approved",
  "user": "admin@example.com",
  "provider": "ja_denki",
  "type": "fuel_adjustment",
  "old_value": 3.21,
  "new_value": 3.45,
  "pdf_hash": "sha256:abcd1234...",
  "source_url": "https://example.com/...",
  "notes": "承認者コメント"
}
```

---

## ロールバック手順

### 誤った値が反映された場合

1. 管理画面の「履歴」タブから前版を選択
2. 「ロールバック」ボタン押下
3. 確認画面で「実行」
4. 自動デプロイ実行
5. ログに記録

```
ロールバック: ja_denki/fuel_adjustment
  2026-09-01 version から 2026-08-01 version へ
  実行者: admin@example.com
  理由: 数値入力ミス
  完了日時: 2026-09-01 10:35
```

---

## スケジュール・自動実行

### 定期実行スケジュール

```cron
# 月次更新（毎月1日 0:00 UTC）
0 0 1 * * /scripts/fetch_monthly_updates.py

# 年次定義書更新（毎年4月1日）
0 0 1 4 * /scripts/fetch_annual_definitions.py

# 手動トリガー
POST /api/rate-fetch/trigger
```

### 遅延実行の登録

Azure Functions / Scheduled Task での実装：

```python
import schedule
import time
from fetch_rates import fetch_all_rates

def scheduled_job():
    results = fetch_all_rates()
    notify_approval_screen(results)

schedule.every().month.at("00:00").do(scheduled_job)
```

---

## 外部API・統合の管理

### 外部サービスの利用禁止

以下の無料PaaS/APIは使用しない：

- ❌ Google Sheets API（スクレイピング結果の直接保存）
- ❌ Zapier / Make.com（外部での組み合わせ処理）
- ❌ OpenAI / 生成AIでの数値抽出（不正確性）

### 推奨ツール・ライブラリ

- **Python**: requests, playwright, pdfplumber, PyPDF2
- **Node.js**: puppeteer, pdf-parse, cheerio
- **Azure**: Azure Functions (Python), Azure Blob Storage (バージョン管理)

---

## PDFハッシュ値とバージョン管理

### PDF差分の追跡

```
2026-09-01
├── ja_denki_fuel_2026_09.pdf
│   ├── hash: sha256:abc123...
│   ├── extracted_values: [3.45, 2.80, ...]
│   └── approved_by: admin@example.com
│
2026-08-01
├── ja_denki_fuel_2026_08.pdf
│   ├── hash: sha256:def456...
│   └── extracted_values: [3.21, 2.65, ...]
```

### バージョン履歴の保存

Azure Blob Storage または Git LFS での保存：

```bash
# Git での場合
git lfs track "data/pdfs/*.pdf"
git add data/pdfs/ja_denki_fuel_2026_09.pdf
git commit -m "rate-update: ja_denki fuel adjustment 2026-09"
```

---

## トラブルシューティング

### よくあるエラーと対応

| エラー | 原因 | 対応 |
|--------|------|------|
| robots.txt Disallow | ポリシー変更 | 手入力へ自動フォールバック |
| PDF レイアウト変更 | サイト更新 | 手入力へ自動フォールバック、URL確認 |
| 数値の解析失敗 | OCR品質 | pdfplumber パラメータ調整、手入力 |
| 異常な値検出 | 入力ミス | 承認画面で警告、要確認待機 |
| ネットワークタイムアウト | 一時的 | リトライ（指数バックオフ）最大3回 |

---

## セキュリティ・機密情報

### API キー・認証情報

```env
# .env.example
JA_DENKI_RATE_SOURCE_URL=https://example.com/...
CHUGOKU_POWER_RATE_URL=https://example.com/...
AZURE_FUNCTION_KEY=<env のみ、コードに埋め込み厳禁>
```

### ログ出力時の注意

- PDF内容の生テキストをログに出力しない
- 抽出後の数値のみを記録
- 個人情報・機密情報が誤って含まれていないか確認

---

## コンプライアンス確認チェックリスト

実装前・月次更新時に確認：

- [ ] 各社の robots.txt を確認
- [ ] 各社の利用規約を確認（スクレイピング許可）
- [ ] User-Agent に組織情報を明記
- [ ] アクセス間隔を適切に設定（5秒以上）
- [ ] 取得データを個人情報分析に使用していないか
- [ ] PDFハッシュ値を記録（改ざん検知）
- [ ] 差分検算で異常を検知
- [ ] すべての変更を人間承認
- [ ] 監査ログを完全に記録
- [ ] 旧版をロールバック可能に保持

---

**最終更新**: 2026-08-20（ポリシー定義）
**詳細実装予定**: フェーズ7
**関連文書**: DEPLOY.md, SECURITY.md, CLAUDE.md
