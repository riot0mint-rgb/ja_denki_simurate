import { useState } from 'react'

/**
 * JAでんきのロゴ。
 *
 * ロゴは公式の画像ファイルを置いて表示する。似せて描き起こすことはしない。
 * `apps/web/public/` に `logo.svg`（無ければ `logo.png`）を置けばビルド時に
 * 拾われ、自動で出る。どちらも無い環境では文字のワードマークに落とす。
 */
export default function Logo() {
  const [failed, setFailed] = useState(false)
  // ビルド時に決まる。テスト環境では未定義になるのでその場合も文字にする
  const src = typeof __LOGO_SRC__ === 'string' ? __LOGO_SRC__ : null

  if (!src || failed) {
    return <span className="wordmark">JAでんき料金比較</span>
  }

  return (
    <span className="brand">
      {/* ビルド後にファイルを消された場合の保険。壊れた画像の枠を出さない */}
      <img className="logo" src={src} alt="JAでんき" onError={() => setFailed(true)} />
      <span className="wordmark">料金比較</span>
    </span>
  )
}
