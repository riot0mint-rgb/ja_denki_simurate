import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManualInput from './ManualInput'
import { DEFAULT_RATE_PERIOD } from '../services/calculateService'
import type { UsageInput } from '@ja-denki-simulator/calc-core'

type Complete = (id: string, usage: UsageInput, period: { year: number; month: number }) => void

function setup() {
  const onComplete = vi.fn<Parameters<Complete>, void>()
  const onBack = vi.fn()
  render(<ManualInput onComplete={onComplete} onBack={onBack} />)
  return { onComplete, onBack, user: userEvent.setup() }
}

const pickPlan = (label: string) =>
  userEvent.selectOptions(screen.getByLabelText('現在のご契約プラン'), [
    screen.getByRole('option', { name: label }) as HTMLOptionElement
  ])

const pickMonth = (label: string) =>
  userEvent.selectOptions(screen.getByLabelText('検針月'), [
    screen.getByRole('option', { name: label }) as HTMLOptionElement
  ])

describe('入力画面の基本動作', () => {
  it('入力が空のあいだは次へ進めない', () => {
    setup()
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeDisabled()
  })

  it('使用量を入れると進めるようになり、入力値がそのまま渡る', async () => {
    const { onComplete, user } = setup()
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    const next = screen.getByRole('button', { name: '詳しい結果を見る' })
    expect(next).toBeEnabled()
    await user.click(next)
    expect(onComplete).toHaveBeenCalledWith(
      'chugoku_juryo_a',
      expect.objectContaining({ totalKwh: 348 }),
      DEFAULT_RATE_PERIOD
    )
  })

  it('戻るで onBack が呼ばれる', async () => {
    const { onBack, user } = setup()
    await user.click(screen.getByRole('button', { name: '戻る' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('入力しながら試算結果が見える', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    // 月額だけでなく年額も入力中から見える。年額のほうを大きく出す
    expect(screen.getByText('1年あたり')).toBeInTheDocument()
    expect(screen.getByText('1か月あたり')).toBeInTheDocument()
    expect(screen.getAllByText('おトク').length).toBe(2)
    const annual = screen.getByText('1年あたり').previousElementSibling as HTMLElement
    const monthly = screen.getByText('1か月あたり').previousElementSibling as HTMLElement
    expect(annual.className).toContain('figure-xl')
    expect(monthly.className).toContain('figure-lg')
  })

  it('割高になるプランでは「月々割高」と出す', async () => {
    const { user } = setup()
    await pickPlan('auでんき Mプラン')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    expect(screen.getAllByText('割高').length).toBeGreaterThan(0)
  })
})

describe('プランごとに必要な入力だけを出す', () => {
  it('従量電灯Aは契約容量を聞かない', () => {
    setup()
    expect(screen.queryByLabelText('ご契約電力')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('ご契約容量')).not.toBeInTheDocument()
  })

  it('従量電灯Bは契約容量(kVA)を聞く', async () => {
    setup()
    await pickPlan('中国電力 従量電灯B')
    expect(screen.getByLabelText('ご契約容量')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10kVA' })).toBeInTheDocument()
  })

  it('電化Styleは契約電力(kW)と3時間帯を聞く', async () => {
    setup()
    await pickPlan('中国電力 電化Style')
    expect(screen.getByLabelText('ご契約電力')).toBeInTheDocument()
    expect(screen.getByLabelText(/デイタイム/)).toBeInTheDocument()
    expect(screen.getByLabelText('ナイトタイム kWh')).toBeInTheDocument()
    expect(screen.getByLabelText('ホリデータイム kWh')).toBeInTheDocument()
  })

  it('契約容量はタップでも数値入力でも決められる', async () => {
    const { user } = setup()
    await pickPlan('中国電力 電化Style')
    await user.click(screen.getByRole('button', { name: '8kW' }))
    expect(screen.getByLabelText('ご契約電力')).toHaveValue(8)
    await user.clear(screen.getByLabelText('ご契約電力'))
    await user.type(screen.getByLabelText('ご契約電力'), '12')
    expect(screen.getByLabelText('ご契約電力')).toHaveValue(12)
  })

  it('按分が不要なプランでは検針期間を聞かない', () => {
    setup()
    expect(screen.queryByLabelText('検針期間の開始日')).not.toBeInTheDocument()
  })

  it('ファミリータイムは検針期間と休日の使い方を聞く', async () => {
    setup()
    await pickPlan('中国電力 ファミリータイムⅠ')
    expect(screen.getByLabelText('検針期間の開始日')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'とても多い' })).toBeInTheDocument()
    expect(screen.getByLabelText('ファミリータイム kWh')).toBeInTheDocument()
  })
})

describe('対象月から季節を決めて入力欄を減らす', () => {
  it('7月はデイタイムに「夏季」と表示する', async () => {
    setup()
    await pickPlan('中国電力 電化Style')
    expect(screen.getByLabelText('デイタイム（夏季） kWh')).toBeInTheDocument()
    expect(screen.getByText(/夏季料金の期間です/)).toBeInTheDocument()
  })

  it('1月は季節表示が消える', async () => {
    setup()
    await pickPlan('中国電力 電化Style')
    await pickMonth('2026年1月')
    expect(screen.getByLabelText('デイタイム kWh')).toBeInTheDocument()
    expect(screen.getByText(/その他季の期間です/)).toBeInTheDocument()
  })

  it('低圧電力は夏季／その他季で1欄だけ出す', async () => {
    setup()
    await pickPlan('中国電力 低圧電力')
    expect(screen.getByLabelText('ご使用量 (kWh)・夏季単価')).toBeInTheDocument()
    await pickMonth('2026年1月')
    expect(screen.getByLabelText('ご使用量 (kWh)・その他季単価')).toBeInTheDocument()
  })

  // ③④⑤の入力シートはいずれも「夏季」と「その他季」を別々に聞いている。
  // 1欄にまとめると、7月・10月の検針が丸ごと片方の単価で計算されてしまう
  it('時間帯別プランも7月は夏季とその他季を併記する', async () => {
    setup()
    await pickPlan('中国電力 電化Style')
    await pickMonth('2026年7月')
    expect(screen.getByLabelText('デイタイム夏季 kWh')).toBeInTheDocument()
    expect(screen.getByLabelText('デイタイムその他季 kWh')).toBeInTheDocument()

    await pickMonth('2026年8月')
    expect(screen.queryByLabelText('デイタイム夏季 kWh')).not.toBeInTheDocument()
    expect(screen.getByLabelText('デイタイム（夏季） kWh')).toBeInTheDocument()
  })

  it('季節をまたぐ月は両方の入力が計算に渡る', async () => {
    const { onComplete, user } = setup()
    await pickPlan('中国電力 電化Style')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('デイタイム夏季 kWh'), '100')
    await user.type(screen.getByLabelText('デイタイムその他季 kWh'), '200')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '300')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    const [, usage] = onComplete.mock.calls[0]
    expect(usage.tou).toMatchObject({ daySummer: 100, dayOther: 200, night: 300 })
  })

  it('低圧電力も7月は夏季とその他季を併記する', async () => {
    const { onComplete, user } = setup()
    await pickPlan('中国電力 低圧電力')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('ご使用量 (kWh)・夏季単価'), '150')
    await user.type(screen.getByLabelText('ご使用量 (kWh)・その他季単価'), '250')
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    const [, usage] = onComplete.mock.calls[0]
    expect(usage.seasonal).toEqual({ summerKwh: 150, otherKwh: 250 })
    expect(usage.totalKwh).toBe(400)
  })

  it('季節をまたがない月は1欄のまま（入力を増やさない）', async () => {
    setup()
    await pickPlan('中国電力 低圧電力')
    await pickMonth('2026年8月')
    expect(screen.queryByLabelText('ご使用量 (kWh)・その他季単価')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ご使用量 (kWh)・夏季単価')).toBeInTheDocument()
  })

  it('ファミリータイムは7月だけ夏季とその他季を併記する', async () => {
    setup()
    await pickPlan('中国電力 ファミリータイムⅡ')
    await pickMonth('2026年7月')
    expect(screen.getByLabelText('デイタイム夏季 kWh')).toBeInTheDocument()
    expect(screen.getByLabelText('デイタイムその他季 kWh')).toBeInTheDocument()

    await pickMonth('2026年3月')
    expect(screen.queryByLabelText('デイタイム夏季 kWh')).not.toBeInTheDocument()
    expect(screen.getByLabelText('デイタイム kWh')).toBeInTheDocument()
  })
})

describe('検針期間から日数を自動で数える', () => {
  it('日付を入れると日数・土日・祝日が埋まる', async () => {
    setup()
    await pickPlan('中国電力 時間帯別電灯（エコノミーナイト）')
    fireEvent.change(screen.getByLabelText('検針期間の開始日'), { target: { value: '2026-06-06' } })
    fireEvent.change(screen.getByLabelText('検針期間の終了日'), { target: { value: '2026-07-05' } })

    expect(screen.getByLabelText('日数')).toHaveValue(30)
    expect(screen.getByText(/平日 \d+日/)).toBeInTheDocument()
  })

  it('自動で数えた日数は手で直せる', async () => {
    const { user } = setup()
    await pickPlan('中国電力 時間帯別電灯（エコノミーナイト）')
    await user.clear(screen.getByLabelText('土日'))
    await user.type(screen.getByLabelText('土日'), '9')
    expect(screen.getByLabelText('土日')).toHaveValue(9)
  })

  // min="0" は入力を止めない。祝日 -20 で試算額が 3,000円 以上動く
  it('土日・祝日に負の値を入れたら止める', async () => {
    const { user } = setup()
    await pickPlan('中国電力 時間帯別電灯（エコノミーナイト）')
    await user.type(screen.getByLabelText('昼間時間 kWh'), '200')
    await user.type(screen.getByLabelText('夜間時間 kWh'), '300')
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeEnabled()

    await user.clear(screen.getByLabelText('祝日'))
    await user.type(screen.getByLabelText('祝日'), '-20')
    expect(screen.getByText('土日・祝日の日数に負の値は入れられません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeDisabled()
  })

  it('内訳が矛盾したら警告し、先へ進ませない', async () => {
    const { user } = setup()
    await pickPlan('中国電力 時間帯別電灯（エコノミーナイト）')
    await user.type(screen.getByLabelText('昼間時間 kWh'), '200')
    await user.type(screen.getByLabelText('夜間時間 kWh'), '300')
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeEnabled()

    await user.clear(screen.getByLabelText('土日'))
    await user.type(screen.getByLabelText('土日'), '40')
    expect(screen.getByText(/日数の内訳が合いません/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '詳しい結果を見る' })).toBeDisabled()
  })

  it('検針期間が不正なら日数欄を出さずに促す', async () => {
    setup()
    await pickPlan('中国電力 時間帯別電灯（エコノミーナイト）')
    // 終了日が開始日より前。type() では date 入力に途中の値が入るため直接変更する
    fireEvent.change(screen.getByLabelText('検針期間の終了日'), { target: { value: '2020-01-01' } })
    expect(screen.getByText('検針期間を正しく入力してください')).toBeInTheDocument()
    expect(screen.queryByLabelText('日数')).not.toBeInTheDocument()
  })
})

describe('合計の確認と按分の入力', () => {
  it('時間帯を入れると合計が出る', async () => {
    const { user } = setup()
    await pickPlan('中国電力 電化Style')
    await user.type(screen.getByLabelText('デイタイム（夏季） kWh'), '100')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '200')
    await user.type(screen.getByLabelText('ホリデータイム kWh'), '50')
    expect(screen.getByText('350')).toBeInTheDocument()
  })

  // 季節をまたがない月は famDaySummer を計算に渡さない。
  // 合計にだけ残ると、請求されない kWh を検針票と突き合わせさせてしまう
  it('検針月を変えたら合計から使わない欄が外れる', async () => {
    const { user } = setup()
    await pickPlan('中国電力 ファミリータイムⅡ')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('デイタイム夏季 kWh'), '100')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '200')
    expect(screen.getByText('300')).toBeInTheDocument()

    await pickMonth('2026年8月')
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.queryByText('300')).not.toBeInTheDocument()
  })

  it('休日の使い方を切り替えると按分が変わる', async () => {
    const { onComplete, user } = setup()
    await pickPlan('中国電力 ファミリータイムⅡ')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('デイタイム夏季 kWh'), '100')
    await user.type(screen.getByLabelText('ファミリータイム kWh'), '80')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '220')
    await user.click(screen.getByRole('button', { name: 'とても多い' }))
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    const [, usage] = onComplete.mock.calls[0]
    expect(usage.calendar?.holidayUsageRatio).toBe('much_more')
  })

  it('電化住宅割は外せる', async () => {
    const { onComplete, user } = setup()
    await pickPlan('中国電力 ファミリータイムⅠ')
    await pickMonth('2026年7月')
    await user.type(screen.getByLabelText('デイタイム夏季 kWh'), '100')
    await user.type(screen.getByLabelText('ナイトタイム kWh'), '220')
    await user.click(screen.getByRole('checkbox', { name: /電化住宅割/ }))
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    const [, usage] = onComplete.mock.calls[0]
    expect(usage.allElectricDiscount).toBe(false)
  })

  it('深夜電力Bは総使用量と契約電力だけ聞く', async () => {
    const { onComplete, user } = setup()
    await pickPlan('中国電力 深夜電力B')
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '200')
    await user.click(screen.getByRole('button', { name: '4kW' }))
    await user.click(screen.getByRole('button', { name: '詳しい結果を見る' }))

    expect(onComplete).toHaveBeenCalledWith(
      'chugoku_midnight_b',
      expect.objectContaining({ totalKwh: 200, contractKw: 4 }),
      DEFAULT_RATE_PERIOD
    )
  })
})

describe('計算できない条件は理由を先に見せる', () => {
  it('入力途中で未対応になったら理由を表示する', async () => {
    const { user } = setup()
    await pickPlan('中国電力 従量電灯A')
    await user.type(screen.getByLabelText('ご使用量 (kWh)'), '348')
    await pickMonth('2025年1月')
    expect(screen.getByText('1年あたり')).toBeInTheDocument()
  })
})
