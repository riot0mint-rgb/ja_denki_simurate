# 開発ルール・設計方針 (CLAUDE.md)

本ドキュメントは、このプロジェクトにおける**非交渉の開発ルール**を定めます。

## 最優先原則

### 1. 料金計算には LLM を使わない

❌ **禁止**:
```typescript
// LLMに計算させる（禁止）
const result = await llm.prompt(
  `使用量 ${usage} kWh の場合、基本料金 ${base} 円と段階別料金から月額を計算して`
);
```

✅ **必須**:
```typescript
// 決定論的ルールで計算
function calculateMonthlyBill(usage: number): Decimal {
  let charge = new Decimal(base_charge);
  if (usage <= 15) {
    charge = charge.max(new Decimal(minimum_charge));
  } else {
    // 段階別計算...
  }
  return charge;
}
```

**理由**: 金銭計算は再現性・正確性が必須。生成AIは幻覚・丸め誤差の原因。

### 2. 金額に浮動小数を使わない

❌ **禁止**:
```typescript
const bill: number = 7500.0;      // JavaScript の number 型
const tax = bill * 1.1;            // 浮動小数点エラー発生
```

✅ **必須**:
```typescript
import Decimal from 'decimal.js';
const bill = new Decimal('7500');
const tax = bill.times('1.1');    // 正確な計算
```

**理由**: `0.1 + 0.2 ≠ 0.3` という浮動小数点問題が金額計算では致命的。

### 3. 元資料を変更・移動・削除・上書きしない

❌ **禁止**:
```bash
# Google Drive 内のファイルを変更
rm /mnt/drive/【中国】JAでんき料金メニュー定義書.pdf
# または Google Drive 上で移動・名前変更・削除
```

✅ **必須**:
```bash
# ローカルにコピーして分析（元ファイルは読み取り専用）
cp /mnt/drive/元ファイル.pdf ./archive/
```

**理由**: 元資料は審査証跡・監査の根拠。破損・紛失で全プロジェクトが無効化。

### 4. 出典のない単価を登録しない

❌ **禁止**:
```json
{
  "plan_id": "ja_denki_raten_a",
  "tier1_unit_price": 29.75,      // 出典を示していない
  "notes": "調べた値"
}
```

✅ **必須**:
```json
{
  "plan_id": "ja_denki_raten_a",
  "tier1_unit_price": 29.75,
  "source_file": "【中国】JAでんき料金メニュー定義書（家庭用）＜20261001＞.pdf",
  "source_page": "3",
  "source_effective_date": "2026-10-01",
  "verification_status": "verified",
  "verified_by": "claude",
  "verified_at": "2026-08-20"
}
```

**理由**: 後で「どこからこの数値が来たのか?」が追跡不可に。改定時のトレーサビリティが失われ、間違った値で計算し続ける。

### 5. 端数処理を省略しない

❌ **禁止**:
```typescript
// 四捨五入をデフォルトで使用
const bill = Math.round(amount);
```

✅ **必須**:
```typescript
// プランで定義された端数処理を厳密に適用
const rounding_rule = rateMaster.rounding_rule;  // "floor" | "round" | "ceil"
const rounding_unit = rateMaster.rounding_unit;  // "yen" | "ten_yen"

function applyRounding(amount: Decimal, rule: RoundingRule): Decimal {
  switch (rule) {
    case 'floor':
      return amount.floor();      // 1円未満切り捨て
    case 'round':
      return amount.toNearestToPrecision(0, ROUND_HALF_UP);
    case 'ceil':
      return amount.ceil();       // 1円未満切り上げ
  }
}
```

**理由**: 料金表に「円未満は切り上げ」と記載されていれば、四捨五入で計算すると請求額が異なる。

### 6. テストなしで料金ロジックを変更しない

❌ **禁止**:
```typescript
// テスト追加なしで段階別料金計算を変更
function calculateTier2(usage: number, unitPrice: number): number {
  return (usage - 15) * unitPrice;  // 変更内容が不明瞭
}
```

✅ **必須**:
```typescript
// 変更前にテストケースを追加
describe('calculateTier2', () => {
  it('should return 0 when usage <= 15', () => {
    expect(calculateTier2(15, 25.4)).toBe(0);
  });
  
  it('should calculate correct amount at 300 kWh boundary', () => {
    // 使用量 120kWh → tier2 適用範囲 (15, 120] → 105 kWh
    expect(calculateTier2(120, 25.4))
      .toBe(new Decimal('105').times('25.4'));
  });
});

// テストが通ることを確認してから変更を実施
```

**理由**: 料金計算は一度間違うと、影響を受けた全ユーザーの試算が誤る。テストが防止策。

### 7. 個人情報をログに出さない

❌ **禁止**:
```typescript
console.log('ユーザー入力:', { 
  usage: 250, 
  company: 'JAでんき',
  area: '広島市中区',        // 住所
  contract_date: '2020-04-15'
});
```

✅ **必須**:
```typescript
// 個人属性は記録しない、数値のみ
console.log('計算実行:', { 
  usage_kwh: 250,
  plan_id: 'ja_denki_raten_a',  // プラン ID のみ
  result_monthly_yen: 7500
});
```

**理由**: Phase A はブラウザ内処理だが、ブラウザコンソール・ネットワークログから個人情報が漏出する可能性。

### 8. 未確認プランを推測計算しない

❌ **禁止**:
```typescript
// 定義書に記載のないプランを「おそらくこうだろう」で計算
if (unknownPlan) {
  // 従量電灯A に似ているので同じ計算と仮定
  return calculateRatenA(usage);
}
```

✅ **必須**:
```typescript
// 計算不可、利用者に次の確認を促す
if (unknownPlan) {
  return {
    status: 'unsupported',
    reason: '現在のプランは自動計算に対応していません',
    next_steps: [
      'プラン名を確認してください',
      'お手数ですが営業担当にお問い合わせください'
    ]
  };
}
```

**理由**: 推測値で計算すると、実際の料金と大きく異なり、営業信頼を失う。分からないなら分からないと明示が重要。

### 9. Phase A で個人情報をサーバーに送信しない

❌ **禁止**:
```typescript
// ユーザー入力をサーバー分析
fetch('/api/analyze', {
  method: 'POST',
  body: JSON.stringify({
    usage: 250,
    company: 'JAでんき',
    email: 'user@example.com'  // 個人情報送信
  })
});
```

✅ **必須**:
```typescript
// すべてブラウザ内計算
const result = calculateComparison(usage, company);
// 表示のみ、サーバー送信なし
displayResult(result);
```

**理由**: Phase B で OCR・AI等でサーバー送信が必要になるまでは、個人情報をサーバーに送る必然性がない。最小権限の原則。

### 10. 料金は自動で本番反映せず、必ず人が承認する

❌ **禁止**:
```python
# 自動スクレイピング → 自動反映
new_rates = scrape_latest_rates()
update_rate_master(new_rates)  # 自動反映
notify_users()
```

✅ **必須**:
```python
# 自動スクレイピング → 承認画面に送付
new_rates = scrape_latest_rates()
send_to_approval_screen(new_rates)  # 人間確認待機

# 人間が承認ボタンを押した時のみ反映
def approve_rates(request):
  rates = request.POST['rates']
  verify_rate_consistency(rates)  # 検算
  update_rate_master(rates)        # 反映
  log_audit(f'承認者: {request.user}, 時刻: {now()}')
```

**理由**: 自動反映で誤った値がサーバーに反映されると、全ユーザーに影響。人間の目による最終確認が必須。

#### 例外: 燃料費調整額・再エネ賦課金の月次値（2026-09-07・プロジェクト管理者承認）

**単価・料金構造（基本料金・段階別単価・約款の解釈等）にはこの例外は一切適用されない。**
上記の原則どおり、必ず人が承認する。

例外の対象は、各社が毎月機械的に公表する**燃料費調整額・再エネ賦課金の数値のみ**。
複数の元資料が食い違うことがある単価・料金構造とは異なり、これらは解釈の余地がない
月次の公表数値であるため、**取得から本番反映までを無人で回してよい**。ただし以下を必ず満たすこと。

- 取得元ページの構造が想定と異なり解析できない場合は、**推測で値を埋めず処理を失敗させる**
  （ルール8と同じ精神）。黙って古い値のまま・不正な値で反映することは絶対に避ける
- **新しい年月の追加のみ自動反映してよい。** 既存の年月の値を書き換える場合
  （訂正・過去改定の発覚等）は、通常どおり人が確認するPRとして止める
- 反映はCIの品質ゲート（build・test・rate-master:check 等）を必ず通してから行う。
  品質ゲートが赤のまま本番へ出さない
- 実装は `docs/IMPLEMENTATION_PLAN.md`「フェーズ6-b」を参照

---

## コード品質基準

### TypeScript 型安全性

- すべての関数に入出力型を明示
- `any` 型を使わない
- 金額は `Decimal` 型に統一

### テストカバレッジ

- calc-core: 100% カバレッジ必須
- Web UI: 80% 以上
- 料金計算の全境界値をテスト

### コメント・ドキュメント

- コードの「何をするのか」は不要（自明な命名で表現）
- 「なぜこうしたのか」のみコメント（非自明な制約・判断がある場合）

```typescript
// ❌ 不要なコメント
const tier1 = usage <= 15;  // 使用量が15以下かチェック

// ✅ 必要なコメント
// 15kWhまでの使用量は最低料金に含める（プラン定義書p.3参照）
const includedInMinimum = usage <= 15;
```

### ファイル・ディレクトリ構成

- 機能ごとにフォルダ分け
- 関連ファイルは同じディレクトリ配置
- 共通コードは packages/ に

---

## デプロイ・リリース規約

### ブランチ戦略

- `main`: 本番環境デプロイ版（常時安定）
- `claude/ja-denki-comparison-simulator-*`: 開発ブランチ
- PR 作成 → レビュー → Merge to main → 本番デプロイ

### CI/CD チェックリスト

本番デプロイ前に以下を確認：

- [ ] すべてのテストが成功
- [ ] calc-core 回帰テスト成功（既存Excel との差異 0円）
- [ ] セキュリティスキャン合格
- [ ] DEPLOY.md の手順で再現可能
- [ ] 個人情報が含まれていないことを確認

### ロールバック手順

本番環境で問題検出時：

1. 前版のコミットを特定
2. `git revert` で新しいコミットを作成
3. テスト確認後、本番反映

**削除・強制プッシュは厳禁**（ログ消失で対応不可に）

---

## コミットメッセージ規約

```
<type>: <subject>

<body>

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_...
```

### Type の種類

- `feat`: 新機能追加
- `fix`: バグ修正
- `refactor`: 機能変更なしの整理
- `docs`: ドキュメント更新
- `test`: テスト追加・更新
- `chore`: ビルド設定等の変更
- `rate-update`: 料金マスター更新

### 例

```
feat: calc-core で tier2 段階料金計算を実装

- 使用量 15kWh 超 120kWh 以下の料金を計算
- 境界値テスト 15, 16, 119, 120, 121 kWh で検証
- 既存Excel との差異は 0円を確認

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_...
```

---

## 相談・判断が必要な場合

以下のような場合は、ASSUMPTIONS.md に記録してから実装：

- 料金体系に曖昧性がある（複数の解釈が可能）
- 既存Excel との計算結果が異なる
- 新しいプランの要件が不明確
- セキュリティ・個人情報に関する判断

**例**:
```markdown
## 未確認: 再エネ賦課金の適用対象

定義書に「全使用量に掛ける」と記載あるが、
既存Excel では「120kWh超」のみに掛けている。

- 定義書: https://drive.google.com/.../...pdf p.5
- 既存Excel: rate_comparison_v1.xlsx Sheet「賦課金」 col C

=> フェーズ2で確認担当に確認依頼
```

---

## ルール違反時

もし実装中に上記ルールと矛盾する状況が生じた場合：

1. **立ち止まる** （実装を続行しない）
2. **ASSUMPTIONS.md に記録**
3. **プロジェクト管理者に報告**
4. **承認を得てからコード変更**

---

**最終更新**: 2026-08-20
**関連文書**: ASSUMPTIONS.md, SECURITY.md, DEPLOY.md
