import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalesCoach from './SalesCoach'

function show(lastAnnualSavingsYen: number | null = null) {
  const onOpenEstimate = vi.fn()
  const onBack = vi.fn()
  render(
    <SalesCoach
      onOpenEstimate={onOpenEstimate}
      onBack={onBack}
      lastAnnualSavingsYen={lastAnnualSavingsYen}
    />
  )
  return { onOpenEstimate, onBack }
}

/** 段階の帯から直接その段階へ飛ぶ */
async function goTo(short: string) {
  const rail = screen.getByRole('navigation', { name: '商談の進み方' })
  await userEvent.click(within(rail).getByRole('button', { name: short }))
}

describe('商談ナビ', () => {
  it('準備から始まる', () => {
    show()
    expect(screen.getByText('持っていくもの')).toBeInTheDocument()
    expect(screen.getByText('今日の目的')).toBeInTheDocument()
  })

  it('今日の目的が「契約を取ること」ではないと明示する', () => {
    // ここが逆になると押し売りになる。台本全体の前提なので固定する
    show()
    expect(
      screen.getByText(/判断できる材料をお渡しすること/, { selector: '.say-line' })
    ).toBeInTheDocument()
  })

  it('段階の帯から好きな段階へ飛べる', async () => {
    show()
    await goTo('聞く')
    expect(screen.getByText(/1 \/ 5 問|0 \/ 5 問/)).toBeInTheDocument()
  })

  it('最初の段階では「ホームへ」戻る', async () => {
    const { onBack } = show()
    await userEvent.click(screen.getByRole('button', { name: 'ホームへ' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('導入', () => {
  it('そのまま読める言葉が出る', async () => {
    show()
    await goTo('導入')
    expect(screen.getAllByText('このまま読めます').length).toBeGreaterThan(0)
    expect(screen.getByText(/3分だけお時間をいただけますか/)).toBeInTheDocument()
  })

  it('お客様の様子を選ぶと、足す一言が変わる', async () => {
    show()
    await goTo('導入')
    expect(screen.queryByText(/他社さんからもお話があったのですね/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '他社からも勧誘を受けている' }))
    expect(screen.getByText(/他社さんからもお話があったのですね/)).toBeInTheDocument()
  })
})

describe('おうかがい', () => {
  it('5問すべてが読み上げる形で出る', async () => {
    show()
    await goTo('聞く')
    expect(screen.getByText(/これまでに考えられたことはありますか/)).toBeInTheDocument()
    expect(screen.getByText(/ご家族は何人でお住まいですか/)).toBeInTheDocument()
    expect(screen.getByText(/日中はご在宅のことが多いですか/)).toBeInTheDocument()
    expect(screen.getByText(/給湯やコンロは電気ですか/)).toBeInTheDocument()
    expect(screen.getByText(/いちばん気になるのはどんなこと/)).toBeInTheDocument()
  })

  it('答えると、その答えが後で何に効くかを示す', async () => {
    show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: '4人以上' }))
    expect(screen.getByText(/差額が大きく出やすい/)).toBeInTheDocument()
  })

  it('答えた数が出る', async () => {
    show()
    await goTo('聞く')
    expect(screen.getByText('0 / 5 問')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'お一人' }))
    expect(screen.getByText('1 / 5 問')).toBeInTheDocument()
  })

  it('聞き取った内容が画面上部に残る', async () => {
    show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: 'オール電化' }))
    expect(screen.getByText(/オール電化/, { selector: '.situation' })).toBeInTheDocument()
  })
})

describe('試算', () => {
  it('検針票の見せていただき方が出る', async () => {
    show()
    await goTo('試算')
    expect(screen.getByText(/「ご契約種別」と「ご使用量」です/)).toBeInTheDocument()
  })

  it('くわしい試算をひらける', async () => {
    const { onOpenEstimate } = show()
    await goTo('試算')
    await userEvent.click(screen.getByRole('button', { name: '検針票から試算する' }))
    expect(onOpenEstimate).toHaveBeenCalledWith('detailed')
  })

  it('オール電化ならかんたん試算に進ませない', async () => {
    // 昼夜の内訳が要るため、電気料金だけからは戻せない
    show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: 'オール電化' }))
    await goTo('試算')
    expect(screen.queryByRole('button', { name: /かんたん試算/ })).not.toBeInTheDocument()
    expect(screen.getByText(/電気料金だけでは試算できません/)).toBeInTheDocument()
  })

  it('ガスも使っているならかんたん試算にも進める', async () => {
    const { onOpenEstimate } = show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: 'ガスも使っている' }))
    await goTo('試算')
    await userEvent.click(screen.getByRole('button', { name: /かんたん試算/ }))
    expect(onOpenEstimate).toHaveBeenCalledWith('simple')
  })
})

describe('説明', () => {
  it('気がかりに合わせた伝え方が出る', async () => {
    show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: '手続きが面倒そう' }))
    await goTo('説明')
    expect(screen.getByText(/工事も、立ち会いも、原則ありません/)).toBeInTheDocument()
  })

  it('高くなる試算だったときは、勧めないよう止める', async () => {
    show(-9504)
    await goTo('説明')
    expect(screen.getByText(/いまのご契約のほうがお安い結果です/)).toBeInTheDocument()
    expect(screen.getByText(/お勧めしないでください/)).toBeInTheDocument()
  })

  it('安くなる試算なら通常の伝え方が出る', async () => {
    show(5231)
    await goTo('説明')
    expect(screen.queryByText(/お勧めしないでください/)).not.toBeInTheDocument()
    expect(screen.getByText('試算結果の伝え方')).toBeInTheDocument()
  })

  it('高くなる結果からは、そのまま読める言葉へ飛べる', async () => {
    show(-9504)
    await goTo('説明')
    await userEvent.click(screen.getByRole('button', { name: 'その言葉を見る' }))
    expect(screen.getByText(/「（試算の結果）高くなるのですね」/)).toBeInTheDocument()
  })
})

describe('ご不安・ご質問', () => {
  it('お客様の言葉のまま並ぶ', async () => {
    show()
    await goTo('不安')
    expect(screen.getByText(/「今のままでいい」/)).toBeInTheDocument()
    expect(screen.getByText(/「解約金がかかるのでは」/)).toBeInTheDocument()
  })

  it('先ほどのお答えから、出そうな反論に印が付く', async () => {
    show()
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: '今のままで困っていない' }))
    await goTo('不安')
    expect(screen.getAllByText('出そう').length).toBeGreaterThan(0)
  })

  it('開くと、そのまま読める言葉と理由が出る', async () => {
    show()
    await goTo('不安')
    await userEvent.click(screen.getByText(/「解約金がかかるのでは」/))
    expect(screen.getByText(/こちらで断定できませんので/)).toBeInTheDocument()
    expect(screen.getByText(/確認せずに「かかりません」と答えること/)).toBeInTheDocument()
  })
})

describe('お手続きのご案内', () => {
  it('決めるのはお客様だと言う言葉が入っている', async () => {
    // 心理的リアクタンスを避ける。ここが抜けると圧になる
    show()
    await goTo('手続き')
    expect(screen.getByText(/お決めになるのはお客様ですので/)).toBeInTheDocument()
  })

  it('期限を作らないよう注意が出る', async () => {
    show()
    await goTo('手続き')
    expect(screen.getByText(/「今日だけ」「今なら」と期限を作ること/)).toBeInTheDocument()
  })

  it('確認事項はJAの説明書面が正だと明記する', async () => {
    show()
    await goTo('手続き')
    expect(screen.getByText(/JAの説明書面が正/)).toBeInTheDocument()
  })

  it('確認事項にチェックを入れられる', async () => {
    show()
    await goTo('手続き')
    const box = screen.getAllByRole('checkbox')[0]
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(box).toBeChecked()
  })

  it('高くなる結果だったときは、手続きに進ませない', async () => {
    show(-9504)
    await goTo('手続き')
    expect(screen.getByText(/お手続きに進まないでください/)).toBeInTheDocument()
  })
})

describe('ふりかえり', () => {
  it('その場で3つだけ振り返る', async () => {
    show()
    await goTo('振返')
    expect(screen.getByText('今日のふりかえり')).toBeInTheDocument()
    expect(screen.getByText(/押してしまった場面はありましたか/)).toBeInTheDocument()
  })
})

describe('いつでも見える戒め', () => {
  it('どの段階でも「言わないこと」を開ける', async () => {
    show()
    await userEvent.click(screen.getByText('今日ぜったいに言わないこと'))
    expect(screen.getByText(/「絶対に」「必ず」安くなる/)).toBeInTheDocument()
    expect(screen.getByText(/高くなると分かっているのに勧めること/)).toBeInTheDocument()
  })
})
