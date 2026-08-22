import {
  HearingAnswers,
  HEARING,
  OPENING,
  EXPLAIN,
  OBJECTIONS,
  Objection,
  Script
} from '../data/playbook'

/**
 * 商談ナビの出し分け。
 *
 * 生成AIは使わない（フェーズ8と同じ理由）。ヒアリングの答えから
 * 決まった台本を引くだけの純粋関数にしてある。同じ答えには必ず同じ助言が出る。
 */

export type Stage = 'prepare' | 'opening' | 'hearing' | 'estimate' | 'explain' | 'objection' | 'closing' | 'review'

export const STAGES: Array<{ id: Stage; label: string; short: string }> = [
  { id: 'prepare', label: '準備', short: '準備' },
  { id: 'opening', label: '導入・ごあいさつ', short: '導入' },
  { id: 'hearing', label: 'おうかがい', short: '聞く' },
  { id: 'estimate', label: '試算', short: '試算' },
  { id: 'explain', label: 'ご説明', short: '説明' },
  { id: 'objection', label: 'ご不安・ご質問', short: '不安' },
  { id: 'closing', label: 'お手続きのご案内', short: '手続き' },
  { id: 'review', label: 'ふりかえり', short: '振返' }
]

export function stageIndex(stage: Stage): number {
  return STAGES.findIndex(s => s.id === stage)
}

export function nextStage(stage: Stage, options: { skipClosing?: boolean } = {}): Stage | null {
  // 今日は決まらないと分かっているのに、お手続きの案内へ進ませない
  if (stage === 'objection' && options.skipClosing) return 'review'
  const i = stageIndex(stage)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1].id : null
}

export function previousStage(stage: Stage): Stage | null {
  const i = stageIndex(stage)
  return i > 0 ? STAGES[i - 1].id : null
}

/** ヒアリングで答え終わった数 */
export function answeredCount(answers: HearingAnswers): number {
  return HEARING.filter(q => answers[q.id] !== null).length
}

export function hearingDone(answers: HearingAnswers): boolean {
  return answeredCount(answers) === HEARING.length
}

/**
 * 導入で読む台本。共通のあいさつに、温度感に応じた一言を足す。
 * 温度感が未回答なら共通のぶんだけ返す（何も出ないより、共通が出るほうがよい）。
 */
export function openingFor(answers: HearingAnswers): Script[] {
  const scripts = [OPENING.default]
  if (answers.interest) scripts.push(OPENING[answers.interest])
  return scripts
}

/** 説明の重点。気にされていることが未回答なら共通の型 */
export function explainFor(answers: HearingAnswers): Script {
  return answers.concern ? EXPLAIN[answers.concern] : EXPLAIN.default
}

/**
 * どのプランで試算するか。
 *
 * オール電化のお客様に従量電灯どうしの比較を見せても意味がない。
 * ここで取り違えると、以降の説明が全部ずれる。
 */
export interface EstimateHint {
  /** 画面のプラン選択で探す言葉 */
  lookFor: string
  reason: string
  /** 検針票が無いときにかんたん試算へ回してよいか */
  simpleOk: boolean
}

export function estimateHint(answers: HearingAnswers): EstimateHint {
  if (answers.allElectric === 'yes') {
    return {
      lookFor: '電化Style / ファミリータイム / 時間帯別電灯 / ナイトホリデー',
      reason:
        'オール電化のお客様は時間帯別のプランをお使いのことがほとんどです。' +
        '検針票の「ご契約種別」をそのまま選んでください。',
      // 時間帯別は昼夜の内訳が要るため、電気料金だけからは戻せない
      simpleOk: false
    }
  }
  if (answers.allElectric === 'unknown') {
    return {
      lookFor: '検針票の「ご契約種別」をそのまま',
      reason:
        'ガスをお使いかどうか分からないときは、推測せず検針票を見てください。' +
        '「ご契約種別」の欄にプラン名がそのまま書いてあります。',
      simpleOk: true
    }
  }
  return {
    lookFor: '従量電灯A / スマートコース / シンプルコース',
    reason: 'ガスもお使いのご家庭は、この3つのいずれかがほとんどです。',
    simpleOk: true
  }
}

/**
 * 先回りして開いておく反論。
 *
 * ヒアリングで「気になること」を聞いてあるので、それに対応する反論を先頭に出す。
 * 出てから慌てるより、準備してあるほうが落ち着いて話せる。
 */
export function preemptiveObjectionIds(answers: HearingAnswers): string[] {
  switch (answers.concern) {
    case 'paperwork':
      return ['cancel_fee', 'think']
    case 'satisfied':
      return ['no_need', 'think']
    case 'reliability':
      return ['suspicious', 'think']
    case 'price':
      return ['not_cheaper', 'think']
    case 'unsure':
      return ['think', 'no_need']
    default:
      return []
  }
}

/** 先回りぶんを先頭に並べ替えた反論の一覧 */
export function orderedObjections(answers: HearingAnswers): Objection[] {
  const first = preemptiveObjectionIds(answers)
  const rank = (o: Objection) => {
    const i = first.indexOf(o.id)
    return i === -1 ? first.length : i
  }
  return [...OBJECTIONS].sort((a, b) => rank(a) - rank(b))
}

/**
 * 商談の現在地を一文で。営業が自分で自分の位置を見失わないための表示。
 */
export function situationSummary(answers: HearingAnswers): string {
  const parts: string[] = []
  const q = (id: keyof HearingAnswers) => HEARING.find(x => x.id === id)
  const label = (id: keyof HearingAnswers) => {
    const value = answers[id]
    return value ? q(id)?.choices.find(c => c.value === value)?.label : null
  }
  const interest = label('interest')
  const household = label('household')
  const allElectric = label('allElectric')
  const concern = label('concern')
  if (interest) parts.push(interest)
  if (household) parts.push(household)
  if (allElectric) parts.push(allElectric)
  if (concern) parts.push(`気がかり: ${concern}`)
  return parts.length ? parts.join(' ／ ') : 'まだおうかがいしていません'
}

/**
 * 高くなる試算が出たときに、台本を差し替える。
 *
 * このアプリは安くならない結果を隠さない。台本だけ「それでも勧める」に
 * なっていたら筋が通らないので、ここで明示的に引く側へ倒す。
 */
export function shouldStandDown(annualSavingsYen: number | null): boolean {
  return annualSavingsYen !== null && annualSavingsYen < 0
}

/**
 * 今日は決まらないと分かる反論。
 *
 * ここを取り違えて手続きの案内に進むのが、素人がいちばんやる失敗。
 * 「検討します」と言われた直後に申込書を出すのは、話を聞いていないのと同じで、
 * 次の機会そのものを失う。
 */
export const STOP_TODAY_OBJECTIONS = ['no_need', 'suspicious', 'busy', 'think']

/**
 * 前向きな反論。これが出ていれば、他に後ろ向きな反論があっても進めてよい。
 * 手続きや解約金の質問は、買う前提でしか出ない（confidence.ts と同じ考え方）。
 */
export const PROCEED_OBJECTIONS = ['cancel_fee']

const STOP_REASONS: Record<string, string> = {
  no_need: '「いまのままでよい」とおっしゃっています',
  suspicious: '警戒されている様子です',
  busy: 'お時間が取れないご様子です',
  think: '「検討します」「家族に相談します」とおっしゃっています'
}

export interface ClosingDecision {
  /** お手続きのご案内を飛ばすか */
  skip: boolean
  /** なぜ飛ばすのか。判断を鵜呑みにさせないため、必ず理由を出す */
  reason: string | null
  /** 代わりに今日やること */
  instead: string | null
}

/**
 * お手続きのご案内へ進んでよいか。
 *
 * **進ませない側に倒すのが既定。** 進める判断は営業がその場でできるが、
 * 「引く」判断は誰も止めてくれないので、こちらで用意しておく。
 */
export function closingDecision(
  objections: string[],
  standDown: boolean
): ClosingDecision {
  if (standDown) {
    return {
      skip: true,
      reason: 'いまのご契約のほうがお安い結果でした',
      instead: '今日は資料をお渡しして引きます。ふりかえりへ進んでください'
    }
  }
  // 前向きな質問が出ていれば、後ろ向きな反論があっても進めてよい
  if (objections.some(o => PROCEED_OBJECTIONS.includes(o))) {
    return { skip: false, reason: null, instead: null }
  }
  const stops = objections.filter(o => STOP_TODAY_OBJECTIONS.includes(o))
  if (stops.length === 0) return { skip: false, reason: null, instead: null }
  return {
    skip: true,
    reason: stops.map(o => STOP_REASONS[o]).join('／'),
    instead:
      '今日は資料をお渡しして引きます。' +
      'ここで申込書を出すと、話を聞いていないと受け取られ、次の機会そのものが無くなります'
  }
}
