import { Script } from '../data/playbook'

/**
 * 試算の結果を、そのまま声に出せる言葉にする。
 *
 * **数字は1つも作らない。** 画面に出ている値をそのまま並べ替えるだけで、
 * ここでは足し算も割り算もしない（CLAUDE.md ルール1・2）。
 * 月額は calc-core が出した月額をそのまま使い、年額を12で割ったりしない。
 *
 * 台本だけ用意しても、素人は自分の言葉で数字を言えない。
 * 「1年でこちら」と書いてあっても、いくらかは画面を見比べないと分からず、
 * その数秒で目線が落ちて話が切れる。**読める形にして初めて台本になる。**
 */

export interface EstimateSummary {
  scenarioId: string
  totalKwh: number
  /** 年間の差額。マイナスは高くなる。まだ試算していなければ null */
  annualSavingsYen: number | null
  /** 月あたりの差額。calc-core が出した月額の差をそのまま */
  monthlySavingsYen: number | null
  currentPlanName: string
  recommendedPlanName: string
  /** 年間の料金。積み上げができなかった月は null */
  annualCurrentYen: number | null
  annualRecommendedYen: number | null
  /** 「差が出ている理由」の箇条書き */
  highlights: string[]
  /** 差額の内訳。どの費目で差がついているかの判定に使う */
  parts: Array<{ key: string | null; label: string; differenceYen: number }>
  /** 1年ぶんの見積もり方 */
  annualMethod: 'flat' | 'seasonal' | null
  period: { year: number; month: number }
}

/** 声に出す用。「￥13,428」ではなく「13,428円」と読ませる */
const yen = (amount: number): string => `${Math.abs(amount).toLocaleString('ja-JP')}円`

const METHOD_NOTE: Record<'flat' | 'seasonal', string> = {
  flat: '検針票と同じご使用量が1年つづくものとして計算しています。',
  seasonal: '夏と冬は多め、春と秋は少なめに見込んで、1年ぶんを積み上げています。'
}

/** 帯に出す一文。どの段階にいても、いまいくらの話をしているかが分かる */
export function estimateHeadline(e: EstimateSummary | null): string | null {
  if (!e || e.annualSavingsYen === null) return null
  const { annualSavingsYen: annual } = e
  if (annual === 0) return `試算：${e.recommendedPlanName} とほぼ同額`
  return annual > 0
    ? `試算：${e.recommendedPlanName} で年間 ${yen(annual)} おトク`
    : `試算：いまのご契約のほうが年間 ${yen(annual)} お安い`
}

/**
 * 説明の段階で読む言葉。
 *
 * 高くなる・同額・安くなるで、言うことがまるで変わる。
 * 安くならないときに「安くなります」の台本が出ていたら、このアプリの筋が通らない。
 */
export function estimateTalk(e: EstimateSummary | null): Script | null {
  if (!e || e.annualSavingsYen === null) return null
  const annual = e.annualSavingsYen
  const say: string[] = []

  if (annual < 0) {
    say.push(
      `正直に申し上げますと、いまの${e.currentPlanName}のほうが、1年で ${yen(annual)} ほどお安い結果でした。`,
      '今日は無理にお勧めいたしません。',
      'ご使用量が変わったときや、料金が改定されたときに、あらためて見させていただきます。'
    )
    return {
      say,
      why:
        '**ここで勧めたら、この先ずっと信用されない。** 高くなると分かっている提案を' +
        '通してしまうと、次の検針票で必ず気づかれる。引いた営業のほうが、次に呼ばれる。',
      avoid: [
        '「長い目で見れば」と条件を足して安く見せること',
        '別のプランを探し始めて、その場を長引かせること'
      ]
    }
  }

  if (annual === 0) {
    say.push(
      'ほとんど差が出ませんでした。',
      '無理に変えていただく必要はないと思います。',
      '数字だけ置いていきますので、ご使用量が変わったときに見比べてみてください。'
    )
    return {
      say,
      why:
        '差が出ないことも結果のうち。「せっかく来たのだから」で勧めると、' +
        'お客様は手間だけを負う。同額なら同額と言うほうが、次につながる。'
    }
  }

  // 安くなる場合。年間の料金を両方言えると「差」に実感が出る
  if (e.annualCurrentYen !== null && e.annualRecommendedYen !== null) {
    say.push(
      `いまの${e.currentPlanName}ですと、1年でおよそ ${yen(e.annualCurrentYen)}です。`,
      `${e.recommendedPlanName}ですと ${yen(e.annualRecommendedYen)}。`
    )
  }
  say.push(`差はこの1つ、年間 ${yen(annual)} です。`)
  if (e.monthlySavingsYen !== null && e.monthlySavingsYen > 0) {
    say.push(`月にしますと ${yen(e.monthlySavingsYen)} ほどになります。`)
  }
  if (e.annualMethod) say.push(METHOD_NOTE[e.annualMethod])
  say.push('燃料費調整額は毎月変わりますので、目安としてご覧ください。')

  return {
    say,
    why:
      '**覚えていただく数字は1つだけ**にする（年間の差額）。月額・年額・削減率を' +
      '全部言うと何も残らない。年間の料金を先に2つ並べるのは、差額を「引き算の答え」' +
      'として見ていただくため。いきなり差額だけ言うと、大きいのか小さいのか判断できない。',
    avoid: [
      '「絶対に安くなります」と断定すること（燃料費調整額は毎月変わる）',
      '削減率（何％お得）を足すこと。数字が2つになると、どちらも残らない'
    ]
  }
}

/**
 * 差のつき方を一言で。
 *
 * お客様がいちばん知りたいのは「うちの場合どうなのか」で、
 * **「使うほど効くのか、いつも一定なのか」**は生活実感に直結する。
 * 内訳のどこで差がついているかから決めるので、推測は入らない。
 */
export function shapeLine(e: EstimateSummary | null): string | null {
  if (!e || e.annualSavingsYen === null || e.annualSavingsYen <= 0) return null
  const of = (key: string) =>
    Math.abs(e.parts.find(p => p.key === key)?.differenceYen ?? 0)
  const base = of('base')
  const energy = of('energy')
  if (base === 0 && energy === 0) return null
  if (energy > base * 2) {
    return (
      'この差は、使った分の単価の違いから出ています。' +
      'ですので、電気をたくさんお使いになる月ほど、差は大きくなります。'
    )
  }
  if (base > energy * 2) {
    return (
      'この差は、毎月の基本になる料金の違いから出ています。' +
      'ですので、お使いになる量に関わらず、毎月ほぼ同じだけ変わります。'
    )
  }
  return '毎月の基本の料金と、使った分の単価の、両方で差がついています。'
}

/** 「安くなる理由」を1つだけ。内訳の先頭が、いちばん効いている費目 */
export function reasonLine(e: EstimateSummary | null): string | null {
  if (!e || e.annualSavingsYen === null || e.annualSavingsYen <= 0) return null
  return e.highlights[0] ?? null
}

/**
 * 解約金を聞かれたときに言える一言。
 *
 * 素人は「解約金はかからないと思います」と答えてしまう。それは調べていない
 * 推測で、外れたときに取り返しがつかない。**分かっているのは差額のほうだけ**なので、
 * 分かっている側から話す。
 */
export function breakEvenLine(e: EstimateSummary | null): string | null {
  if (!e || e.annualSavingsYen === null || e.annualSavingsYen <= 0) return null
  return (
    `年間で ${yen(e.annualSavingsYen)} 変わる試算ですので、` +
    `仮に解約金が ${yen(e.annualSavingsYen)} を下回るのでしたら、1年で取り返せる計算になります。` +
    'まずは、いまのご契約に解約金があるかどうかをご確認いただけますか。'
  )
}

/** 試算の段階で、もう試算が済んでいるときに出す要点 */
export function estimateRecap(e: EstimateSummary | null): string[] {
  if (!e || e.annualSavingsYen === null) return []
  const lines = [
    `ご使用量 ${e.totalKwh.toLocaleString('ja-JP')} kWh／${e.period.year}年${e.period.month}月の検針分`,
    `現在のご契約：${e.currentPlanName}`,
    `比べた先：${e.recommendedPlanName}`
  ]
  const headline = estimateHeadline(e)
  if (headline) lines.push(headline.replace(/^試算：/, '結果：'))
  return lines
}
