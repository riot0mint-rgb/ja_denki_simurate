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

### 2-2. ロゴの差し替え

画面上部と印刷物のヘッダーに JAでんきのロゴを出せます。

```bash
# 公式のロゴファイルを置くだけ。コード変更は不要
cp <公式ロゴ>.svg apps/web/public/logo.svg   # PNG の場合は logo.png
npm run build
```

- `logo.svg` が無ければ `logo.png` を探し、どちらも無ければ文字の
  「JAでんき料金比較」を出します（画面は壊れません）
- 高さ26pxで表示するため、**横長・背景透過**のファイルが向いています
- ビルド時に有無を判定しています。置いたあとは必ず `npm run build` が必要です
- 置いたロゴは Service Worker のキャッシュ対象に自動で入ります

**ロゴは公式のファイルを使ってください。** 似せて作った画像は使いません。

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
   - 条件: {REQUEST_FILENAME} が「ファイルでない」場合のみ
   ```

   > **条件を必ず付けてください。** 条件なしで全部を `index.html` に
   > 送ると、実在する `admin.html`（管理者向けの集計画面）や
   > `assets/*.js` まで職員向けの画面に化けます。

6. HTTPS 設定
   - SSL 証明書をバインディングに割り当て
   - HTTP → HTTPS リダイレクト設定

7. アクセス確認
   ```
   https://[domain]/ja-denki/
   ```

#### 3-4. オンプレミス VM へのデプロイ（現在の想定構成）

**前提**：
- JA が保有する VM（Linux + nginx、または Windows Server + IIS）
- 職員のスマートフォンから届くネットワーク（社内網 / VPN / 閉域）
- **HTTPS の証明書**（Service Worker の要件であり、かつ 3-5 の合言葉を平文で流さないため）

配るのは `apps/web/dist/` の中身だけです。サーバー側で動くプログラムは
ありません（Phase A はブラウザ内計算のため、アプリのための DB・API・
実行環境はいずれも不要です）。

**手順**：

1. ビルドする
   ```bash
   npm run build -w @ja-denki-simulator/calc-core
   npm run build -w @ja-denki-simulator/web
   ```

2. VM へ配置する
   ```bash
   rsync -av --delete apps/web/dist/ user@vm:/var/www/ja-denki/
   ```

3. 共通ヘッダの断片を作る（`/etc/nginx/snippets/ja-denki-headers.conf`）

   ```bash
   sudo mkdir -p /etc/nginx/snippets
   ```

   ```nginx
   # SECURITY.md「配信時に付けるヘッダ」と同じもの
   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'self'" always;
   add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet" always;
   add_header X-Content-Type-Options nosniff always;
   add_header Referrer-Policy no-referrer always;
   add_header Strict-Transport-Security "max-age=31536000" always;
   add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=()" always;
   ```

   ⚠️ **断片に切り出して、`add_header` を書く location すべてで `include` してください。**
   nginx の `add_header` は「その階層に1つでも `add_header` があれば、上の階層のものを
   引き継がない」仕様です。`location` の中で Cache-Control を足すと、**サーバー階層に
   書いた CSP などが黙って消えます。**

4. nginx の設定（`/etc/nginx/conf.d/ja-denki.conf`）

   ```nginx
   # 平文で来たものは、中身を返さずHTTPSへ送る（合言葉を平文で流さないため）
   server {
     listen 80;
     server_name ja-denki.example.local;
     return 301 https://$host$request_uri;
   }

   server {
     # http2 は 1.25.1 以降なら別行の `http2 on;` に書き換えられます。
     # ディストリの nginx はたいてい 1.20〜1.24 なので、この書き方にしています
     listen 443 ssl http2;
     server_name ja-denki.example.local;

     ssl_certificate     /etc/ssl/certs/ja-denki.crt;
     ssl_certificate_key /etc/ssl/private/ja-denki.key;

     root /var/www/ja-denki;

     include /etc/nginx/snippets/ja-denki-headers.conf;

     # 中身が変わったら必ず取り直させる。古い単価で試算されるのを防ぐ
     location = /index.html {
       include /etc/nginx/snippets/ja-denki-headers.conf;
       add_header Cache-Control "no-cache" always;
     }
     location = /sw.js {
       include /etc/nginx/snippets/ja-denki-headers.conf;
       add_header Cache-Control "no-cache" always;
     }

     # ── 管理者向け（3-5）。ここだけ合言葉が要る ────────────────
     location = /admin.html {
       include /etc/nginx/snippets/ja-denki-headers.conf;
       add_header Cache-Control "no-store" always;
       auth_basic "JA denki kanri";
       auth_basic_user_file /etc/nginx/.htpasswd-admin;
       try_files $uri =404;
     }
     # JavaScript も同じ扱い。HTMLだけ塞いでも中身は読める
     location ~ ^/assets/admin- {
       include /etc/nginx/snippets/ja-denki-headers.conf;
       add_header Cache-Control "no-store" always;
       auth_basic "JA denki kanri";
       auth_basic_user_file /etc/nginx/.htpasswd-admin;
     }
     # ──────────────────────────────────────────────

     # ハッシュ付きの名前なので、中身が変われば別URLになる
     location /assets/ {
       include /etc/nginx/snippets/ja-denki-headers.conf;
       add_header Cache-Control "public, max-age=31536000, immutable" always;
     }

     location / { try_files $uri $uri/ /index.html; }
   }
   ```

   `try_files $uri $uri/ /index.html;` の順番が大事です。実在する
   ファイル（`admin.html`・`assets/*`）を先に返し、無いパスだけ
   `index.html` に落とします。

   `location ~ ^/assets/admin-` は正規表現なので、`location /assets/` より
   **先に**評価されます（nginx の照合順序: `=` → `^~` → 正規表現 → 最長前方一致）。
   管理者向けの JS が、認証なしのキャッシュ設定に吸われることはありません。

5. 反映する
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

**更新のたびに確かめること**：

```bash
# 職員向けの画面に、集計のコードが混ざっていないこと（何も出なければ正常）
grep -l "いくら安くなると決まるのか" /var/www/ja-denki/assets/index-*.js

# Service Worker が admin をキャッシュしていないこと
grep -c "admin" /var/www/ja-denki/sw.js   # 0 であること
```

#### 3-5. 管理者向け画面の切り離し

集計画面（`/admin.html`）は**支店長・企画担当が見るもので、訪問中の職員は
使いません**。実務に要らない画面を職員のアプリに置くと、お客様の前で開いて
しまう事故が起きます。そこでビルドから分けてあります。

| | 職員向け | 管理者向け |
|---|---|---|
| URL | `/`（`index.html`） | `/admin.html` |
| 中身 | 試算・商談ナビ | 営業の集計 |
| 相互リンク | 無し | 無し |
| Service Worker | キャッシュする | **しない**（オフラインで開けない） |
| バンドル | 集計のコードは1バイトも入らない | 試算のコードは入らない |

##### 何から守るのか（先に整理しておく）

ここを取り違えると、要らない厳しさを選んでしまいます。

| 守る対象 | この画面での状況 |
|---|---|
| **個人情報** | **もともと入りません。** 貼る表に個人を特定できる列が作れない（`assertNoIdentifyingColumn`）。制限が外れても漏れるものがない |
| **JAの営業成績** | **これを守ります。** 何件回って何件決まったか、どの支店が弱いかは、外に出したくない経営情報 |
| **単価・料金の正しさ** | 無関係。この画面は計算をしません |

つまり **「個人情報保護のための認証」ではなく「経営情報を社外に出さないための仕切り」** です。
だから「職員一人ひとりのIDで認証し、誰がいつ見たかを記録する」ところまでは要りません。
**社外から見えなければ目的は足ります。**

##### ✅ 採用：Basic 認証（合言葉）— 2026-08-22 決定

検討した3案は次のとおりです。**Basic 認証で進めます。**

| | 1. 社内IdP / SSO | 2. 接続元IPの制限 | **3. Basic認証（採用）** |
|---|---|---|---|
| 何で判定するか | 誰か（職員ID） | どこからか（LANのIP） | 合言葉（ID+パスワード） |
| 要る前提 | AD / Entra ID と情シスの工数 | 拠点が固定IPで、そこからしか見ない | **なし** |
| 在宅・出張から | 見られる | 見られない | **見られる** |
| 見た記録 | 残る | 残らない | 残らない（ID共有） |
| **弱点** | — | 拠点追加で広げすぎる | **合言葉が人づてに広まる。異動しても消えない** |

**Basic 認証の弱点は、設定ではなく運用でしか埋まりません。** 下の
「合言葉の運用ルール」を決めないまま始めると、半年後には誰でも見られる
状態になっていて、しかも**誰も気づきません**。ここだけは省略しないでください。

##### 設定手順

**① パスワードファイルを作る**

```bash
# ツールが無ければ入れる
sudo apt install apache2-utils     # Debian / Ubuntu
sudo dnf install httpd-tools       # RHEL / Rocky / AlmaLinux

# 作成（-B = bcrypt。-c は初回のみ。2人目以降は -c を付けない＝上書きされる）
sudo htpasswd -B -c /etc/nginx/.htpasswd-admin kikaku

# nginx だけが読める状態にする
sudo chown root:nginx /etc/nginx/.htpasswd-admin   # Debian系は root:www-data
sudo chmod 640 /etc/nginx/.htpasswd-admin
```

`htpasswd` をどうしても入れられない場合は openssl でも作れます。
ただし `-apr1` は bcrypt より弱いので、可能なら `htpasswd -B` を使ってください。

```bash
printf 'kikaku:%s\n' "$(openssl passwd -apr1)" | sudo tee /etc/nginx/.htpasswd-admin
```

⚠️ **パスワードファイルを nginx が読めないと、合言葉が正しくても 500 になります。**
（合言葉なしの 401 は正しく出るので、「塞げている」と誤認しやすい失敗です。）
所有者とパーミッションを必ず確認してください。

利用者名（上の例の `kikaku`）は**役割の名前**にしてください。個人名にすると、
異動のたびに作り直しが必要になります（そして誰もやりません）。

**② パスワードを決める**

サーバー上で作って、その場で控えます。**人が考えた文字列は使わないでください。**

```bash
# 単語をつなぐ形。口頭で伝えられて、かつ十分に長い
tr -dc 'a-z' </dev/urandom | fold -w 5 | head -n 4 | paste -sd- -
# 例: kotra-mesbi-untal-rewof
```

**③ nginx に組み込む**

3-4 の設定例に、既に `auth_basic` の2ブロックが入っています。
そのまま使う場合は追加の作業はありません。既存の設定に足す場合は、
`location = /admin.html` と `location ~ ^/assets/admin-` の**両方**に
次の2行を入れてください。

```nginx
auth_basic "JA denki kanri";
auth_basic_user_file /etc/nginx/.htpasswd-admin;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**④ IIS の場合**

`admin.html` と `assets/admin-*.js` を別のアプリケーションに切り出し、
「認証」→ **基本認証**を有効、匿名認証を無効にします。
Windows アカウントと紐づくため、共有アカウントを1つ作るか、
可能であれば**Windows 認証**（案1相当）に切り替えるほうが運用は楽です。

⚠️ 3-3 の URL Rewrite 規則に「実在するファイルでないとき」の条件が
付いていることを必ず確認してください。条件が無いと `/admin.html` への要求が
`index.html` に化け、**制限をかけたつもりの画面が職員向けの画面として開きます**。

##### 設定できたことの確認

**社内LANの外**（スマートフォンのモバイル回線など）から実行します。

```bash
# 1. 職員向けは合言葉なしで開ける（200 であること）
curl -o /dev/null -s -w "%{http_code}\n" https://<ホスト>/

# 2. 管理者向けは合言葉なしでは開けない（401 であること。200 なら失敗）
curl -o /dev/null -s -w "%{http_code}\n" https://<ホスト>/admin.html

# 3. JavaScript も開けない（401 であること）★これを飛ばさない
grep -o 'assets/admin-[^"]*\.js' apps/web/dist/admin.html
curl -o /dev/null -s -w "%{http_code}\n" https://<ホスト>/assets/admin-XXXX.js

# 4. 合言葉を入れれば開ける（200 であること。-u は利用者名だけ書いて対話入力する）
curl -o /dev/null -s -w "%{http_code}\n" -u kikaku https://<ホスト>/admin.html

# 5. 平文HTTPは中身を返さずHTTPSへ送られる（301 であること）
#    ここが 200 だと、合言葉が平文で流れます
curl -o /dev/null -s -w "%{http_code} %{redirect_url}\n" http://<ホスト>/admin.html
```

**3 を飛ばさないでください。** HTML だけ塞いで JavaScript が素通しなのが、
この手の設定でいちばん多い失敗です。集計の画面はほぼ全部が JavaScript の中にあります。

> 上の設定例は、実際に nginx 1.24 で `nginx -t` を通し、ビルド済みの `dist/` を
> 配って動かして確認済みです（2026-08-22）。確認した結果:
> 職員向け 200 ／ 管理者向け 401 ／ `assets/admin-*.js` 401 ／
> 合言葉ありで 200 ／ 平文HTTP 301 ／ 存在しないパスは `index.html` に戻る。
> ブラウザでも、合言葉なしでは管理者向けの画面が開かず、
> 合言葉ありなら集計が動くことを確認しています。
> CSP などのヘッダが全ての location で消えていないことも確認しました。

⚠️ `curl -u kikaku:パスワード` のように**コマンドラインに直接書かないでください**。
シェルの履歴に残ります。上のように利用者名だけ書けば、curl が対話で聞いてきます。

##### 合言葉の運用ルール（ここを決めてから始める）

Basic 認証は**共有の合言葉**です。誰が見たかは残らず、渡した相手を後から
取り消すこともできません。だから次を先に決めてください。

- [ ] **管理者を1人決める**（合言葉を作る人・配る人・変える人）
- [ ] **配り方**：口頭、または社内の秘密管理の仕組み。
      **メール・チャットに平文で書かない**（転送されたら終わりです）
- [ ] **渡す範囲**：支店長と企画担当まで。「見たい」と言われて足さない
- [ ] **変えるとき**：
      - 渡した人が異動・退職したとき（**必ず**。共有パスワードは変えない限り消えません）
      - 少なくとも**半年に1回**
      - 「誰かに教えたかもしれない」と思ったとき
- [ ] **変更の記録**：いつ変えたか・誰に配ったかを1行残す（名簿と同じ場所で構いません）
- [ ] **共用PCで開いたら、ブラウザを閉じる**。Basic 認証はタブを閉じただけでは
      合言葉が残ります（画面自体は `Cache-Control: no-store` でディスクに残しません）

⚠️ **合言葉が広まった疑いがあれば、その日のうちに変えてください。**
`sudo htpasswd -B /etc/nginx/.htpasswd-admin kikaku` で上書きし、
`sudo systemctl reload nginx` で即座に効きます（`-c` は付けない）。

##### 制限をかけても、置いてよいものは変わりません

この画面に貼るのは `docs/VISIT_LOG_DESIGN.md` の列だけです。
氏名・住所・電話番号を足した表を貼ってはいけません
（貼っても送信はされませんが、画面に映ります）。

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
- 商談ナビの使い方（準備→導入→おうかがい→試算→説明→ご不安→お手続き→ふりかえり）
- **「訪問はご遠慮したい」と言われたときの手順** →
  [docs/VISIT_REFUSAL_PROCEDURE.md](./docs/VISIT_REFUSAL_PROCEDURE.md)
  （**配属時に必ず1回読ませてください。**取りこぼしがJA全体の信用に響きます）

**支店で訪問先を割り当てる担当向け**:
- リストを配る前に「訪問不可」を除外する（同上の手順書「4. 訪問先を割り当てるとき」）
- 月に一度、訪問不可の件数と実際の訪問を突き合わせる

**システム管理者向け**:
- 月次更新（燃料費調整・再エネ賦課金）
- 料金改定時の対応
- `/admin.html` の Basic 認証の維持（3-5。**異動・退職のたびに合言葉を変える**）
- エラーログの確認

**開発チーム向け**:
- calc-core の更新手順
- テストの実行方法
- CI/CD パイプラインの確認

---

## リリース前チェックリスト（フェーズ9で確定）

### 1. コマンドで確かめる

```bash
npm ci
npm install --no-save playwright        # 8・9 に必要（初回のみ）

npm run test:coverage                   # 1. テスト795件とカバレッジ閾値
npm run type-check                      # 2. 型
npm run rate-master:check               # 3. 料金マスターJSONの同期
npm run rate-intake                     # 4. 元資料との突合（archive/ がある場合）
npm run build                           # 5. ビルド
npm run security:check                  # 6. 端末の外に出る経路が無いこと（静的）
npm audit --omit=dev --audit-level=low  # 7. 本番依存の脆弱性
npm run security:runtime                # 8. 実機で外部通信・保存が無いこと
npm run accept                          # 9. 受け入れテスト43項目
```

1〜7 は CI でも毎回走ります。**8・9 はリリース前に手元で1回**（ブラウザの取得が重いため）。

### 2. 人が確かめる

`docs/ACCEPTANCE_TEST.md` の第2部を業務担当が実施してください。
**実際の検針票との突合**が最重要項目です。

配ったあとの動作確認だけなら `docs/SMOKE_TEST.md`（15〜20分・検針票不要）を
使ってください。決まった数字を入れて決まった数字が出るかを確かめるシートです。

### 3. 配信時のヘッダ（ホスティング側で設定）

認証をかけない配布なので、サーバー側の設定まで含めて初めて成立します。

```
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
```

- `connect-src 'self'` は、**将来うっかり外部通信を足してもブラウザが止める**二重の関門
- `style-src` の `'unsafe-inline'` は、金額バーの幅など計算結果に応じた `style` 属性のため
- HTML の `<meta name="robots">` には強制力がないので、`X-Robots-Tag` を必ず付けること

### 4. ドメインの選び方

⚠️ **見慣れないドメインは社内プロキシに弾かれます**（実際に claude.ai が弾かれました）。
**JAの既存ドメイン配下**に置くのが最も安全です。`github.io` は公開かつ弾かれる可能性があります。

HTTPS は必須です（Service Worker の要件。オフライン動作と更新バナーが死にます）。

### 5. ローンチ前に片付いている必要があること

- [ ] 2026年10月・11月分の燃料費調整額の収録
- [ ] JA側と中国電力側で燃調が分かれるかの確認（10月改定で基準が変わるため）
- [ ] ファミリータイムⅠ/Ⅱ の0kWh半額ルールの確認
- [x] 配布先（ホスティング）の決定 — **JA保有のオンプレミス VM**（3-4）
- [ ] 上記ヘッダの設定
- [ ] **`/admin.html` と `/assets/admin-*.js` に Basic 認証**（3-5）。
      社内LANの外から `curl` で 401 になることを確認するところまで
- [ ] 合言葉の管理者・配り方・変更周期の決定（3-5「合言葉の運用ルール」）
- [ ] 「訪問はご遠慮したい」の手順を支店へ周知
      （[docs/VISIT_REFUSAL_PROCEDURE.md](./docs/VISIT_REFUSAL_PROCEDURE.md)）

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
