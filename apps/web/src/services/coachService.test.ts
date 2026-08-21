import { describe, it, expect } from 'vitest'
import { EMPTY_ANSWERS, HearingAnswers, HEARING, OBJECTIONS, OPENING, EXPLAIN } from '../data/playbook'
import {
  STAGES,
  stageIndex,
  nextStage,
  previousStage,
  answeredCount,
  hearingDone,
  openingFor,
  explainFor,
  estimateHint,
  preemptiveObjectionIds,
  orderedObjections,
  situationSummary,
  shouldStandDown
} from './coachService'

const answers = (partial: Partial<HearingAnswers> = {}): HearingAnswers => ({
  ...EMPTY_ANSWERS,
  ...partial
})

describe('商談の進み方', () => {
  it('準備から始まり、ふりかえりで終わる', () => {
    expect(STAGES[0].id).toBe('prepare')
    expect(STAGES[STAGES.length - 1].id).toBe('review')
  })

  it('前後に進める', () => {
    expect(nextStage('prepare')).toBe('opening')
    expect(previousStage('opening')).toBe('prepare')
  })

  it('端では止まる', () => {
    expect(previousStage('prepare')).toBeNull()
    expect(nextStage('review')).toBeNull()
  })

  it('知らない段階では位置を返さない', () => {
    // 型を外れた値が来ても落ちない。現場で画面が消えるのがいちばん困る
    expect(stageIndex('unknown' as never)).toBe(-1)
    expect(nextStage('unknown' as never)).toBeNull()
    expect(previousStage('unknown' as never)).toBeNull()
  })
})

describe('おうかがいの進み具合', () => {
  it('未回答なら0問', () => {
    expect(answeredCount(EMPTY_ANSWERS)).toBe(0)
    expect(hearingDone(EMPTY_ANSWERS)).toBe(false)
  })

  it('答えるたびに増える', () => {
    expect(answeredCount(answers({ interest: 'curious' }))).toBe(1)
    expect(answeredCount(answers({ interest: 'curious', household: 'single' }))).toBe(2)
  })

  it('全問答えたら完了', () => {
    const all = answers({
      interest: 'curious',
      household: 'small',
      daytime: 'away',
      allElectric: 'no',
      concern: 'price'
    })
    expect(answeredCount(all)).toBe(HEARING.length)
    expect(hearingDone(all)).toBe(true)
  })
})

describe('導入の台本', () => {
  it('温度感が分からなくても共通の台本は出す', () => {
    // 何も出ないと現場で使えない。共通のあいさつだけでも成立する
    const scripts = openingFor(EMPTY_ANSWERS)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toBe(OPENING.default)
  })

  it('温度感に応じて足す一言が変わる', () => {
    expect(openingFor(answers({ interest: 'first_time' }))[1]).toBe(OPENING.first_time)
    expect(openingFor(answers({ interest: 'comparing' }))[1]).toBe(OPENING.comparing)
  })

  it('他社と比較中のお客様には、他社の悪口を言わないよう注意が出る', () => {
    const script = OPENING.comparing
    expect(script.avoid?.some(a => a.includes('否定'))).toBe(true)
  })
})

describe('説明の重点', () => {
  it('気がかりが未回答なら共通の型', () => {
    expect(explainFor(EMPTY_ANSWERS)).toBe(EXPLAIN.default)
  })

  it('気がかりごとに変わる', () => {
    expect(explainFor(answers({ concern: 'paperwork' }))).toBe(EXPLAIN.paperwork)
    expect(explainFor(answers({ concern: 'reliability' }))).toBe(EXPLAIN.reliability)
  })

  it('「今のままで困っていない」方には、煽らないよう注意が出る', () => {
    // 押し売りの型を入れないことがこの画面の前提
    const script = EXPLAIN.satisfied
    expect(script.avoid?.some(a => a.includes('煽る'))).toBe(true)
  })

  it('「本当に安くなるのか」には断定しないよう注意が出る', () => {
    expect(EXPLAIN.price.avoid?.some(a => a.includes('絶対'))).toBe(true)
  })
})

describe('どのプランで試算するか', () => {
  it('オール電化なら時間帯別へ寄せ、かんたん試算は使わせない', () => {
    // 時間帯別は昼夜の内訳が要る。電気料金だけからは戻せない
    const hint = estimateHint(answers({ allElectric: 'yes' }))
    expect(hint.lookFor).toContain('電化Style')
    expect(hint.simpleOk).toBe(false)
  })

  it('ガスも使っているなら従量電灯へ寄せる', () => {
    const hint = estimateHint(answers({ allElectric: 'no' }))
    expect(hint.lookFor).toContain('従量電灯A')
    expect(hint.simpleOk).toBe(true)
  })

  it('分からないときは推測せず検針票を見るよう促す', () => {
    const hint = estimateHint(answers({ allElectric: 'unknown' }))
    expect(hint.reason).toContain('推測せず')
    expect(hint.simpleOk).toBe(true)
  })

  it('未回答でも案内は出す', () => {
    expect(estimateHint(EMPTY_ANSWERS).lookFor).not.toBe('')
  })
})

describe('先回りする反論', () => {
  it('気がかりに応じて出しておく反論が決まる', () => {
    expect(preemptiveObjectionIds(answers({ concern: 'satisfied' }))).toContain('no_need')
    expect(preemptiveObjectionIds(answers({ concern: 'price' }))).toContain('not_cheaper')
    expect(preemptiveObjectionIds(answers({ concern: 'paperwork' }))).toContain('cancel_fee')
    expect(preemptiveObjectionIds(answers({ concern: 'reliability' }))).toContain('suspicious')
    expect(preemptiveObjectionIds(answers({ concern: 'unsure' }))).toContain('think')
  })

  it('未回答なら先回りしない', () => {
    expect(preemptiveObjectionIds(EMPTY_ANSWERS)).toEqual([])
  })

  it('先回りぶんが先頭に並ぶ', () => {
    const ordered = orderedObjections(answers({ concern: 'satisfied' }))
    expect(ordered[0].id).toBe('no_need')
    expect(ordered[1].id).toBe('think')
  })

  it('並べ替えても件数は変わらない（どの反論も消さない）', () => {
    const ordered = orderedObjections(answers({ concern: 'price' }))
    expect(ordered).toHaveLength(OBJECTIONS.length)
    expect(new Set(ordered.map(o => o.id)).size).toBe(OBJECTIONS.length)
  })

  it('未回答でも全件そのまま出す', () => {
    expect(orderedObjections(EMPTY_ANSWERS)).toHaveLength(OBJECTIONS.length)
  })
})

describe('聞き取りの要約', () => {
  it('まだ聞いていないときはその旨を出す', () => {
    expect(situationSummary(EMPTY_ANSWERS)).toContain('まだ')
  })

  it('答えたぶんだけ並ぶ', () => {
    const summary = situationSummary(answers({ household: 'large', concern: 'price' }))
    expect(summary).toContain('4人以上')
    expect(summary).toContain('気がかり')
  })
})

describe('高くなる結果のときは引く', () => {
  it('マイナスなら引く', () => {
    expect(shouldStandDown(-1)).toBe(true)
    expect(shouldStandDown(-9504)).toBe(true)
  })

  it('プラスや同額なら通常どおり', () => {
    expect(shouldStandDown(0)).toBe(false)
    expect(shouldStandDown(5231)).toBe(false)
  })

  it('まだ試算していないなら判断しない', () => {
    expect(shouldStandDown(null)).toBe(false)
  })
})

describe('台本そのものの決まり', () => {
  it('すべての台本に「なぜ」がある（棒読みを防ぐ）', () => {
    const scripts = [
      ...Object.values(OPENING),
      ...Object.values(EXPLAIN),
      ...OBJECTIONS.map(o => o.script)
    ]
    for (const s of scripts) {
      expect(s.why.length).toBeGreaterThan(10)
    }
  })

  it('「高くなるのですね」への返しは、それでも勧めないと明示している', () => {
    const o = OBJECTIONS.find(x => x.id === 'not_cheaper')!
    expect(o.script.avoid?.some(a => a.includes('それでもお勧め'))).toBe(true)
  })

  it('おうかがいに個人を特定する項目が無い（ルール9）', () => {
    const asks = HEARING.map(q => q.ask).join(' ')
    for (const pii of ['お名前', '氏名', 'ご住所', '電話', 'メール', 'お客様番号']) {
      expect(asks).not.toContain(pii)
    }
  })
})
