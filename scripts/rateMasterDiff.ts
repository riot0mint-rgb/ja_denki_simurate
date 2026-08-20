/**
 * 料金マスターの改定差分。
 *
 * フェーズ6（改定レビュー）の中核。人が承認する材料は「どの値が、いくらから
 * いくらに、どの出典で変わったか」であり、JSON の行差分ではない。
 * CLAUDE.md ルール10（人の承認が必須）とルール4（出典必須）を差分の粒度で満たす。
 */

export interface RateMasterLike {
  plans: Array<Record<string, unknown>>
  monthly_rates: Array<Record<string, unknown>>
}

export interface ValueChange {
  path: string
  before: string | null
  after: string | null
}

export interface PlanDiff {
  planId: string
  planName: string
  status: 'added' | 'removed' | 'changed'
  changes: ValueChange[]
  /** 変更後の出典。値が動いたのに出典が同じなら転記ミスの可能性がある */
  sources: string[]
  sourceUnchanged: boolean
}

export interface MonthlyDiff {
  key: string
  status: 'added' | 'removed' | 'changed'
  changes: ValueChange[]
}

export interface RateMasterDiff {
  plans: PlanDiff[]
  monthly: MonthlyDiff[]
  hasChanges: boolean
}

/** ネストした値を "tiers[0].unitPriceYenPerKwh" のような1行の経路に潰す */
function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`))
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k)
    } else {
      out.set(path, v === null || v === undefined ? 'なし' : String(v))
    }
  }
  walk(value, prefix)
  return out
}

function diffMaps(before: Map<string, string>, after: Map<string, string>): ValueChange[] {
  const changes: ValueChange[] = []
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(key) ?? null
    const a = after.get(key) ?? null
    if (b !== a) changes.push({ path: key, before: b, after: a })
  }
  return changes.sort((x, y) => x.path.localeCompare(y.path))
}

function sourceLabels(plan: Record<string, unknown> | undefined): string[] {
  const sources = (plan?.sources ?? []) as Array<{ document?: string; locator?: string }>
  return sources.map(s => `${s.document ?? ''} ${s.locator ?? ''}`.trim())
}

const monthlyKey = (row: Record<string, unknown>) => `${row.provider}/${row.period}`

export function diffRateMaster(before: RateMasterLike, after: RateMasterLike): RateMasterDiff {
  const beforePlans = new Map(before.plans.map(p => [String(p.planId), p]))
  const afterPlans = new Map(after.plans.map(p => [String(p.planId), p]))

  const plans: PlanDiff[] = []
  for (const planId of new Set([...beforePlans.keys(), ...afterPlans.keys()]).values()) {
    const b = beforePlans.get(planId)
    const a = afterPlans.get(planId)
    const status = !b ? 'added' : !a ? 'removed' : 'changed'
    const changes = diffMaps(flatten(b ?? {}), flatten(a ?? {}))
    if (status === 'changed' && changes.length === 0) continue

    // 出典の経路だけを取り出して、単価が動いたのに出典が据え置きかを見る
    const valueChanged = changes.some(c => !c.path.startsWith('sources'))
    const sourceChanged = changes.some(c => c.path.startsWith('sources'))
    plans.push({
      planId,
      planName: String((a ?? b)?.planName ?? planId),
      status,
      changes,
      sources: sourceLabels(a ?? b),
      sourceUnchanged: status === 'changed' && valueChanged && !sourceChanged
    })
  }

  const beforeMonthly = new Map(before.monthly_rates.map(r => [monthlyKey(r), r]))
  const afterMonthly = new Map(after.monthly_rates.map(r => [monthlyKey(r), r]))
  const monthly: MonthlyDiff[] = []
  for (const key of new Set([...beforeMonthly.keys(), ...afterMonthly.keys()]).values()) {
    const b = beforeMonthly.get(key)
    const a = afterMonthly.get(key)
    const changes = diffMaps(flatten(b ?? {}), flatten(a ?? {}))
    if (changes.length === 0) continue
    monthly.push({ key, status: !b ? 'added' : !a ? 'removed' : 'changed', changes })
  }

  plans.sort((x, y) => x.planId.localeCompare(y.planId))
  monthly.sort((x, y) => x.key.localeCompare(y.key))
  return { plans, monthly, hasChanges: plans.length > 0 || monthly.length > 0 }
}

const STATUS_LABEL = { added: '新規', removed: '削除', changed: '変更' } as const

/** PR にそのまま貼れる形。承認者はこれだけを読めば判断できるようにする */
export function renderDiffReport(diff: RateMasterDiff): string {
  if (!diff.hasChanges) return '## 料金マスターの差分\n\n変更はありません。\n'

  const lines: string[] = ['## 料金マスターの差分', '']

  const suspicious = diff.plans.filter(p => p.sourceUnchanged)
  if (suspicious.length > 0) {
    lines.push('> ⚠️ **出典が据え置きのまま単価が動いています。転記ミスでないか確認してください。**')
    lines.push('>')
    for (const p of suspicious) lines.push(`> - ${p.planName}（\`${p.planId}\`）`)
    lines.push('')
  }

  if (diff.plans.length > 0) {
    lines.push('### プラン', '')
    for (const plan of diff.plans) {
      lines.push(`#### ${STATUS_LABEL[plan.status]}: ${plan.planName} (\`${plan.planId}\`)`, '')
      lines.push('| 項目 | 変更前 | 変更後 |', '|---|---|---|')
      for (const c of plan.changes) {
        lines.push(`| \`${c.path}\` | ${c.before ?? '—'} | ${c.after ?? '—'} |`)
      }
      lines.push('')
      if (plan.sources.length > 0) {
        lines.push('出典:', ...plan.sources.map(s => `- ${s}`), '')
      }
    }
  }

  if (diff.monthly.length > 0) {
    lines.push('### 燃料費調整額・再エネ賦課金', '')
    lines.push('| 対象 | 区分 | 項目 | 変更前 | 変更後 |', '|---|---|---|---|---|')
    for (const m of diff.monthly) {
      for (const c of m.changes) {
        lines.push(
          `| ${m.key} | ${STATUS_LABEL[m.status]} | \`${c.path}\` | ${c.before ?? '—'} | ${c.after ?? '—'} |`
        )
      }
    }
    lines.push('')
  }

  lines.push('---', '')
  lines.push('この差分は `npm run rate-master:diff` が生成しました。')
  lines.push('**承認は人が行います**（CLAUDE.md ルール10）。単価と出典の対応を1件ずつ確認してください。')
  lines.push('')
  return lines.join('\n')
}
