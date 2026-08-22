/**
 * 画面の意味づけに使うアイコン。
 *
 * すべて 24×24 の線画で、色は currentColor に従う。外部ライブラリも
 * 外部フォントも使わない（オフラインで動くことが要件のため）。
 * 装飾なので aria-hidden にし、読み上げには出さない。
 * 見出しの中に置いてもアクセシブルネームが変わらないようにしている。
 */
export type IconName =
  | 'receipt'
  | 'calculator'
  | 'coins'
  | 'chart'
  | 'table'
  | 'tag'
  | 'bolt'
  | 'calendar'
  | 'alert'
  | 'pencil'
  | 'check'
  | 'chat'

const PATHS: Record<IconName, JSX.Element> = {
  // 検針票（明細）
  receipt: (
    <>
      <path d="M5 3.2h14v17.6l-2.3-1.4-2.3 1.4-2.4-1.4-2.3 1.4-2.4-1.4L5 20.8z" />
      <path d="M8.6 8h6.8M8.6 12h6.8" />
    </>
  ),
  // 電卓（かんたん試算）
  calculator: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.2" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01" />
    </>
  ),
  // お金（おトク額）
  coins: (
    <>
      <ellipse cx="12" cy="6.6" rx="7" ry="3.1" />
      <path d="M5 6.6v4.4c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V6.6" />
      <path d="M5 11v4.4c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V11" />
    </>
  ),
  // 棒グラフ（月ごとの料金）
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20V12M12 20V5.5M16.5 20V9" />
    </>
  ),
  // 比較表
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M10.5 9.5V19.5" />
    </>
  ),
  // 割引（セット割）
  tag: (
    <>
      <path d="M11.4 3.6H20v8.6l-8.9 8.9a1.6 1.6 0 0 1-2.3 0l-6.3-6.3a1.6 1.6 0 0 1 0-2.3z" />
      <path d="M16.2 7.8h.01" />
    </>
  ),
  // 電気
  bolt: <path d="M13.4 2.5 5.2 13.4h5.6l-.9 8.1 8.5-11.2h-5.8z" />,
  // 1年間
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3.2v3.6M16 3.2v3.6" />
    </>
  ),
  // 注意
  alert: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.6v5.2M12 16.4h.01" />
    </>
  ),
  // 入力
  pencil: (
    <>
      <path d="M4 20h4.2L20 8.2a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8z" />
      <path d="M14.8 5.4 18.6 9.2" />
    </>
  ),
  check: <path d="m4.8 12.6 4.6 4.6L19.2 7.4" />,
  // 会話（商談ナビ）
  chat: (
    <>
      <path d="M3.5 6.2a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4.3 3.6a.4.4 0 0 1-.7-.3v-3.3h-.5a2 2 0 0 1 0-.1z" />
      <path d="M8 9.2h8M8 12.6h5" />
    </>
  )
}

export default function Icon({
  name,
  size = 22,
  strokeWidth = 1.7,
  style
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
