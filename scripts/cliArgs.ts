/**
 * CLI の引数解釈。
 *
 * `--out <path>` の値を位置引数と取り違えると、指定したディレクトリを無視して
 * 既定の archive/ と突合し「すべて一致」と言って 0 で終える。
 * 新しい試算表を渡したのに改定を見逃すので、ここは切り出してテストしてある。
 */
export interface ParsedArgs {
  /** --out で指定された書き出し先。未指定なら null */
  outPath: string | null
  /** オプション以外の引数 */
  positional: string[]
  /** 引数の書き方が誤っている場合の理由。null なら問題なし */
  error: string | null
}

export function parseArgs(args: string[]): ParsedArgs {
  const outIndex = args.indexOf('--out')
  // --out が無いとき outIndex は -1。そのまま outIndex + 1 で除外すると
  // 添字0（＝本来の位置引数）を捨ててしまう
  const outValueIndex = outIndex >= 0 ? outIndex + 1 : -1
  const outValue = outIndex >= 0 ? args[outValueIndex] : undefined

  // `--out` の後ろが空（シェル変数の展開失敗など）だと、書き出したつもりで
  // 標準出力に出て 0 で終わる。黙って成功したように見えるので落とす
  const error =
    outIndex >= 0 && (outValue === undefined || outValue.startsWith('--'))
      ? '--out には書き出し先のパスを指定してください'
      : null

  return {
    outPath: outValue !== undefined && !outValue.startsWith('--') ? outValue : null,
    positional: args.filter((a, i) => !a.startsWith('--') && i !== outValueIndex),
    error
  }
}
