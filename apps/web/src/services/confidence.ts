import { RATE_REVISIONS } from '../data/rates'
import { Stage, stageIndex } from './coachService'

/**
 * 商談の確度と、次にいつ何を持って行くか。
 *
 * **感触ではなく、起きた事実から判定する。**
 * 素人がいちばんできないのは「検討します」の温度を見分けることで、
 * ベテランでも自分に都合よく見る。だから観測できたことに重みを置き、
 * 営業の感触は ±1 までしか効かせない。
 *
 * 判定が当たっているかは、集計画面で確度別の実際の申込率を見れば分かる。
 * ずれていたら重みを直す。**この関数は仮説であって、正解ではない。**
 */

export type Confidence = 'A' | 'B' | 'C' | 'D' | 'E'

/** 判定に使う、商談で観測できたこと */
export interface ConfidenceInput {
  /** どこまで進んだか */
  reached: Stage
  /** 年間の差額。マイナスは高くなる。まだ試算していなければ null */
  annualSavingsYen: number | null
  /** 実際に出た反論 */
  objections: string[]
  /** 次回うかがう話ができたか */
  nextVisitAgreed: boolean
  /** 資料をお受け取りいただけたか */
  materialsAccepted: boolean
  /** 営業の感触。他の項目より軽くしか効かせない */
  feel: 'good' | 'neutral' | 'poor' | null
  /** 今後の訪問はご遠慮したい、と言われたか */
  refusedFutureVisits: boolean
}

/**
 * 前向きな反論。買う前提でしか出ない質問。
 *
 * 素人はこれを逆に取る。「質問攻めにされた＝断られそう」と感じてしまうが、
 * 買う気のない人は手続きや解約金の質問をしない。
 */
export const POSITIVE_OBJECTIONS = ['cancel_fee']

/** 後ろ向きな反論。こちらへの関心が薄いか、警戒されている */
export const NEGATIVE_OBJECTIONS = ['no_need', 'suspicious', 'busy']

export interface ConfidenceResult {
  rank: Confidence
  score: number
  /** なぜこの確度になったか。判定を鵜呑みにさせないために必ず出す */
  reasons: string[]
}

/** 加点・減点の内訳。表示にも使えるように公開する */
export const WEIGHTS = {
  nextVisitAgreed: 3,
  reachedEstimate: 2,
  positiveObjection: 2,
  savingsLarge: 2,
  savingsSome: 1,
  materialsAccepted: 1,
  negativeObjection: -2,
  feel: 1
} as const

const SAVINGS_LARGE = 10000
const SAVINGS_SOME = 3000

export function judgeConfidence(input: ConfidenceInput): ConfidenceResult {
  // 訪問をお断りされたら、点数に関係なく打ち切る。ここを取りこぼすのが最大の失敗
  if (input.refusedFutureVisits) {
    return {
      rank: 'E',
      score: 0,
      reasons: ['今後の訪問をご遠慮したいとのことでした。二度と訪問しません']
    }
  }

  // 高くなる結果なら勧めない。確度の話ではなく、勧めてはいけない
  if (input.annualSavingsYen !== null && input.annualSavingsYen < 0) {
    return {
      rank: 'D',
      score: 0,
      reasons: [
        'いまのご契約のほうがお安い結果でした。個別の再訪はせず、定期の巡回に戻します',
        'ご使用量が変わったときや料金改定のときに、あらためて見させていただきます'
      ]
    }
  }

  let score = 0
  const reasons: string[] = []
  const add = (points: number, why: string) => {
    score += points
    reasons.push(`${points > 0 ? '+' : ''}${points} ${why}`)
  }

  if (input.nextVisitAgreed) add(WEIGHTS.nextVisitAgreed, '次回うかがう話ができた')

  // 検針票を見せていただけた＝個人の書類を出していただけた。一定の信頼がある
  if (stageIndex(input.reached) >= stageIndex('estimate')) {
    add(WEIGHTS.reachedEstimate, '検針票を見せていただけた')
  }

  const positive = input.objections.filter(o => POSITIVE_OBJECTIONS.includes(o))
  if (positive.length > 0) {
    add(WEIGHTS.positiveObjection, '手続きや解約金など、進める前提のご質問が出た')
  }

  const negative = input.objections.filter(o => NEGATIVE_OBJECTIONS.includes(o))
  if (negative.length > 0) {
    add(WEIGHTS.negativeObjection, 'いまのままでよい／警戒されている様子だった')
  }

  const savings = input.annualSavingsYen
  if (savings !== null && savings >= SAVINGS_LARGE) {
    add(WEIGHTS.savingsLarge, `年間 ${SAVINGS_LARGE.toLocaleString()}円以上おトクになる`)
  } else if (savings !== null && savings >= SAVINGS_SOME) {
    add(WEIGHTS.savingsSome, `年間 ${SAVINGS_SOME.toLocaleString()}円以上おトクになる`)
  }

  if (input.materialsAccepted) add(WEIGHTS.materialsAccepted, '資料をお受け取りいただけた')

  // 感触は他より軽い。素人の感触は当てにならず、ベテランでも自分に都合よく見る
  if (input.feel === 'good') add(WEIGHTS.feel, '手応えがあった（参考程度）')
  if (input.feel === 'poor') add(-WEIGHTS.feel, '手応えが薄かった（参考程度）')

  // 約束があるなら、点数に関係なくいちばん上。日が決まっているのが最強の材料
  const rank: Confidence = input.nextVisitAgreed ? 'A' : score >= 7 ? 'B' : score >= 3 ? 'C' : 'D'
  return { rank, score, reasons }
}

export interface NextAction {
  rank: Confidence
  label: string
  /** いつ行くか */
  when: string
  /** 何をするか */
  todo: string[]
}

export const NEXT_ACTIONS: Record<Confidence, Omit<NextAction, 'rank'>> = {
  A: {
    label: '次回の約束がある',
    when: '約束した日',
    todo: [
      'その日のうちに、ご自身の予定に入れてください',
      '名簿に「◯月◯日に再訪」と書き入れてください',
      '前回どこで止まったかを、次回の入りに使います'
    ]
  },
  B: {
    label: '前向き。日はこれから',
    when: '1〜2週間のうちに',
    todo: [
      '間を空けすぎないでください。1か月あくと、話したことを忘れられます',
      '「その後いかがですか」では入りにくいので、口実を用意して行きます（下記）',
      '名簿に確度Bと、前回止まったところを書き入れてください'
    ]
  },
  C: {
    label: '材料はお渡しした。反応待ち',
    when: '口実ができたときに',
    todo: [
      '間隔をあけてください。短い間隔での再訪は、いちばん嫌われます',
      '料金改定や、季節が変わった検針票が口実になります（下記）',
      '名簿に確度Cと書き入れて、口実の時期まで置いておきます'
    ]
  },
  D: {
    label: 'いまは違う',
    when: '個別の再訪はしない',
    todo: [
      '追いかけないでください。ここで粘ると、次の機会そのものが無くなります',
      '定期の巡回に戻します',
      'ご使用量や料金が変わったときに、あらためて見させていただきます'
    ]
  },
  E: {
    label: '訪問をお断りされた',
    when: '訪問しない',
    todo: [
      '**その日のうちに名簿へ「訪問不可」を反映してください。**',
      'ここを取りこぼして再訪すると、JA全体の信用を落とします',
      '支店内で共有してください。あなた以外の職員が行ってしまいます'
    ]
  }
}

export interface RevisitReason {
  when: string
  say: string
  why: string
}

const monthsBetween = (from: { year: number; month: number }, to: { year: number; month: number }) =>
  (to.year - from.year) * 12 + (to.month - from.month)

const parsePeriod = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return { year, month }
}

/**
 * 再訪の口実を、実際のデータから作る。
 *
 * 素人がいちばん困るのは、再訪の理由がなくて「その後いかがですか」しか
 * 言えないこと。このアプリは料金改定の予定と、前回どの検針月で試算したかを
 * 知っているので、**言う理由のほうを用意できる**。
 */
export function revisitReasons(
  lastPeriod: { year: number; month: number } | null,
  today: { year: number; month: number },
  stoppedAt: string | null
): RevisitReason[] {
  const out: RevisitReason[] = []

  // いちばん効く口実。前回の続きから入れる
  if (stoppedAt) {
    out.push({
      when: 'いつでも',
      say: `前回は${stoppedAt}のことが気になっておられましたね。確認してまいりました。`,
      why:
        '前回の続きから入れると、初回のやり直しにならない。' +
        'お客様は「覚えていてくれた」と受け取る。素人はここを忘れて毎回1から話す'
    })
  }

  // 料金改定。こちらから連絡する正当な理由になる
  for (const revision of RATE_REVISIONS) {
    const from = parsePeriod(revision.fromPeriod)
    const ahead = monthsBetween(today, from)
    if (ahead >= -12 && ahead <= 3) {
      out.push({
        when:
          ahead > 0
            ? `${from.year}年${from.month}月の改定前（いまから${ahead}か月以内）`
            : `${from.year}年${from.month}月の改定後`,
        say: `${from.year}年${from.month}月の検針分から料金が変わりますので、あらためて見てみませんか。`,
        why: `${revision.summary}。改定は「お知らせに伺う」という形が作れる`
      })
    }
  }

  // 季節が変わった検針票。いちばん使う月で見ると、差額の見え方が変わる
  if (lastPeriod) {
    const summer = lastPeriod.month >= 6 && lastPeriod.month <= 9
    const winter = lastPeriod.month === 12 || lastPeriod.month <= 3
    if (summer) {
      out.push({
        when: '冬（1〜2月）の検針票が出たころ',
        say: 'いちばん電気を使う冬の検針票で、もう一度見てみませんか。',
        why:
          `前回は${lastPeriod.month}月の検針票でした。使用量が増える月のほうが差額も大きく出ます`
      })
    } else if (winter) {
      out.push({
        when: '夏（8〜9月）の検針票が出たころ',
        say: '冷房を使う夏の検針票でも見てみませんか。',
        why: `前回は${lastPeriod.month}月の検針票でした。季節を変えて見ると納得感が違います`
      })
    } else {
      out.push({
        when: '夏か冬の検針票が出たころ',
        say: 'いちばん電気を使う季節の検針票で、もう一度見てみませんか。',
        why: `前回は${lastPeriod.month}月の検針票で、使用量の少ない時期でした`
      })
    }
  }

  return out
}
