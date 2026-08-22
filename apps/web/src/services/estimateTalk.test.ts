import { describe, it, expect } from 'vitest'
import {
  EstimateSummary,
  estimateTalk,
  estimateHeadline,
  estimateRecap,
  reasonLine,
  breakEvenLine
} from './estimateTalk'

const summary = (partial: Partial<EstimateSummary> = {}): EstimateSummary => ({
  scenarioId: 'chugoku_juryo_a',
  totalKwh: 600,
  annualSavingsYen: 13428,
  monthlySavingsYen: 1119,
  currentPlanName: '中国電力 従量電灯A',
  recommendedPlanName: 'JAでんき 従量電灯A',
  annualCurrentYen: 231624,
  annualRecommendedYen: 218196,
  highlights: ['第1段階の単価が 1.39円 安いこと'],
  annualMethod: 'flat',
  period: { year: 2026, month: 8 },
  ...partial
})

describe('まだ試算していないときは、何も言わせない', () => {
  it('台本を出さない', () => {
    expect(estimateTalk(null)).toBeNull()
    expect(estimateTalk(summary({ annualSavingsYen: null }))).toBeNull()
  })

  it('帯の一文も出さない', () => {
    expect(estimateHeadline(null)).toBeNull()
    expect(estimateHeadline(summary({ annualSavingsYen: null }))).toBeNull()
  })

  it('要点も出さない', () => {
    expect(estimateRecap(null)).toEqual([])
  })
})

describe('安くなるとき', () => {
  it('年間の料金を2つ並べてから、差額を言う', () => {
    // いきなり差額だけ言われても、大きいのか小さいのか判断できない
    const say = estimateTalk(summary())!.say
    expect(say[0]).toContain('231,624円')
    expect(say[0]).toContain('中国電力 従量電灯A')
    expect(say[1]).toContain('218,196円')
    expect(say[1]).toContain('JAでんき 従量電灯A')
    expect(say[2]).toContain('13,428円')
  })

  it('月額は画面に出ている値をそのまま読む（年額を12で割らない）', () => {
    // 割ると画面と1円ずれる（ルール2）
    const say = estimateTalk(summary())!.say.join()
    expect(say).toContain('1,119円')
  })

  it('月額が分からなければ、月の話をしない', () => {
    const say = estimateTalk(summary({ monthlySavingsYen: null }))!.say.join()
    expect(say).not.toContain('月にしますと')
  })

  it('年間の料金が出せなかったときは、差額だけ言う', () => {
    const say = estimateTalk(
      summary({ annualCurrentYen: null, annualRecommendedYen: null })
    )!.say
    expect(say[0]).toContain('13,428円')
  })

  it('どうやって1年ぶんを見たかを必ず添える', () => {
    expect(estimateTalk(summary({ annualMethod: 'flat' }))!.say.join()).toContain(
      '1年つづくものとして'
    )
    expect(estimateTalk(summary({ annualMethod: 'seasonal' }))!.say.join()).toContain(
      '夏と冬は多め'
    )
  })

  it('積み上げていないときは、見積もり方の話をしない', () => {
    const say = estimateTalk(summary({ annualMethod: null }))!.say.join()
    expect(say).not.toContain('1年つづくものとして')
    expect(say).not.toContain('夏と冬は多め')
  })

  it('目安であることを必ず言う', () => {
    expect(estimateTalk(summary())!.say.join()).toContain('燃料費調整額は毎月変わります')
  })

  it('断定と、数字を増やすことを戒める', () => {
    const avoid = estimateTalk(summary())!.avoid!.join()
    expect(avoid).toContain('絶対に安くなります')
    expect(avoid).toContain('削減率')
  })
})

describe('高くなるとき', () => {
  const worse = summary({ annualSavingsYen: -9504, monthlySavingsYen: -792 })

  it('正直に言って、勧めない', () => {
    const say = estimateTalk(worse)!.say
    expect(say[0]).toContain('9,504円')
    expect(say[0]).toContain('お安い結果')
    expect(say.join()).toContain('無理にお勧めいたしません')
  })

  it('安くなる側の言葉が混ざらない', () => {
    expect(estimateTalk(worse)!.say.join()).not.toContain('おトク')
  })

  it('条件を足して安く見せることを戒める', () => {
    expect(estimateTalk(worse)!.avoid!.join()).toContain('長い目で見れば')
  })
})

describe('同額のとき', () => {
  it('無理に変える必要はないと言う', () => {
    const say = estimateTalk(summary({ annualSavingsYen: 0, monthlySavingsYen: 0 }))!.say
    expect(say.join()).toContain('ほとんど差が出ませんでした')
    expect(say.join()).toContain('無理に変えていただく必要はない')
  })
})

describe('帯に出す一文', () => {
  it('安くなるときは、おトク額を出す', () => {
    expect(estimateHeadline(summary())).toBe('試算：JAでんき 従量電灯A で年間 13,428円 おトク')
  })

  it('高くなるときは、そう書く', () => {
    expect(estimateHeadline(summary({ annualSavingsYen: -9504 }))).toContain(
      'いまのご契約のほうが年間 9,504円 お安い'
    )
  })

  it('同額のときは、同額と書く', () => {
    expect(estimateHeadline(summary({ annualSavingsYen: 0 }))).toContain('ほぼ同額')
  })
})

describe('「なぜ安くなるのか」の答え', () => {
  it('内訳の先頭をそのまま使う（営業が理由を作らない）', () => {
    expect(reasonLine(summary())).toBe('第1段階の単価が 1.39円 安いこと')
  })

  it('内訳が出せなかったときは、何も言わせない', () => {
    expect(reasonLine(summary({ highlights: [] }))).toBeNull()
  })

  it('高くなるときには出さない', () => {
    expect(reasonLine(summary({ annualSavingsYen: -9504 }))).toBeNull()
  })
})

describe('解約金を聞かれたとき', () => {
  it('分かっている差額の側から話す', () => {
    // 「解約金はかからないと思います」は調べていない推測で、外れたら取り返しがつかない
    const line = breakEvenLine(summary())!
    expect(line).toContain('13,428円')
    expect(line).toContain('1年で取り返せる')
    expect(line).toContain('ご確認いただけますか')
  })

  it('解約金があると決めつけない', () => {
    expect(breakEvenLine(summary())).toContain('仮に')
  })

  it('高くなるときは出さない', () => {
    expect(breakEvenLine(summary({ annualSavingsYen: -9504 }))).toBeNull()
    expect(breakEvenLine(summary({ annualSavingsYen: 0 }))).toBeNull()
  })
})

describe('試算の段階に出す要点', () => {
  it('何をどの条件で試算したかが分かる', () => {
    const lines = estimateRecap(summary()).join('\n')
    expect(lines).toContain('600 kWh')
    expect(lines).toContain('2026年8月')
    expect(lines).toContain('中国電力 従量電灯A')
    expect(lines).toContain('JAでんき 従量電灯A')
    expect(lines).toContain('結果：')
  })
})
