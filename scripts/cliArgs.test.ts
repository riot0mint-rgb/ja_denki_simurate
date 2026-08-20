import { describe, it, expect } from 'vitest'
import { parseArgs } from './cliArgs'

describe('CLI の引数解釈', () => {
  it('引数なし', () => {
    expect(parseArgs([])).toEqual({ outPath: null, positional: [], error: null })
  })

  // これを取り違えると、新しい試算表を渡したのに archive/ と突合して
  // 「すべて一致」と言って 0 で終わる
  it('--out が無くても位置引数を捨てない', () => {
    expect(parseArgs(['somedir'])).toEqual({
      outPath: null,
      positional: ['somedir'],
      error: null
    })
  })

  it('--out の値は位置引数に数えない', () => {
    expect(parseArgs(['--out', '/tmp/x.md'])).toEqual({
      outPath: '/tmp/x.md',
      positional: [],
      error: null
    })
  })

  it.each([
    [['--out', '/tmp/x.md', 'somedir']],
    [['somedir', '--out', '/tmp/x.md']]
  ])('順序が違っても同じ結果になる: %j', args => {
    expect(parseArgs(args)).toEqual({
      outPath: '/tmp/x.md',
      positional: ['somedir'],
      error: null
    })
  })

  // 書き出したつもりで標準出力に出て 0 で終わると、黙って成功したように見える
  it('--out に値が無ければ理由つきで落とす', () => {
    const r = parseArgs(['--out'])
    expect(r.outPath).toBeNull()
    expect(r.error).toContain('--out には書き出し先のパス')
  })

  it('--out の直後が別のオプションでも落とす（シェル変数の展開失敗）', () => {
    expect(parseArgs(['--out', '--verbose']).error).not.toBeNull()
  })

  it('知らないオプションは無視して位置引数だけ残す', () => {
    expect(parseArgs(['--verbose', 'somedir', '--dry-run'])).toEqual({
      outPath: null,
      positional: ['somedir'],
      error: null
    })
  })

  it('位置引数が複数あれば順序どおり返す', () => {
    expect(parseArgs(['a', 'b']).positional).toEqual(['a', 'b'])
  })
})
