import { describe, it, expect } from 'vitest'
import {
  ConfidenceInput,
  judgeConfidence,
  revisitReasons,
  NEXT_ACTIONS,
  WEIGHTS
} from './confidence'

const input = (partial: Partial<ConfidenceInput> = {}): ConfidenceInput => ({
  reached: 'closing',
  annualSavingsYen: 5231,
  objections: [],
  nextVisitAgreed: false,
  materialsAccepted: false,
  feel: null,
  refusedFutureVisits: false,
  ...partial
})

describe('訪問をお断りされたら、点数に関係なく打ち切る', () => {
  it('どんなに条件が良くても E', () => {
    // ここを取りこぼして再訪するのが、いちばん信用を落とす
    const r = judgeConfidence(
      input({
        refusedFutureVisits: true,
        nextVisitAgreed: true,
        annualSavingsYen: 50000,
        materialsAccepted: true,
        feel: 'good'
      })
    )
    expect(r.rank).toBe('E')
    expect(r.reasons.join()).toContain('二度と訪問しません')
  })

  it('E の次の一手は、その日のうちに名簿へ反映すること', () => {
    expect(NEXT_ACTIONS.E.when).toBe('訪問しない')
    expect(NEXT_ACTIONS.E.todo.join()).toContain('訪問不可')
    expect(NEXT_ACTIONS.E.todo.join()).toContain('支店内で共有')
  })
})

describe('高くなる結果なら勧めない', () => {
  it('確度ではなく、追いかけない側に倒す', () => {
    const r = judgeConfidence(input({ annualSavingsYen: -9504, nextVisitAgreed: true }))
    expect(r.rank).toBe('D')
    expect(r.reasons.join()).toContain('お安い結果')
  })

  it('D は個別の再訪をしない', () => {
    expect(NEXT_ACTIONS.D.when).toBe('個別の再訪はしない')
    expect(NEXT_ACTIONS.D.todo.join()).toContain('追いかけないでください')
  })
})

describe('次回の約束があれば最上位', () => {
  it('ほかが弱くても A', () => {
    // 日が決まっているのが、いちばん強い材料
    const r = judgeConfidence(
      input({ nextVisitAgreed: true, reached: 'opening', annualSavingsYen: null })
    )
    expect(r.rank).toBe('A')
  })

  it('A の次の一手は、その日のうちに予定へ入れること', () => {
    expect(NEXT_ACTIONS.A.when).toBe('約束した日')
    expect(NEXT_ACTIONS.A.todo.join()).toContain('予定に入れて')
  })
})

describe('起きた事実から点を付ける', () => {
  it('検針票を見せていただけたら加点する', () => {
    const before = judgeConfidence(input({ reached: 'hearing' })).score
    const after = judgeConfidence(input({ reached: 'estimate' })).score
    expect(after - before).toBe(WEIGHTS.reachedEstimate)
  })

  it('前向きな反論（解約金は？）は加点する', () => {
    // 買う気のない人は解約金の質問をしない
    const before = judgeConfidence(input()).score
    const after = judgeConfidence(input({ objections: ['cancel_fee'] })).score
    expect(after - before).toBe(WEIGHTS.positiveObjection)
  })

  it('後ろ向きな反論は減点する', () => {
    const before = judgeConfidence(input()).score
    const after = judgeConfidence(input({ objections: ['no_need'] })).score
    expect(after - before).toBe(WEIGHTS.negativeObjection)
  })

  it('差額が大きいほど加点する', () => {
    expect(judgeConfidence(input({ annualSavingsYen: 20000 })).score).toBeGreaterThan(
      judgeConfidence(input({ annualSavingsYen: 5000 })).score
    )
    expect(judgeConfidence(input({ annualSavingsYen: 5000 })).score).toBeGreaterThan(
      judgeConfidence(input({ annualSavingsYen: 500 })).score
    )
  })

  it('資料をお受け取りいただけたら加点する', () => {
    const before = judgeConfidence(input()).score
    const after = judgeConfidence(input({ materialsAccepted: true })).score
    expect(after - before).toBe(WEIGHTS.materialsAccepted)
  })

  it('感触は、ほかのどの項目よりも軽い', () => {
    // 素人の感触は当てにならず、ベテランでも自分に都合よく見る
    const good = judgeConfidence(input({ feel: 'good' })).score
    const poor = judgeConfidence(input({ feel: 'poor' })).score
    expect(good - poor).toBe(WEIGHTS.feel * 2)
    expect(WEIGHTS.feel).toBeLessThan(WEIGHTS.reachedEstimate)
    expect(WEIGHTS.feel).toBeLessThan(WEIGHTS.positiveObjection)
    expect(WEIGHTS.feel).toBeLessThan(WEIGHTS.nextVisitAgreed)
  })

  it('感触だけでは、確度をひとつ上げられない', () => {
    // 「手応えがあった」だけで B にならないことを固定する
    const neutral = judgeConfidence(input({ reached: 'hearing', annualSavingsYen: null }))
    const good = judgeConfidence(
      input({ reached: 'hearing', annualSavingsYen: null, feel: 'good' })
    )
    expect(neutral.rank).toBe(good.rank)
  })
})

describe('確度のわかれ目', () => {
  const rankOf = (partial: Partial<ConfidenceInput>) => judgeConfidence(input(partial)).rank

  it('材料がそろえば B', () => {
    // 検針票(+2) 前向きな反論(+2) 差額1万超(+2) 資料(+1) = 7
    expect(
      rankOf({
        reached: 'closing',
        objections: ['cancel_fee'],
        annualSavingsYen: 20000,
        materialsAccepted: true
      })
    ).toBe('B')
  })

  it('試算までは進んだが決め手が無ければ C', () => {
    expect(rankOf({ reached: 'estimate', annualSavingsYen: 5231 })).toBe('C')
  })

  it('後ろ向きな反論で打ち消されれば D', () => {
    expect(
      rankOf({ reached: 'estimate', annualSavingsYen: null, objections: ['no_need'] })
    ).toBe('D')
  })

  it('なぜその確度なのかを必ず出す', () => {
    // 判定を鵜呑みにさせない
    const r = judgeConfidence(input({ reached: 'estimate', objections: ['cancel_fee'] }))
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(r.reasons.join()).toContain('検針票')
  })
})

describe('再訪の口実', () => {
  const AUG = { year: 2026, month: 8 }

  it('前回どこで止まったかが、いちばん強い口実になる', () => {
    const r = revisitReasons(AUG, AUG, '解約金がかかるのでは')
    expect(r[0].say).toContain('解約金がかかるのでは')
    expect(r[0].say).toContain('確認してまいりました')
  })

  it('料金改定を口実にできる', () => {
    // 「お知らせに伺う」という形が作れる
    const r = revisitReasons(AUG, { year: 2026, month: 9 }, null)
    expect(r.some(x => x.say.includes('2026年11月'))).toBe(true)
  })

  it('改定のあとでも、しばらくは口実になる', () => {
    // 「先月から変わりました」で伺える
    const r = revisitReasons(AUG, { year: 2026, month: 12 }, null)
    const revision = r.find(x => x.say.includes('2026年11月'))
    expect(revision?.when).toContain('改定後')
  })

  it('改定から離れた時期には出さない', () => {
    const r = revisitReasons(AUG, { year: 2029, month: 5 }, null)
    expect(r.some(x => x.say.includes('料金が変わります'))).toBe(false)
  })

  it('夏の検針票なら、冬に見直す口実を出す', () => {
    const r = revisitReasons({ year: 2026, month: 8 }, AUG, null)
    expect(r.some(x => x.when.includes('冬'))).toBe(true)
  })

  it('冬の検針票なら、夏に見直す口実を出す', () => {
    const r = revisitReasons({ year: 2026, month: 1 }, AUG, null)
    expect(r.some(x => x.when.includes('夏'))).toBe(true)
  })

  it('中間の月なら、いちばん使う季節に見直す口実を出す', () => {
    const r = revisitReasons({ year: 2026, month: 5 }, AUG, null)
    expect(r.some(x => x.why.includes('使用量の少ない時期'))).toBe(true)
  })

  it('まだ試算していなければ、季節の口実は出さない', () => {
    const r = revisitReasons(null, AUG, null)
    expect(r.every(x => !x.when.includes('検針票が出たころ'))).toBe(true)
  })

  it('口実には必ず理由が添う', () => {
    for (const r of revisitReasons(AUG, AUG, '今のままでいい')) {
      expect(r.why.length).toBeGreaterThan(10)
    }
  })
})
