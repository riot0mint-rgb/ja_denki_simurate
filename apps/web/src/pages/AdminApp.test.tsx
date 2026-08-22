import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminApp from './AdminApp'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('管理者向けの画面', () => {
  it('職員向けの画面とは別の名乗りをする', () => {
    // お客様の前で開いてしまったときに、すぐ気づけるようにする
    render(<AdminApp />)
    expect(screen.getByText('管理者向け ／ 営業の集計')).toBeInTheDocument()
    expect(screen.queryByText(/JA職員向け/)).not.toBeInTheDocument()
  })

  it('職員へURLを配らないよう注意を出す', () => {
    render(<AdminApp />)
    expect(screen.getByText(/URLを職員へ配らないでください/)).toBeInTheDocument()
  })

  it('貼った内容を送信・保存しないと明記する', () => {
    render(<AdminApp />)
    expect(screen.getAllByText(/送信・保存/).length).toBeGreaterThan(0)
  })

  it('戻り先が無いので、閉じるだけにする', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<AdminApp />)
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
