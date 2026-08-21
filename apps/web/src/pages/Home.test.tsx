import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from './Home'

describe('ホーム画面', () => {
  it('入力開始ボタンを押すと onStartInput が呼ばれる', async () => {
    const onStartInput = vi.fn()
    render(<Home onStartInput={onStartInput} />)
    await userEvent.click(screen.getByRole('button', { name: '検針票から試算する' }))
    expect(onStartInput).toHaveBeenCalledTimes(1)
  })

  // 「端末」「送信」ではお客様に伝わらない。何を聞かないか・何が起きないかを書く
  it('個人情報を扱わないことを、お客様に伝わる言葉で明示する（CLAUDE.md ルール9）', () => {
    render(<Home onStartInput={() => {}} />)
    expect(screen.getByText(/お名前やご住所はうかがいません/)).toBeInTheDocument()
    expect(screen.getByText(/外に送られることもありません/)).toBeInTheDocument()
  })

  it('ロゴが無い環境でも見出しが出る', () => {
    render(<Home onStartInput={() => {}} />)
    expect(screen.getByRole('heading', { name: /1年でいくら/ })).toBeInTheDocument()
  })
})
