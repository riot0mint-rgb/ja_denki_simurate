# 引き継ぎ書 (HANDOFF.md)

**最終更新**: 2026-10-14 / ブランチ `claude/intelligent-wright-45bodd`

セッションが切り替わった場合、まずこのファイルと `ASSUMPTIONS.md` を読むこと。
`CLAUDE.md` の非交渉ルール10項目は常に優先される。

---

## 0. ブランチ・PRの状態（2026-10-14時点）

PR #8（`claude/ja-denki-comparison-simulator-mewi5f`）は `main` にマージ済み。
2026-10-14 の作業は `main` から切った **`claude/intelligent-wright-45bodd`** で行い、
新しいPRとして出している。マージ済みのブランチへは積み増さないこと（次回も `main` から切る）。

```bash
git fetch origin main
git checkout -B <新しいブランチ名> origin/main
```

---

## 1. 現在地

JAでんき料金比較シミュレータ（Web版・Phase A）＋**商談ナビ**（営業支援）。
フェーズ0〜9が完了し、フェーズ10（ローンチ）に着手済み。

- テスト **全通過**（calc-core 347 / web 約510 / scripts 140、2026-10-14 再実行）
- カバレッジ: calc-core **100%** / Web UI 約98% / scripts **100%**（CIが閾値を強制）
- 受け入れテスト `npm run accept` **56/56 合格**（2026-10-14 再実行）
- **比較シナリオ15件**（2026-10-14 に動力コース・スマートBコース・auでんき低圧電力を追加。
  ファミリー/時間帯別電灯からは契約容量に応じて 従量電灯A/S/B とも比べる）
- **中国電力 2026年11月1日改定（託送料金見直し・値上げ）を反映**（12月検針分から。11月検針分は日割りのため計算不可）
- **JAでんきの託送料金改定（11月以降・新単価未公表）は「計算不可」で止めている**（下記「次にやること」）
- **燃料費調整額の自動取得（フェーズ6-b）が完成**。中国電力 2026-11 分・auでんき 2026-10 分まで収録
- 料金マスターの正本は TypeScript。`data/rate_master.json` はそこからの生成物

### ⚠️ 本セッションでの作業ミスと教訓（重要）

本セッションの前半で「`npm run type-check` が失敗している」と誤診断し、
`ManualInput.test.tsx` の `vi.fn<Complete>()` を `vi.fn<Parameters<Complete>, ReturnType<Complete>>()`
に「修正」してコミット・pushしてしまった（PR #8 の最初のコミット）。

**原因はこのセッションのローカル `node_modules` が古い vitest（1.6.1）のままだったこと。**
`package.json` / `package-lock.json` は `vitest ^3.2.7` を指定しており、CIはそちらで動く。
vitest 1.x の `fn<TArgs extends any[], R>()` と vitest 3.x の `fn<T extends Procedure>()`
（`Procedure = (...args:any[]) => any`）はジェネリクスの取り方が違うため、**ローカルでは
「正しいコード」がエラーに見え、逆に「壊すコード」がローカルでは通ってしまった。**
CIのビルドログで実際の失敗（vitest 3.2.7 での型エラー）を見て気づき、`npm ci` で
依存関係をlockfileどおりに揃え直してから、元の `vi.fn<Complete>()` に戻して解決した
（=最初から壊れていなかった）。

**教訓**: ローカルの `node_modules` は `.gitignore` 対象で、VMが作り直されると消える一方、
セッションを長く使い続けると `npm install` のタイミング次第で package.json との間に
ズレが生じうる。**「型チェックが通らない」「テストが妙な形で落ちる」ときは、まず
`npm ci` で lockfile どおりに入れ直してから原因を切り分けること。** 特に依存の
バージョンをまたぐような挙動差（今回のように同名APIのジェネリクスの取り方が
メジャーバージョンで変わる、等）は、ローカルの古い install では絶対に再現できない。

なお `packages/calc-core/dist/` もビルド成果物で `.gitignore` 済み。ブランチを
作り直した直後などは `npm run build -w @ja-denki-simulator/calc-core` を打たずに
`apps/web` のテストを走らせると `estimateUsageFromBill is not a function` のような
分かりにくいエラーになる。まず `npm run build`（calc-core→web の順）を通すこと。

## 2. 次にやること（最優先）

- [ ] **JAでんきの託送料金改定後の単価を入手して取り込む**（最優先）。全農エネルギーが
      2026-10-09 に「令和8年11月以降に改定、内容は需要家ポータルサイトで告知」と公表したが、
      単価も適用基準（検針日基準／ご使用分基準）も未公表。それまで **JAでんきが絡む比較は
      2026年11月検針分以降すべて計算不可**（`rates.ts` の `UNPUBLISHED_REVISIONS`）。
      取り込み手順: 新単価を `PLAN_REVISIONS` に足す → `UNPUBLISHED_REVISIONS` から外す →
      ご使用分基準なら11月検針分を `PRORATED_PERIODS` 相当で止める → auでんき側に改定が出ていないか確認
- [ ] **中国電力の11月検針分（日割り）を計算できるようにするか判断**。料金表 附則2・別表1の
      日割り（電力量区分の境目も日割り）を実装するには検針期間の日付入力が要る。現状は計算不可
- [ ] フェーズ6-b の自動取得を `workflow_dispatch` で1回手動実行して、GitHub Actions 上で
      取得が通ることを確認する（ローカルでは実ページで動作確認済み。CIランナーからは未実行）
- [ ] 電力取引報の月の区切り（検針月か使用月か）を確認する。2つの統計で9月の値がずれている
      （`ASSUMPTIONS.md`「1年ぶんの試算に使う『季節ごとの使われ方』」⚠️1）。月次で更新される統計なので、
      新しい年度が出たら `demandProfile.ts` の元データに足して直近3年度に更新する
- [ ] フェーズ10-b（WEB申し込み手続きへの接続）は申し込みページURLの提示待ち
- [ ] `/admin.html` と `/assets/admin-*.js` への **Basic認証の設定**（DEPLOY.md「3-5」）
- [ ] **合言葉（Basic認証パスワード）の管理者・配り方・変更周期の決定**（DEPLOY.md 3-5）
- [ ] **「訪問はご遠慮したい」の手順を支店へ周知**（`docs/VISIT_REFUSAL_PROCEDURE.md`）
- [ ] **記録の運用周知**: 商談記録は端末に保存されない。支店に戻ったらまず「まとめてコピー」
- [ ] 確度の重み・季節の指数・1年見積もりの既定値は仮説のまま。実績が各20件を超えたら見直す

### ネットワークの状態（2026-10-14）

本セッションでは `energia.co.jp`・`au.com`・`zennoh-energy.co.jp` に接続できた
（`enecho.meti.go.jp` は 403）。遮断されている場合は Google Drive 経由（ユーザーにPDF/xlsxを
置いてもらう）か、セッションを作り直して再確認する。
なお Node の `fetch` はサンドボックスのプロキシを自動では使わない。
ローカルで `npm run fetch-monthly-rates` を試すときは `NODE_USE_ENV_PROXY=1` を付ける（CIでは不要）。

### 改定が来たときの手順

```bash
npm run rate-intake -- juryoA=./新しい①.xlsx tou=./新しい③.xlsx ...
```

`rates.ts` の `DOC` キー（`juryoA`/`juryoB`/`tou`/`family`/`lowVoltage`/`midnightB`/`auM`/`auLow`）
ごとに新しいxlsxを渡すと、現在の実装値との突き合わせレポートが出る。**自動では書き換えない**
（rates.ts / monthlyRates.ts への反映は人が行う。CLAUDE.mdルール10）。詳細は `docs/PHASE_6_DESIGN.md`。

不一致があれば `rates.ts` を直し、`npm run rate-master:generate` → `npm test` →
`npm run rate-master:diff` の順に回して差分レポートをPR本文に貼る。

### 燃料費調整額の自動取得（フェーズ6-b）— 2026-10-14 完成

**ここだけはCLAUDE.mdルール10の例外で、取得から本番反映まで無人**（プロジェクト管理者承認）。

- `scripts/monthlyRatesParse.ts` — 取得元ページの解析（純粋関数・カバレッジ100%）。
  中国電力「燃料費等調整単価一覧」・auでんき「燃料費調整単価」・中国電力の賦課金お知らせ。
  実ページの抜粋を `scripts/fixtures/monthly-rates/` に保存しテストで固定
- `scripts/fetch-monthly-rates.ts` — 取得→突き合わせ→追記のCLI
- `scripts/monthlyRatesDiff.ts` / `monthlyRatesInsert.ts` — 新規追加・食い違い（conflict）の分類と追記
- `.github/workflows/monthly-rate-fetch.yml` — 月4回。品質ゲートが全部緑のときだけ `main` へ push

**止まる条件（人に回る）**: ページ構造の変化／既存の年月と値が違う／中国電力の自由料金と
規制料金の表が違う／15kWh超と「左記以外」の単価が違う（＝燃調テーブルを分ける必要がある）。

**月を直書きしたテストを書かないこと。** 自動取得で最新月が進むたびに品質ゲートが赤くなり、
反映が止まる（2026-10-14 に `comparator.test.ts` などを直した）。

---

## 3. 実装済みの内容

### 対応シナリオ（比較15パターン + かんたん試算という別入口）

| 現在のご契約 | 乗り換え先 | 計算構造 | 元資料 |
|---|---|---|---|
| 中国電力 従量電灯A | JA従量電灯A / S | tiered_minimum | ① |
| 中国電力 スマートコース | JA従量電灯A / S | tiered_minimum | ① |
| 中国電力 シンプルコース | JA従量電灯A / S | flat_rate | ① |
| 中国電力 従量電灯B | JA従量電灯B | capacity_tiered | ② |
| 中国電力 低圧電力 | JA低圧電力 | demand_seasonal | ⑤ |
| 中国電力 電化Style | JA夜トクプラン | time_of_use | ③ |
| 中国電力 ナイトホリデー | JA夜トクプラン | time_of_use（最低月額料金型） | ③ |
| 中国電力 深夜電力B | JA夜トクプラン | demand_flat | ⑥ |
| 中国電力 ファミリータイムⅠ/Ⅱ | JA夜トクプラン | family_time | ④ |
| 中国電力 時間帯別電灯 | JA夜トクプラン | economy_night | ④ |
| auでんき Mプラン | JA従量電灯A / S | tiered_minimum（切り上げ丸め） | au |
| 中国電力 動力コース（2026-10-14追加） | JA低圧電力 | demand_seasonal | 中国電力 単価表 |
| 中国電力 スマートBコース（同） | JA従量電灯B | capacity_tiered | 中国電力 単価表 |
| auでんき 低圧電力（同） | JA低圧電力 | demand_seasonal（合計で1回切り捨て） | ☆au低圧 |

ファミリータイムⅠ/Ⅱ・時間帯別電灯は、夜トクプランに加えて**契約容量に応じて**
従量電灯A・S（6kVA未満）または従量電灯B（6kVA以上50kVA未満）とも比べる
（`contractDependentCandidates`。時間帯の振替は通さず入力の合計kWhで計算）。

**単価の版と適用開始**: `rates.ts` の `PRICE_TERMS`（事業者ごとの版と、画面に出す言い方）。出典の `effectiveFrom` は
試算表の月（「26年7月適用」）ではなく実際の施行日。版を足したら `PLAN_REVISIONS` の切替月とそろえる
（テストが検知する）。先頭の版より前の検針月は試算しない（`rateAvailability`）。

**単価の改定**: `rates.ts` の `PLAN_REVISIONS`（検針月で切替）・`UNPUBLISHED_REVISIONS`
（改定公表済みで新単価が未入手→計算不可）・`PRORATED_PERIODS`（日割りになる検針月→計算不可）。
検針月の選択肢と既定月（`DEFAULT_RATE_PERIOD`＝全シナリオで計算できる最新月）はこれを見て決まる。

**検針票が無い場合**は「かんたん試算」（`SimpleInput.tsx`）で、1か月の電気料金から
`inverseUsage.ts` が使用量を逆算する（近似式ではなく実際の計算式の二分探索）。
時間帯別プランは対象外。

**1年ぶんの見積もり方**は「毎月おなじ」（既定・統計を挟まない）と「季節で変わる」を切り替えられる。
「季節で変わる」の指数は契約の種類ごとに3本（電灯／低圧電力＝電力取引報、オール電化＝環境省調査。
深夜電力Bは統計が無く選べない）。時間帯別・季節別のプランも、月ごとの燃調で12か月積み上げる。
昼・夜・休日の割合は入力の月のまま動かさず、夏季／その他季と夜トクへの振り替えの休日日数だけ
月ごとに数え直す（`annualUsage.ts`。毎月の検針日 `UsageInput.readingDay` を使う）。
詳細と限界は `ASSUMPTIONS.md`「1年ぶんの試算に使う『季節ごとの使われ方』」。

### 構成

```
packages/calc-core/src/
  models.ts            プラン型（8構造）・UsageInput・MonthlyBill
  calculator.ts        全構造の計算。元資料のセル番地をコメントに明記
  comparator.ts        比較・削減額・セット割・初年度割引
  monthlyRates.ts       燃調・賦課金のlookup関数・DEFAULT_PERIODの自動算出
  monthlyRatesData.ts   燃調・賦課金の生データ本体（フェーズ6-bが機械的に追記）
  touAllocation.ts     ファミリー/時間帯別 → 夜トク の時間帯振替（推定を含む）
  japaneseHolidays.ts  検針期間から日数・土日・祝日を算出
  rounding.ts          円未満の切り捨て/切り上げ（Excel ROUNDDOWN/ROUNDUP 準拠）
  explain.ts            「差が出ている理由」の内訳生成（フェーズ8。生成AI不使用）
  inverseUsage.ts       電気料金→使用量の逆算（かんたん試算。二分探索）
  demandProfile.ts      季節指数の型・年度ごとの実績から指数を作る関数（出典必須）
  meterCalendar.ts      毎月の検針日から各月の検針期間・土日祝日・夏季の割合を作る
  annualUsage.ts        検針票の1か月から、ほかの月の使用量を組み立てる（形式ごと）
apps/web/
  index.html / admin.html   職員向け／管理者向けでエントリを分離（Vite多エントリ）
  public/sw.js         Service Worker（admin系は先読みしない）
  src/data/rates.ts    ★正本: 全プランの単価＋出典＋シナリオ定義＋PLAN_REVISIONS（改定前後）
  src/data/playbook.ts     商談ナビの台本（生成AI不使用。ヒアリング・反論対応など）
  src/data/switching.ts    「なぜ安くなるのか」を仕組みから説明するデータ
  src/data/demandProfile.ts  季節指数の元データ（電力取引報・環境省調査）と3プロファイル
  src/services/calculateService.ts シナリオ解決・使用量の振替・表示用整形・かんたん試算
  src/services/coachService.ts     商談ナビの段階遷移（生成AI不使用の純粋関数）
  src/services/confidence.ts       商談の確度判定・再訪の口実（重みは仮説として運用）
  src/services/estimateTalk.ts     試算結果をそのまま声に出せる言葉に変換
  src/services/visitLog.ts         商談記録（端末非保存・個人特定不可を型と検査で担保）
  src/pages/ManualInput.tsx        検針票からの入力フォーム
  src/pages/SimpleInput.tsx        かんたん試算（電気料金から逆算）
  src/pages/ComparisonResult.tsx   結果表示・PDF保存・「差が出ている理由」
  src/pages/SalesCoach.tsx         商談ナビ本体（8段階）
  src/pages/SalesInsights.tsx      集計画面（貼られた記録をその場で集計。保存しない）
  src/pages/AdminApp.tsx / admin.tsx   管理者向けエントリ（職員向けバンドルと分離）
scripts/
  generate-rate-master.ts  正本 → data/rate_master.json
  rateMasterDiff.ts / rate-master-diff.ts   改定差分（純粋関数＋CLI）
  rateIntake.ts / rate-intake.ts            新しい試算表との突き合わせ（純粋関数＋CLI）
  monthlyRatesDiff.ts / monthlyRatesInsert.ts  燃調・賦課金の自動取得（フェーズ6-b。純粋関数）
  fetch-monthly-rates.ts                       同CLI（取得元の解析ロジックは未実装）
  security-check.ts / security-runtime.mjs  静的検査（CI関門）／実機検査（リリース前）
  acceptance.mjs                            受け入れテスト（本物のブラウザ・HTTP・SW込み）
  cliArgs.ts                                 上記CLI群の引数パース（純粋関数）
```

### 商談ナビ・管理者向け画面のポイント（変更前に必ず確認すること）

- **生成AIは使わない。** フェーズ8（説明生成）と同じ理由（アカウント不要の静的配布に
  APIキーを置けない）に加え、営業現場で読み上げる言葉は人がレビューできる必要がある。
  `playbook.ts` の台本と `coachService.ts` の遷移は決定論的な純粋関数。
- **押し売りに倒れない仕掛けが複数入っている**: 高くなる試算では説明・手続きに進ませない
  (`shouldStandDown`)。「今日は決まらない」反論が出たら手続きを飛ばして「ふりかえり」へ。
  「訪問はご遠慮したい」は無条件で確度E、再訪の口実を出さない。
- **商談記録は個人を特定できない構造**: `assertNoIdentifyingColumn` が書き出し時に列名を検査。
  時刻・正確な使用量は持たない（帯にする）。端末には保存しない（画面を閉じると消える）。
  持たせたい記録はJAが既に持つ名簿へ人が転記する（`docs/VISIT_LOG_DESIGN.md`）。
- **職員向けと管理者向けはビルドごと分離**。集計コードは職員側バンドルに1バイトも入らず、
  Service Workerも管理者向けを先読みしない。分離が壊れると `security:check` のCIが落ちる
  （`admin-separated` / `admin-not-precached` 規則）。
- **アクセス制限は配信サーバー側でかける**（画面内の判定はJSが誰でも読めるため無意味）。
  採用方式は Basic認証。詳細は DEPLOY.md「3-5」。

### よく使うコマンド

```bash
npm run build                 # calc-core → web の順にビルド（calc-coreのdistは.gitignore済み、必ず先に）
npm test                      # 全ワークスペースのテスト
npm run test:coverage         # 閾値つき（CIと同じ）
npm run type-check
npm run rate-master:generate  # 正本から料金マスターJSONを書き出す
npm run rate-master:check     # 正本とズレていないか（CIで実行）
npm run rate-master:diff      # 改定差分レポート（PR本文用）
npm run rate-intake -- juryoA=./新しい①.xlsx   # 新しい試算表と現在値の突き合わせ
npm run security:check        # 静的検査（CIで実行。個人情報が外に出る経路がないか）
npm run security:runtime      # 実機での検査（リリース前に手元で1回。要ローカルサーバー）
npm run fetch-monthly-rates   # 燃調・賦課金の自動取得（フェーズ6-b。ローカルでは NODE_USE_ENV_PROXY=1 を付ける）
npm run accept                # 受け入れテスト（本物のブラウザ・HTTP・Service Worker込み）
```

### 設計上の判断（変更する前に理由を確認すること）

- **推奨プランは定数で持たない**。217kWh分岐は営業資料の記載どおりだが、
  単価改定で動くため実際の算出額を比較して安い方を選ぶ。
- **燃調・賦課金は月次テーブル**。1か月分を定数で持つと改定のたびに乖離する。
  未収録の月は `null` を返し推測しない。
- **最低料金は「最初の15kWhを含む定額」**。基本料金の代替ではない。
  従量料金は15kWh超から始まる（過去に二重計上のバグがあった）。
- **端数は円未満切り捨て**（四捨五入ではない）。賦課金を先に切り捨ててから
  合計し、合計でもう一度切り捨てる二段構成。auでんきのみ従量料金と燃調を切り上げ。
  ナイトホリデー／シンプルコースの最低月額料金は **1,844円**（1,845円ではない。約款確認済み）。
- **入力検証は必ず通す**。NaN・負値は `unsupported` を返す（ルール8）。
- **料金マスターの正本は TypeScript**。JSON にすると出典の欠落を型で防げない（ルール4）。
  `data/rate_master.json` は生成物で、手で編集しても計算には反映されない。
- **改定前の単価も残す**（`rates.ts` の `PLAN_REVISIONS` / `planForPeriod()`）。
  検針月に応じて旧単価・新単価を切り替える。過去月の試算をやり直したときに
  当時の請求額を再現できなくなるため、上書きしない。
- **Service Worker は画面遷移を network-first**。料金アプリで最悪なのは古い単価で
  試算し続けること。新版は自動で当てず、バナーで利用者に選ばせる（入力途中の消失を防ぐ）。
- **PDF は印刷CSSのみ**。ライブラリを足していない。`.print-hide` / `.print-only` で出し分ける。
- **安くならない結果も出す**（営業判断）。高い・同額をそのまま表示し、
  高いプランには `★推奨` を付けない。
- **ガスセット割はあり／なしを選ぶ**（営業判断）。既定は**なし**。チェックボックスの
  「入れ忘れ」と「なしと判断した」を画面上で区別するため。

---

## 4. 未解決・確認待ち（料金計算まわり）

### ✅ 解決: ナイトホリデーの基本料金・最低月額料金の請求額

**ナイトホリデーコースに基本料金は存在しない。** 中国電力の公式単価表でも
シンプルコースと同じ最低月額料金型（1,844.70円/契約）と定義されている。
下回ったときの請求額は**1,844円**（円未満切り捨て。約款で確認済み。①明細の数式が
書いていた1,845円は不採用）。

### ✅ 解決: 従量電灯S の52点1円差

**本実装（Decimalの厳密値を切り捨て）が約款どおりで正しい。** Excelの52点は
表計算側の浮動小数点誤差。電気需給約款（低圧家庭用）3.(5)で
「合計金額の端数は切り捨て」のみが規定されており、「合計が整数のとき1円引く」ような
規定は無いことをJAへの確認で決着した。同じ条項で消費税の課税箇所も確定
（単価はすべて税込で定義されている）。

### ✅ 解決: 燃調の基準は分かれない（2026-09-07・プロジェクト管理者確認）

2026年10月改定で、JAでんきの燃料費調整相当額の定義が「旧一般電気事業者の
経過措置料金（規制料金）」から「電気サービス約款（自由料金）」基準に変わり、
平均燃料価格の上限（120,500円/kℓ）も廃止された。以前は「JAでんき側と中国電力側で
燃調単価が食い違う可能性がある」と未確認扱いにしていたが、**分かれないことを
プロジェクト管理者に確認した。** 中国エリアの燃調テーブル1本をJAでんき側・
中国電力側の両方に当てる現在の実装のままでよい。

### ✅ 解決: 時間帯別電灯・ファミリータイムⅠ/Ⅱ とも0kWh半額ルールを適用

中国電力の公式シミュレーション結果を2件もらい、時間帯別電灯（エコノミーナイト）は
回帰テストに固定した。この過程で「使用量0kWhの月は基本料金半額」の分岐漏れ
（JAでんきに有利に出る方向のずれ）が1件見つかり修正済み。

**ファミリータイムⅠ/Ⅱ にも同じ半額ルールが適用されることをプロジェクト管理者に
確認した（2026-09-07）。** `FamilyTimePlan.halveBaseWhenNoUsage` を追加し、
`calculator.ts` の `familyTime()` にエコノミーナイトと同型の半額計算を実装、
`chugokuFamilyTime1`/`2` の両方で `true` に設定済み。回帰テストは
`familyTime.test.ts`「使用量が0kWhの月は基本料金が半額」で固定。

### ✅ 解決（営業判断）: auでんきMプラン・ナイトホリデーは常に有利ではない

auでんきMプランは燃調単価差で月によりJAでんきより安くなることがある。
ナイトホリデーから夜トクへの乗り換えは使用量が少ないと基本料金差で不利になる
（442kWh未満のナイトタイムのみ試算で逆転）。**いずれも計算誤りではなく、
画面はそのまま正直に「ご負担増」等を表示する**方針で決着済み
（`ComparisonResult.test.tsx`「安くならないときも正直に出す」で固定）。

### ⚠ ④ファミリー/時間帯別の夜トク換算は推定

「ホリデータイム」の区分がないため、検針期間の平日／休日日数比と
「休日電力使用割合」（3択・主観）から按分している。元資料の式どおりだが実測ではない。

### 元資料どうしの矛盾（テストで固定済み）

| 項目 | 専用シート | 別シート | 採用 |
|---|---|---|---|
| 夜トクの基本料金半額（使用量0） | ③：適用 | ⑥：非適用 | ③ |
| JA従量電灯A 最低料金 | ①：759.68 | au版：759.67 | ① |
| JA側 燃調小計の丸め | ①：なし | au版：ROUNDDOWN | ① |

「ファミリーⅠ/Ⅱ結果」「時間帯別結果」の**従量電灯Aとの比較列は `#REF!` で壊れている**。
2026-10-14 に、元資料の式に頼らず「入力の合計kWh＋契約容量」で従量電灯A/S/Bと比べる形で実装した。

### 未計上（元資料と同じ扱い）

消費税の内訳、検針票発行手数料55円、エネルギア／Pontaポイントは含めていない。
低圧電力は規制料金「低圧電力」と自由料金「動力コース」の両方に対応（2026-10-14）。
中国電力「ひるeco電化コース」は時間帯の区切りが夜トクと違い振替式が無いため未対応。

---

## 5. 検証の要点

回帰テストは「実装の出力」ではなく**元資料の値**を期待値にしている。これを崩さないこと。

| テスト | 内容 |
|---|---|
| `excelReference.test.ts` | ①早見表 0〜1200kWh 全点 + 各明細シートの基準ケース |
| `familyTime.test.ts` | ④ファミリーⅡ実データ（15,876 / 16,180 / 16,301円・差額+304円） |
| `salesDeckCrossCheck.test.ts` | 営業資料の差額（-1.39 / -2.71 / -89.76 / -31.09 / -121.0 等） |
| `officialSources.test.ts` | 各社公式単価表・約款・料金メニュー定義書との突合（全12プラン一致） |
| `japaneseHolidays.test.ts` | 祝日算出（ハッピーマンデー・春分秋分・年跨ぎ・土日重複） |
| `calculator.test.ts` | 全8構造の境界値と unsupported 分岐 |
| `comparator.test.ts` | 推奨プラン選択（0〜1200kWh全点で最安と一致）・割引 |
| `explain.test.ts` | 「差が出ている理由」の内訳が請求額の差と必ず一致すること |
| `inverseUsage.test.ts` | 電気料金からの使用量逆算（二分探索の一意性・下限） |
| `demandProfile.test.ts` | 指数3本が別実装（Python）の計算と3桁まで一致／元データの年度合計（転記ミス検知） |
| `annualUsage.test.ts` ほか | 月ごとの使用量の組み立て（夏季の振り直し・月ごとのカレンダー）。calc-core 100% |

コマンド:

```bash
npm run build            # calc-core を先にビルドしないと web のテストが謎エラーになる
npm run test:coverage    # 817件・calc-core/scripts 100%、web 80%以上を閾値で強制
npm run type-check
npm run rate-master:check
npm run security:check
```

元資料の xlsx は `archive/` にあるが **.gitignore 済み**（正本は Google Drive）。
VMが作り直されると消えるので、必要なら Drive から再取得する
（`シミュレーション【26年7月適用】/中電 26年7月/` ほか）。

## 6. 元資料の場所（Google Drive）

| 番号 | ファイル |
|---|---|
| ① | JAでんき試算表(VS中電_従量A・スマート・シンプル)26年7月適用.xlsx |
| ② | JAでんき試算表(VS中電_従量B)26年7月適用.xlsx |
| ③ | JAでんき試算表(VS中電_電化Style・ナイトホリデー)26年7月適用.xlsx |
| ④ | JAでんき試算表(VS中電_ファミリー①②・時間帯別)26年7月適用.xlsx |
| ⑤ | JAでんき試算表(VS中電_低圧電力)26年7月適用.xlsx |
| ⑥ | JAでんき試算表(VS深夜電力B)26年7月適用.xlsx |
| au | JAでんき試算表(VS auでんき_Ｍプラン / 低圧電力)26年6月.xlsx |

営業資料: `広島市 JAでんき案内資料 r3.pptx`、`JAでんき_職員向け説明会.pptx`、`JAでんき_QA_統合版.docx`

**元資料は読み取り専用**（CLAUDE.md ルール3）。Drive上で変更・移動・削除しないこと。

## 7. 関連ドキュメント

- `docs/SMOKE_TEST.md` — 動作確認シート（15〜20分・検針票不要）
- `docs/ACCEPTANCE_TEST.md` — 受け入れテスト手順書（本番に出してよいかを決める）
- `docs/VISIT_REFUSAL_PROCEDURE.md` — 「訪問はご遠慮したい」と言われたときの手順
- `docs/VISIT_LOG_DESIGN.md` — 訪問履歴と重複営業の回避（設計検討・認証を持たせない判断）
- `docs/REVIEW_GUIDE.md` — 職員レビュー用の依頼書
- `docs/PHASE_6_DESIGN.md` — 料金改定レビューのパイプライン設計
- `docs/IMPLEMENTATION_PLAN.md` — 全体計画・ロードマップ
- `SECURITY.md` — セキュリティ・個人情報保護方針
- `DEPLOY.md` — オンプレミスVMへの配置と管理者向け画面の切り離し
- `ASSUMPTIONS.md` — 仮定・未確認事項
