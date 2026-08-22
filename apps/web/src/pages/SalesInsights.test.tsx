import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SalesInsights from './SalesInsights'
import { headerRow } from '../services/visitLog'

const HEADER = headerRow().join('\t')

/** 見出しの位置に合わせて1行を作る */
function row(over: Partial<Record<string, string>> = {}) {
  const base: Record<string, string> = {
    日付: '2026-08-22',
    到達段階: 'closing',
    温度感: 'curious',
    世帯: 'small',
    日中在宅: 'away',
    オール電化: 'no',
    気がかり: 'price',
    現在の契約: 'chugoku_juryo_a',
    使用量帯: '300〜500kWh',
    年間差額帯: '3千〜1万円',
    出た反論: 'think',
    結果: 'applied',
    ...over
  }
  return headerRow()
    .map(h => base[h] ?? '')
    .join('\t')
}

const sheet = (rows: string[]) => [HEADER, ...rows].join('\n')

async function paste(text: string) {
  const area = screen.getByLabelText('集計表を貼る')
  await userEvent.click(area)
  // 大きな文字列を1文字ずつ打つと遅いので、まとめて入れる
  await userEvent.paste(text)
}

describe('営業の集計', () => {
  it('貼る前は集計を出さない', () => {
    render(<SalesInsights onBack={vi.fn()} />)
    expect(screen.queryByText(/商談 .* 件/)).not.toBeInTheDocument()
  })

  it('貼った内容はどこにも送らないと明記する', () => {
    render(<SalesInsights onBack={vi.fn()} />)
    expect(screen.getByText(/どこにも送信・保存しません/)).toBeInTheDocument()
  })

  it('貼ると件数と申込率が出る', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste(sheet([...Array(6).fill(row()), ...Array(4).fill(row({ 結果: 'declined' }))]))
    expect(screen.getByText('商談 10 件')).toBeInTheDocument()
    expect(screen.getByText(/60/, { selector: '.hero-figure' })).toBeInTheDocument()
    expect(screen.getByText(/6 件のお申し込み/)).toBeInTheDocument()
  })

  it('いくら安くなると決まるのかを出す', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste(
      sheet([
        ...Array(6).fill(row()),
        ...Array(6).fill(row({ 年間差額帯: '高くなる', 結果: 'not_suitable' }))
      ])
    )
    expect(screen.getByText('いくら安くなると決まるのか')).toBeInTheDocument()
    expect(screen.getByText('高くなる')).toBeInTheDocument()
  })

  it('組織側で列が増えていても読める', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste(`支店\t${HEADER}\n中央\t${row()}`)
    expect(screen.getByText('商談 1 件')).toBeInTheDocument()
  })

  it('足りない列は名前で知らせる', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste('日付\t結果\n2026-08-22\tapplied')
    expect(screen.getByText(/見つからなかった列/)).toBeInTheDocument()
  })

  it('見出しが無ければ、その旨を出す', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste('あ\tい\nう\tえ')
    expect(screen.getByText(/見出しの行が見つかりません/)).toBeInTheDocument()
  })

  it('母数が小さい区分では割合を出さない', async () => {
    render(<SalesInsights onBack={vi.fn()} />)
    await paste(sheet([row()]))
    // 1件だけなら全体の申込率も「—」
    expect(screen.getByText(/件に満たないため割合は出していません/)).toBeInTheDocument()
  })

  it('確度の判定が当たっているかを、確度別の申込率で出す', async () => {
    // 判定は仮説なので、外れていることを見つけられる形にしておく
    render(<SalesInsights onBack={vi.fn()} />)
    await paste(
      sheet([
        ...Array(6).fill(row({ 確度: 'B' })),
        ...Array(6).fill(row({ 確度: 'D', 結果: 'declined' }))
      ])
    )
    expect(screen.getByText('確度の判定は当たっているか')).toBeInTheDocument()
    const table = screen.getByText('確度の判定は当たっているか').closest('.card')!
    const cells = [...table.querySelectorAll('.tally-row')].map(r => r.textContent)
    expect(cells.some(t => t?.includes('B') && t?.includes('100%'))).toBe(true)
    expect(cells.some(t => t?.includes('D') && t?.includes('0%'))).toBe(true)
  })

  it('ホームへ戻れる', async () => {
    const onBack = vi.fn()
    render(<SalesInsights onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'ホームへ' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('戻り先が無い画面では、ボタンの文言を変えられる', async () => {
    // 管理者向けの単独画面には戻り先が無い
    const onBack = vi.fn()
    render(<SalesInsights onBack={onBack} backLabel="閉じる" />)
    expect(screen.queryByRole('button', { name: 'ホームへ' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
