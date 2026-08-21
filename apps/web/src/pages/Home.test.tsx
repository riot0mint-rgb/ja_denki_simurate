import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from './Home'

describe('ホーム画面', () => {
  it('入力開始ボタンを押すと onStartInput が呼ばれる', async () => {
    const onStartInput = vi.fn()
    render(<Home onStartInput={onStartInput} onStartSimple={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '検針票から試算する' }))
    expect(onStartInput).toHaveBeenCalledTimes(1)
  })

  // 「端末」「送信」ではお客様に伝わらない。何を聞かないか・何が起きないかを書く
  it('個人情報を扱わないことを、お客様に伝わる言葉で明示する（CLAUDE.md ルール9）', () => {
    render(<Home onStartInput={() => {}} onStartSimple={() => {}} />)
    expect(screen.getByText(/お名前やご住所はうかがいません/)).toBeInTheDocument()
    expect(screen.getByText(/外に送られることもありません/)).toBeInTheDocument()
  })

  it('ロゴが無い環境でも見出しが出る', () => {
    render(<Home onStartInput={() => {}} onStartSimple={() => {}} />)
    expect(screen.getByRole('heading', { name: /1年でいくら/ })).toBeInTheDocument()
  })
})

// 検針票が手元にあるかで最初に分ける
describe('入り口の分岐', () => {
  it('かんたん試算にも入れる', async () => {
    const onStartSimple = vi.fn()
    render(<Home onStartInput={() => {}} onStartSimple={onStartSimple} />)
    await userEvent.click(screen.getByRole('button', { name: /かんたん試算/ }))
    expect(onStartSimple).toHaveBeenCalledTimes(1)
  })

  it('かんたん試算が何をするものか書いてある', () => {
    render(<Home onStartInput={() => {}} onStartSimple={() => {}} />)
    expect(screen.getByText(/1か月の電気料金だけでおよその金額を出します/)).toBeInTheDocument()
  })
})
