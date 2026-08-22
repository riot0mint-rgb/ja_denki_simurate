import { HearingAnswers } from '../data/playbook'
import { Stage } from './coachService'

/**
 * 商談の記録。
 *
 * **この1行だけでは、どのお客様のことか分からないように作る。**
 * 氏名・住所・電話番号はもちろん、時刻や正確な使用量も入れない
 * （時刻＋地域、使用量の実数は、他の情報と突き合わせると絞り込みの手がかりになる）。
 *
 * 端末には保存しない。画面を閉じれば消える。
 * 残したい行は書き出して、JAが既に持っている仕組みに貼る。
 * この画面が「もう一つの顧客名簿」になってはいけない（docs/VISIT_LOG_DESIGN.md）。
 */

export type Outcome =
  | 'applied'
  | 'considering'
  | 'declined'
  | 'not_suitable'
  | 'absent'
  | 'refused_future'

export const OUTCOMES: Array<{ value: Outcome; label: string; note: string }> = [
  { value: 'applied', label: 'お申し込みいただいた', note: '' },
  { value: 'considering', label: 'ご検討中', note: '資料をお渡しした' },
  { value: 'declined', label: '見送り', note: 'お客様のご意向' },
  { value: 'not_suitable', label: 'こちらから見送り', note: '高くなるため勧めなかった' },
  { value: 'absent', label: 'ご不在', note: '' },
  // 取りこぼすと、他の職員が再訪してJA全体の信用を落とす。いちばん大事な記録
  { value: 'refused_future', label: '今後の訪問はご遠慮したい', note: '名簿に「訪問不可」を' }
]

export interface VisitLog {
  /** 日付のみ。時刻は入れない */
  date: string
  reached: Stage
  interest: HearingAnswers['interest']
  household: HearingAnswers['household']
  daytime: HearingAnswers['daytime']
  allElectric: HearingAnswers['allElectric']
  concern: HearingAnswers['concern']
  /** 試算した現在のご契約 */
  scenarioId: string | null
  /** 使用量の帯。実数は入れない */
  usageBand: string | null
  /** 年間差額の帯。実数は入れない */
  savingsBand: string | null
  /** 実際に出た反論 */
  objections: string[]
  outcome: Outcome | null
  /** 確度（A〜E）。判定の根拠は画面に出す */
  confidence: string | null
  /** 次にいつ行くか */
  nextVisit: string | null
  /** 前回どこで止まったか。次回の入りに使う */
  stoppedAt: string | null
}

/**
 * 使用量の帯。
 * 実数だと「この地区でひと月◯◯kWhの世帯」がほぼ一意に決まってしまうことがある。
 */
export function usageBand(kwh: number | null): string | null {
  if (kwh === null || !Number.isFinite(kwh) || kwh < 0) return null
  if (kwh < 150) return '〜150kWh'
  if (kwh < 300) return '150〜300kWh'
  if (kwh < 500) return '300〜500kWh'
  if (kwh < 1000) return '500〜1000kWh'
  return '1000kWh〜'
}

/**
 * 年間差額の帯。
 * 「いくら安くなると決まるのか」を組織で見るための軸なので、
 * 高くなる側もひとまとめにせず分けておく。
 */
export function savingsBand(yen: number | null): string | null {
  if (yen === null || !Number.isFinite(yen)) return null
  if (yen < 0) return '高くなる'
  if (yen === 0) return '同額'
  if (yen < 3000) return '〜3千円'
  if (yen < 10000) return '3千〜1万円'
  if (yen < 30000) return '1万〜3万円'
  return '3万円〜'
}

/** 書き出す列。ラベルで読み書きするので、順番が変わっても壊れない */
export const LOG_COLUMNS: Array<{ key: keyof VisitLog; label: string }> = [
  { key: 'date', label: '日付' },
  { key: 'reached', label: '到達段階' },
  { key: 'interest', label: '温度感' },
  { key: 'household', label: '世帯' },
  { key: 'daytime', label: '日中在宅' },
  { key: 'allElectric', label: 'オール電化' },
  { key: 'concern', label: '気がかり' },
  { key: 'scenarioId', label: '現在の契約' },
  { key: 'usageBand', label: '使用量帯' },
  { key: 'savingsBand', label: '年間差額帯' },
  { key: 'objections', label: '出た反論' },
  { key: 'outcome', label: '結果' },
  { key: 'confidence', label: '確度' },
  { key: 'nextVisit', label: '次回の目安' },
  { key: 'stoppedAt', label: '前回の止まり' }
]

/** 個人にたどり着ける列を足していないことを、書き出しのたびに確かめる */
const FORBIDDEN_LABELS = ['氏名', '名前', '住所', '電話', 'メール', 'お客様番号', '供給地点', '時刻']

export function assertNoIdentifyingColumn(labels: string[]): void {
  const hit = labels.find(l => FORBIDDEN_LABELS.some(f => l.includes(f)))
  if (hit) throw new Error(`個人にたどり着ける列は書き出せません: ${hit}`)
}

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(';')
  return String(value)
}

/** タブ・改行はセルを壊すので落とす */
const clean = (text: string): string => text.replace(/[\t\r\n]+/g, ' ').trim()

export function toRow(log: VisitLog): string[] {
  return LOG_COLUMNS.map(c => clean(cell(log[c.key])))
}

export function headerRow(): string[] {
  const labels = LOG_COLUMNS.map(c => c.label)
  assertNoIdentifyingColumn(labels)
  return labels
}

/** Excel にそのまま貼れる形。見出しを付けるかは選べる */
export function toTsv(logs: VisitLog[], options: { header?: boolean } = {}): string {
  const rows = logs.map(toRow)
  return (options.header ? [headerRow(), ...rows] : rows).map(r => r.join('\t')).join('\n')
}

export interface ParsedLogs {
  rows: Array<Record<string, string>>
  /** 見つからなかった見出し。組織側で列を足していても壊さない */
  missing: string[]
  error: string | null
}

/**
 * 集めた表を貼り戻して読む。
 *
 * 見出しの名前で読むので、組織側が「支店」「担当」などの列を足していても動く。
 * 列の順番を入れ替えられても動く。現場の表は必ず育つので、位置で読んではいけない。
 */
export function parseTsv(text: string): ParsedLogs {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim() !== '')
  if (lines.length < 2) {
    return { rows: [], missing: [], error: '見出しの行と、1行以上のデータが必要です' }
  }
  const split = (line: string) => (line.includes('\t') ? line.split('\t') : line.split(','))
  const header = split(lines[0]).map(h => h.trim())
  const wanted = LOG_COLUMNS.map(c => c.label)
  const missing = wanted.filter(w => !header.includes(w))
  if (missing.length === wanted.length) {
    return { rows: [], missing, error: '見出しの行が見つかりません。1行目に見出しを入れてください' }
  }
  const rows = lines.slice(1).map(line => {
    const cells = split(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = (cells[i] ?? '').trim()
    })
    return row
  })
  return { rows, missing, error: null }
}

export interface Tally {
  label: string
  count: number
  /** その区分のうち、お申し込みに至った割合（%）。母数が小さいときは null */
  appliedRate: number | null
}

const APPLIED = OUTCOMES.find(o => o.value === 'applied')!.label

/** 母数がこれ未満の区分では割合を出さない。1件2件の率は判断を誤らせる */
export const MIN_SAMPLE = 5

function tally(rows: Array<Record<string, string>>, column: string): Tally[] {
  const groups = new Map<string, { count: number; applied: number }>()
  for (const row of rows) {
    const raw = row[column] ?? ''
    for (const value of raw === '' ? ['（未記入）'] : raw.split(';')) {
      const key = value.trim() || '（未記入）'
      const g = groups.get(key) ?? { count: 0, applied: 0 }
      g.count += 1
      if (row['結果'] === APPLIED || row['結果'] === 'applied') g.applied += 1
      groups.set(key, g)
    }
  }
  return [...groups.entries()]
    .map(([label, g]) => ({
      label,
      count: g.count,
      appliedRate: g.count >= MIN_SAMPLE ? Math.round((g.applied / g.count) * 1000) / 10 : null
    }))
    .sort((a, b) => b.count - a.count)
}

export interface Summary {
  total: number
  applied: number
  appliedRate: number | null
  byOutcome: Tally[]
  byConcern: Tally[]
  byObjection: Tally[]
  bySavingsBand: Tally[]
  byScenario: Tally[]
  byReached: Tally[]
  /** 確度ごとの実際の申込率。判定が当たっているかの検証に使う */
  byConfidence: Tally[]
}

export function summarize(rows: Array<Record<string, string>>): Summary {
  const total = rows.length
  const applied = rows.filter(r => r['結果'] === APPLIED || r['結果'] === 'applied').length
  return {
    total,
    applied,
    appliedRate: total >= MIN_SAMPLE ? Math.round((applied / total) * 1000) / 10 : null,
    byOutcome: tally(rows, '結果'),
    byConcern: tally(rows, '気がかり'),
    byObjection: tally(rows, '出た反論'),
    bySavingsBand: tally(rows, '年間差額帯'),
    byScenario: tally(rows, '現在の契約'),
    byReached: tally(rows, '到達段階'),
    byConfidence: tally(rows, '確度')
  }
}
