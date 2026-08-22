import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpdateBanner from './UpdateBanner'

describe('更新バナー', () => {
  it('更新するを押すと onApply が呼ばれる', async () => {
    const onApply = vi.fn()
    render(<UpdateBanner onApply={onApply} />)
    await userEvent.click(screen.getByRole('button', { name: '更新する' }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('単価の改定を見逃さないよう、閉じる選択肢は出さない', () => {
    render(<UpdateBanner onApply={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('新しい料金データがあります')
  })

  it('印刷物には出さない', () => {
    render(<UpdateBanner onApply={() => {}} />)
    expect(screen.getByRole('status')).toHaveClass('print-hide')
  })
})
