import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalesCoach, { emphasize } from './SalesCoach'

function show(
  annualSavingsYen: number | null = null,
  totalKwh = 348,
  monthlySavingsYen: number | null = null
) {
  const onOpenEstimate = vi.fn()
  const onBack = vi.fn()
  render(
    <SalesCoach
      onOpenEstimate={onOpenEstimate}
      onBack={onBack}
      today="2026-08-22"
      lastEstimate={
        annualSavingsYen === null
          ? null
          : {
              scenarioId: 'chugoku_juryo_a',
              totalKwh,
              annualSavingsYen,
              monthlySavingsYen: monthlySavingsYen ?? null,
              currentPlanName: '中国電力 従量電灯A',
              recommendedPlanName: 'JAでんき 従量電灯A',
              annualCurrentYen: 231624,
              annualRecommendedYen: 231624 - annualSavingsYen,
              highlights: ['第1段階の単価が 1.39円 安いこと'],
              annualMethod: 'flat',
              period: { year: 2026, month: 8 }
            }
      }
    />
  )
  return { onOpenEstimate, onBack }
}

/**
 * 反論カードを開く。
 * jsdom は details の toggle イベントを非同期に投げるので、React に届くまで待つ
 */
async function openSaid(said: RegExp) {
  await userEvent.click(screen.getByText(said))
  await waitFor(() =>
    expect(screen.getByText(said).closest('details')).toHaveAttribute('open')
  )
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
    expect(screen.getByText('今日の試算を、そのまま読む')).toBeInTheDocument()
  })

  it('高くなる結果からは、そのまま読める言葉へ飛べる', async () => {
    show(-9504)
    await goTo('説明')
    await userEvent.click(screen.getByRole('button', { name: 'その言葉を見る' }))
    expect(screen.getByText(/「（試算の結果）高くなるのですね」/)).toBeInTheDocument()
  })
})

describe('試算の結果を台本に反映する', () => {
  it('説明の段階に、そのまま読める金額の言葉が出る', async () => {
    // 「1年でこちら」と書いてあっても、いくらかは画面を見比べないと分からない
    show(13428, 600, 1119)
    await goTo('説明')
    expect(screen.getByText('今日の試算を、そのまま読む')).toBeInTheDocument()
    const body = document.body.textContent ?? ''
    expect(body).toContain('231,624円')
    expect(body).toContain('13,428円')
    expect(body).toContain('1,119円')
  })

  it('まだ試算していなければ、その旨と試算への導線を出す', async () => {
    show(null)
    await goTo('説明')
    expect(screen.getByText('まだ試算していません')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '試算へもどる' }))
    expect(screen.getByText('どのプランで試算するか')).toBeInTheDocument()
  })

  it('「なぜ安くなるのか」の答えを、内訳からそのまま出す', async () => {
    show(13428, 600, 1119)
    await goTo('説明')
    expect(screen.getByText('「なぜ安くなるのか」と聞かれたら')).toBeInTheDocument()
    expect(screen.getByText(/第1段階の単価が/, { selector: '.say-line' })).toBeInTheDocument()
  })

  it('気がかりを聞けていれば、それに合わせた台本もあとに続ける', async () => {
    show(13428, 600, 1119)
    await goTo('聞く')
    await userEvent.click(screen.getByRole('button', { name: '手続きが面倒そう' }))
    await goTo('説明')
    expect(screen.getByText('お客様の気がかりに合わせて足す')).toBeInTheDocument()
    expect(screen.getByText('今日の試算を、そのまま読む')).toBeInTheDocument()
  })

  it('気がかりが未回答なら、同じことを言う共通文は出さない', async () => {
    // 実数の台本と中身が重なるだけで、読む場所が増える
    show(13428, 600, 1119)
    await goTo('説明')
    expect(screen.queryByText('お客様の気がかりに合わせて足す')).not.toBeInTheDocument()
  })

  it('どの段階にいても、いまいくらの話かが帯に出る', async () => {
    show(13428, 600, 1119)
    expect(screen.getByText(/年間 13,428円 おトク/)).toBeInTheDocument()
    await goTo('聞く')
    expect(screen.getByText(/年間 13,428円 おトク/)).toBeInTheDocument()
  })

  it('試算の段階に戻ると、いまの試算の要点が出る', async () => {
    show(13428, 600, 1119)
    await goTo('試算')
    expect(screen.getByText('いまの試算')).toBeInTheDocument()
    expect(screen.getByText(/600 kWh/)).toBeInTheDocument()
  })

  it('解約金を聞かれたら、分かっている差額の側から話す', async () => {
    show(13428, 600, 1119)
    await goTo('不安')
    await openSaid(/「解約金がかかるのでは」/)
    expect(screen.getByText(/1年で取り返せる/)).toBeInTheDocument()
  })

  it('高くなる結果なら、帯にもそう出る', async () => {
    show(-9504)
    expect(screen.getByText(/いまのご契約のほうが年間 9,504円 お安い/)).toBeInTheDocument()
  })
})

describe('今日は決まらないと分かったら、手続きを飛ばす', () => {
  it('「検討します」が出たら、進まない場面だと出す', async () => {
    show(13428, 600, 1119)
    await goTo('不安')
    await openSaid(/検討します／家族に相談します/)
    expect(
      screen.getByText('今日はお手続きに進まない場面です')
    ).toBeInTheDocument()
  })

  it('次へのボタンが、ふりかえりへ変わる', async () => {
    show(13428, 600, 1119)
    await goTo('不安')
    expect(screen.getByRole('button', { name: 'お手続きのご案内へ' })).toBeInTheDocument()
    await openSaid(/「今のままでいい」/)
    expect(screen.queryByRole('button', { name: 'お手続きのご案内へ' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ふりかえりへ' }))
    expect(screen.getByText('今日のふりかえり')).toBeInTheDocument()
  })

  it('その場からふりかえりへ進める', async () => {
    show(13428, 600, 1119)
    await goTo('不安')
    await openSaid(/「今忙しい」/)
    await userEvent.click(screen.getByRole('button', { name: 'ふりかえりへ進む' }))
    expect(screen.getByText('今日のふりかえり')).toBeInTheDocument()
  })

  it('それでも見たいときは、手続きの案内へ行ける（禁止はしない）', async () => {
    show(13428, 600, 1119)
    await goTo('不安')
    await openSaid(/検討します／家族に相談します/)
    await userEvent.click(screen.getByRole('button', { name: 'それでもお手続きの案内を見る' }))
    expect(screen.getByText('お手続き前の確認')).toBeInTheDocument()
    // 来てしまったときも、理由は出しておく
    expect(screen.getByText('今日は決まらない場面です')).toBeInTheDocument()
  })

  it('解約金の質問が出ていれば、飛ばさない', async () => {
    // 買う気のない人は解約金の質問をしない
    show(13428, 600, 1119)
    await goTo('不安')
    await openSaid(/検討します／家族に相談します/)
    await openSaid(/「解約金がかかるのでは」/)
    expect(
      screen.queryByText('今日はお手続きに進まない場面です')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'お手続きのご案内へ' })).toBeInTheDocument()
  })

  it('高くなる結果なら、反論が出ていなくても飛ばす', async () => {
    show(-9504)
    await goTo('不安')
    expect(
      screen.getByText('今日はお手続きに進まない場面です')
    ).toBeInTheDocument()
  })

  it('進んでよい場面では、最後にもう一度だけ数字を言わせる', async () => {
    show(13428, 600, 1119)
    await goTo('手続き')
    expect(screen.getByText('最後にもう一度だけ言う数字')).toBeInTheDocument()
    expect(screen.getByText(/13,428円/, { selector: '.say-line' })).toBeInTheDocument()
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
    await openSaid(/「解約金がかかるのでは」/)
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
    expect(screen.getByText('高くなる結果でした')).toBeInTheDocument()
    expect(screen.getByText(/お安い結果でした/)).toBeInTheDocument()
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

describe('確度と次の一手', () => {
  it('試算まで進んだだけなら C で、口実ができたときに行く', async () => {
    show(5231)
    await goTo('振返')
    expect(screen.getByText(/確度/, { selector: '.card-title' }).textContent).toContain('C')
    expect(screen.getByText('口実ができたときに', { selector: 'strong' })).toBeInTheDocument()
  })

  it('次回うかがう話ができたと控えると A になる', async () => {
    // 日が決まっているのが、いちばん強い材料
    show(5231)
    await goTo('振返')
    await userEvent.click(screen.getByRole('button', { name: /次回うかがう話ができた/ }))
    expect(screen.getByText(/確度/, { selector: '.card-title' }).textContent).toContain('A')
    expect(screen.getByText(/その日のうちに、ご自身の予定に入れてください/)).toBeInTheDocument()
  })

  it('感触だけでは確度が上がらない', async () => {
    // 素人の感触は当てにならず、ベテランでも自分に都合よく見る
    show(5231)
    await goTo('振返')
    const before = screen.getByText(/確度/, { selector: '.card-title' }).textContent
    await userEvent.click(screen.getByRole('button', { name: 'あった' }))
    expect(screen.getByText(/確度/, { selector: '.card-title' }).textContent).toBe(before)
  })

  it('なぜその確度なのかを開いて確かめられる', async () => {
    show(5231)
    await goTo('振返')
    await userEvent.click(screen.getByText('この確度になった理由'))
    expect(screen.getByText(/検針票を見せていただけた/)).toBeInTheDocument()
  })

  it('今後の訪問をご遠慮したいと選んだら、点数に関係なく打ち切る', async () => {
    show(111924)
    await goTo('振返')
    await userEvent.click(screen.getByRole('button', { name: /次回うかがう話ができた/ }))
    await userEvent.click(screen.getByRole('button', { name: /今後の訪問はご遠慮したい/ }))
    expect(screen.getByText(/確度/, { selector: '.card-title' }).textContent).toContain('E')
    expect(screen.getByText(/名簿へ「訪問不可」を反映してください/)).toBeInTheDocument()
    expect(screen.queryByText('次に行くときの口実')).not.toBeInTheDocument()
  })

  it('高くなる結果なら、追いかけない側に倒す', async () => {
    show(-9504)
    await goTo('振返')
    expect(screen.getByText(/確度/, { selector: '.card-title' }).textContent).toContain('D')
    expect(screen.getByText(/追いかけないでください/)).toBeInTheDocument()
    expect(screen.queryByText('次に行くときの口実')).not.toBeInTheDocument()
  })

  it('前回どこで止まったかを、次に行くときの口実にする', async () => {
    show(5231)
    await goTo('不安')
    await openSaid(/「解約金がかかるのでは」/)
    await goTo('振返')
    expect(screen.getByText('次に行くときの口実')).toBeInTheDocument()
    expect(screen.getByText(/確認してまいりました/)).toBeInTheDocument()
  })

  it('料金改定を口実として出す', async () => {
    show(5231)
    await goTo('振返')
    expect(screen.getByText(/2026年11月の検針分から料金が変わります/)).toBeInTheDocument()
  })

  it('確度と次回の目安も、書き出す1行に入る', async () => {
    // 名簿へ書き写すのは職員なので、この1行に入っていないと運用が回らない
    show(5231)
    await goTo('振返')
    const row = screen.getByLabelText('書き出す記録').textContent ?? ''
    expect(row).toContain('C')
    expect(row).toContain('口実ができたときに')
  })
})

describe('商談の記録', () => {
  it('結果を選べる', async () => {
    show(5231)
    await goTo('振返')
    await userEvent.click(screen.getByRole('button', { name: /お申し込みいただいた/ }))
    expect(screen.getByRole('button', { name: /お申し込みいただいた/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('書き出す1行が画面に見える（コピーできない端末でも写せる）', async () => {
    show(5231)
    await goTo('振返')
    const row = screen.getByLabelText('書き出す記録')
    expect(row.textContent).toContain('2026-08-22')
    expect(row.textContent).toContain('chugoku_juryo_a')
    expect(row.textContent).toContain('300〜500kWh')
    expect(row.textContent).toContain('3千〜1万円')
  })

  it('記録に個人を特定できるものが入らないと明記する', async () => {
    show(5231)
    await goTo('振返')
    expect(screen.getByText(/お客様が特定できる項目は入っていません/)).toBeInTheDocument()
  })

  it('正確なご使用量ではなく帯で残す', async () => {
    // 実数だと「この地区でひと月◯◯kWhの世帯」がほぼ一意に決まることがある
    show(5231, 348)
    await goTo('振返')
    const row = screen.getByLabelText('書き出す記録')
    expect(row.textContent).not.toContain('348')
    expect(row.textContent).toContain('300〜500kWh')
  })

  it('開いた反論が「出た反論」として控えられる', async () => {
    show(5231)
    await goTo('不安')
    await openSaid(/「解約金がかかるのでは」/)
    await goTo('振返')
    expect(screen.getByLabelText('書き出す記録').textContent).toContain('cancel_fee')
  })

  it('まだ試算していなければ、試算の欄は空のまま', async () => {
    show(null)
    await goTo('振返')
    const row = screen.getByLabelText('書き出す記録')
    expect(row.textContent).not.toContain('kWh')
  })

  it('1行をコピーできる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    show(5231)
    await goTo('振返')
    await userEvent.click(screen.getByRole('button', { name: '1行をコピー' }))
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0][0]).toContain('2026-08-22')
  })

  it('見出しもコピーできる（貼り先の表を作れる）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    show(5231)
    await goTo('振返')
    await userEvent.click(screen.getByRole('button', { name: '見出しをコピー' }))
    expect(writeText.mock.calls[0][0]).toContain('日付')
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

describe('台本の強調', () => {
  const render_ = (text: string) =>
    emphasize(text)
      .map(node => (typeof node === 'string' ? node : `[${(node as any).props.children}]`))
      .join('')

  it('**〜** を強調に組み直す', () => {
    // 素のままだと、いちばん読ませたい一文にアスタリスクが並ぶ
    expect(render_('ここが**大事**です')).toBe('ここが[大事]です')
  })

  it('強調が複数あっても組み直す', () => {
    expect(render_('**A**と**B**')).toBe('[A]と[B]')
  })

  it('強調が無ければそのまま', () => {
    expect(render_('ふつうの文')).toBe('ふつうの文')
  })

  it('閉じていないアスタリスクは、そのまま出す（勝手に消さない）', () => {
    expect(render_('**閉じていない')).toBe('**閉じていない')
    expect(render_('2 ** 3 の話')).toBe('2 ** 3 の話')
  })

  it('画面でもアスタリスクが見えない', async () => {
    show(13428, 600, 1119)
    await goTo('説明')
    expect(document.body.textContent).not.toContain('**')
  })
})
