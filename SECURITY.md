# セキュリティ・個人情報保護方針 (SECURITY.md)

**最終更新**: 2026-08-21（フェーズ9 セキュリティレビュー）
**関連文書**: CLAUDE.md（ルール7・9）, ASSUMPTIONS.md, DEPLOY.md, SCRAPING_POLICY.md

---

## この文書の約束

**書いてあることは、すべてコードで検査できる状態にしてあります。**
「そうする方針である」ではなく「そうなっていることを CI が確かめている」だけを書きます。
将来やるかもしれないことは末尾の「Phase B」にまとめ、現在の設計と混ぜません。

---

## Phase A の設計（いま動いているもの）

### 一行でいうと

**サーバーを1台も持っていません。** 入力した数字はブラウザのメモリの中だけで計算され、
どこにも送信されず、どこにも保存されません。

```
┌─────────────────────────────┐
│ ブラウザ                    │
│  入力（使用量・契約容量）   │
│  料金マスター（JSに同梱）   │
│  計算エンジン（Decimal.js） │
│  結果表示・印刷             │
└─────────────────────────────┘
        （送信先なし）
```

これは方針ではなく**構造**です。アプリ全体に通信APIも保存APIも1つも存在しません。

### 取り扱うデータ

| データ | 入力 | 置き場所 | 残るか |
|---|---|---|---|
| ご使用量（kWh） | 必須 | ブラウザのメモリ | タブを閉じたら消える |
| 1か月の電気料金（円） | かんたん試算のみ | ブラウザのメモリ | タブを閉じたら消える |
| 契約種別・検針月・契約容量 | 選択 | ブラウザのメモリ | タブを閉じたら消える |
| 検針期間の開始日・終了日 | 時間帯別プランのみ | ブラウザのメモリ | タブを閉じたら消える |

### 取り扱わないデータ

**入力欄がそもそも存在しません。** 氏名・住所・電話番号・メールアドレス・
お客様番号・供給地点特定番号・口座情報。
「入れないよう運用で気をつける」ではなく、入れる場所がありません。
`ComparisonResult.test.tsx` がこれらの語の不在をテストで固定しています。

---

## 検査（CI で毎回走るもの）

### `npm run security:check` — 静的検査

`scripts/securityCheck.ts`。ソース・配布物・Service Worker を見て、
1件でも当たれば CI を落とします。

| 規則 | 見るもの | なぜ |
|---|---|---|
| `no-persistence` | localStorage / sessionStorage / IndexedDB / cookie | 次の利用者に前の人の数字が見えない |
| `no-network` | fetch / XHR / WebSocket / EventSource / sendBeacon | 入力がサーバーに出ない（ルール9） |
| `no-console` | console.* | 入力がログに残らない（ルール7） |
| `no-dynamic-code` | eval / new Function / document.write | XSS の経路を作らない |
| `no-raw-html` | dangerouslySetInnerHTML / innerHTML | 表示は React に任せる |
| `no-env` | import.meta.env / process.env | 設定漏れが本番の挙動を変えない |
| `bundle-clean` | **配布する JS そのもの** | 依存ライブラリが保存API等を持ち込んでいない |
| `no-external-host` | 配布する index.html | 外部ホストを読みに行かない |
| `sw-same-origin` | public/sw.js | 他オリジンへの要求に触らない |

検査そのものが機能することを 24 件のテストで固定しています
（`scripts/securityCheck.test.ts`、カバレッジ 100%）。

### `npm audit --omit=dev --audit-level=low` — 本番依存の脆弱性

配布物に載る依存は **decimal.js / react / react-dom の3つだけ**です。
1件でも勧告が出たら CI を落とします。

開発用の依存（vite・vitest 等）は配布物に入らないため、この関門の対象外です。
現状の未解決は次の1件のみです。

| パッケージ | 深刻度 | 状況 |
|---|---|---|
| exceljs → uuid | moderate | 改定取り込みツール（`npm run rate-intake`）専用。前進する修正版が無く、`exceljs@3.4.0` への降格しか手段がないため据え置き。配布物には入らない |

### `npm run security:runtime` — 実機での検査（リリース前に手元で1回）

静的検査は「書かれていないこと」しか言えません。こちらは実際に Chromium で
全12シナリオ＋かんたん試算を操作し、**起きていないこと**を確かめます。

- 自分のオリジン以外への通信が1本も出ない
- 操作しきったあとも localStorage / sessionStorage / IndexedDB / Cookie が空
- コンソールに入力した数字が出ていない

```bash
npm install --no-save playwright   # 一度だけ
npm run build
npm run security:runtime
```

**2026-08-21 の実行結果**: 12シナリオ＋かんたん試算、外部通信 0本、保存API 0件、
コンソール出力 0行。CI には入れていません（ブラウザの取得が重く、日々の退行は静的検査で止まるため）。

---

## 配布（認証をかけない前提）

**URLを知っている職員が使えること**が配布の条件です。認証をかけない＝公開されます。
守る手段は限られるので、できることは全部やっています。

| 措置 | 実装 |
|---|---|
| 検索に載せない | `index.html` に `noindex, nofollow, noarchive, nosnippet`、`public/robots.txt` で `Disallow: /` |
| リファラを漏らさない | `<meta name="referrer" content="no-referrer">` |
| 誰向けか画面に書く | ヘッダー「JA職員向け」、フッターに但し書き |
| 通信の暗号化 | HTTPS 必須（Service Worker の要件でもある） |

### 配信時に付けるヘッダ（ホスティング側の設定）

検索避けの meta タグには強制力がありません。**サーバー側でも付けてください。**

```
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
```

CSP の `connect-src 'self'` は、**将来うっかり外部へ通信を足しても
ブラウザが止める**ための二重の関門です。`style-src` に `'unsafe-inline'` が要るのは、
金額バーの幅など計算結果に応じた `style` 属性を使っているためです。

⚠️ **ドメインの選び方**: 見慣れないドメインは社内プロキシに弾かれます
（実際に claude.ai が弾かれました）。**JAの既存ドメイン配下**に置くのが安全です。

---

## 画面の切り離し（職員向けと管理者向け）

営業の集計（何件回って何件決まったか、どの反論が多いか）は、**訪問中の職員には
要らない情報**です。実務に要らない画面を職員のアプリに置くと、お客様の前で
開いてしまう事故が起きます。そこでビルドごと分けています。

| | 職員向け | 管理者向け |
|---|---|---|
| URL | `/`（`index.html`） | `/admin.html` |
| エントリ | `src/main.tsx` | `src/admin.tsx` |
| 相互リンク | 無し | 無し |
| Service Worker | キャッシュする | **しない**（プリキャッシュ対象から除外） |
| バンドル | 集計のコードは1バイトも入らない | 試算のコードは入らない |

分離はビルドの構造で担保しています（`apps/web/vite.config.ts` の
`rollupOptions.input` と、Service Worker のプリキャッシュ生成での除外）。
リリース前に次で確かめます。

```bash
# 職員向けのバンドルに集計の文言が入っていないこと（0 であること）
grep -c "いくら安くなると決まるのか" apps/web/dist/assets/index-*.js

# Service Worker が admin を先読みしていないこと（0 であること）
grep -c "admin" apps/web/dist/sw.js
```

### アクセス制限は配信サーバーでかける

**画面の中で判定しても意味がありません。** JavaScript は誰でも読めます。
配信する VM 側で `/admin.html` と `/assets/admin-*.js` の両方に制限を
かけてください。HTML だけ塞いでも、JavaScript を直接読まれれば中身は分かります。

**採用した方式は Basic 認証（合言葉）** です（2026-08-22 決定。手順は
DEPLOY.md「3-5. 管理者向け画面の切り離し」）。共有の合言葉なので
**誰が見たかは残らず、渡した相手を後から取り消せません。**
弱点は設定ではなく運用で埋めます。

| 決めておくこと | 既定 |
|---|---|
| 渡す範囲 | 支店長・企画担当まで |
| 配り方 | 口頭または社内の秘密管理。**メール・チャットに平文で書かない** |
| 変えるとき | 異動・退職のたび。少なくとも半年に1回 |
| 記録 | いつ変えたか・誰に配ったかを1行 |

⚠️ **HTTPS が必須です。** 平文HTTPだと合言葉がそのまま流れます。
80番は中身を返さず301でHTTPSへ送る設定にしてあります。

なお、**制限が外れていても個人情報は漏れません**。この画面は貼られた表を
その場で数えるだけで、送信も保存もしません。表そのものに個人を特定できる
列が入らないことは、書き出し側で機械的に止めています
（`assertNoIdentifyingColumn`、`docs/VISIT_LOG_DESIGN.md`）。
制限をかけるのは、**JAの営業成績が誰でも読める状態にしない**ためです。

---

## リスクと、いま取っている対策

| リスク | 起きること | 対策 |
|---|---|---|
| **古い単価のまま試算し続ける** | 誤った金額をお客様に示す | Service Worker は画面遷移を network-first に。新版検知でバナー。バナーに「閉じる」は付けない |
| **URL が外部に流出する** | 第三者が試算できる | 個人情報が入っていないため被害は限定的。noindex と社内向け表記まで。認証は前提条件により不可 |
| **根拠のない単価が入る** | 全ユーザーの試算が誤る | 単価には出典が必須（型で強制）。改定差分レポートが出典の据え置きを検知。PR レビューで人が承認（ルール10） |
| **XSS** | 画面の改ざん | ユーザー入力は数値と選択肢のみ。テキスト入力欄が無い。React の自動エスケープ。生HTML挿入なし（CIで検査） |
| **依存ライブラリの脆弱性** | 任意コード実行 | 本番依存は3つだけ。CI で `npm audit --omit=dev` を関門化 |
| **集計画面が誰でも読める** | JAの営業成績（件数・決定率）が外部から見える | ビルドを分け、職員向けからリンクしない。配信サーバーで `/admin.html` と `/assets/admin-*.js` に制限（DEPLOY.md 3-5）。個人情報は元から入らない |
| **開発機での vite dev server 経由の攻撃** | 開発者の手元のファイル読み取り | vite 7 / vitest 3 へ更新済み（旧版に High/Critical の勧告あり）。Node は 20/22 LTS |

---

## 元資料の取り扱い（CLAUDE.md ルール3）

Google Drive 上の元資料（試算表 xlsx・料金メニュー定義書 PDF）は
**読み取り専用**です。変更・移動・削除・上書きは厳禁。
リポジトリには **1件も含めていません**（`git ls-files` に xlsx / pdf は 0件）。

回帰テスト用に抽出した数値のみ `packages/calc-core/tests/excel-lookup.fixture.json`
に収録しています。ここに含まれるのは kWh と金額だけで、契約者の情報はありません。

---

## Phase B（まだ実装していない。着手前に承認が要る）

検針票の画像を OCR にかける機能は、**Phase A で唯一「個人情報がブラウザの外に出る」変更**です。
端末内 OCR（Tesseract.js / WebAssembly）ならルール9 を維持できますが、
サーバー OCR を選ぶ場合は次がそろって初めて着手できます。

- [ ] CLAUDE.md ルール9 の改定と承認
- [ ] 委託先との個人データ取扱契約（DPA）
- [ ] プライバシーポリシーの作成と掲示
- [ ] 同意フローの設計（何を送るか・いつ消えるか）
- [ ] 保持期間の定義と、消えたことの確認手段
- [ ] ログのマスキング方針

**法務と契約が、実装と同等かそれ以上のクリティカルパス**になります。
詳細は docs/IMPLEMENTATION_PLAN.md「規模の見積り」を参照。

この文書に Phase B の設計を先に書き込まないでください。
実装されていない対策が書いてある監査文書は、無いより有害です。
