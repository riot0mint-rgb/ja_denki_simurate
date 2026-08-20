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

  it('ブラウザ内処理であることを明示する（CLAUDE.md ルール9）', () => {
    render(<Home onStartInput={() => {}} />)
    expect(screen.getByText(/この端末の中だけで行い、入力内容を送信しません/)).toBeInTheDocument()
  })
})
