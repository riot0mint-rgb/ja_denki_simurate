import { useEffect, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import Home from './pages/Home'
import ManualInput from './pages/ManualInput'
import SimpleInput, { SimpleEstimate } from './pages/SimpleInput'
import ComparisonResult from './pages/ComparisonResult'
import SalesCoach from './pages/SalesCoach'
import UpdateBanner from './components/UpdateBanner'
import Logo from './components/Logo'
import { registerServiceWorker } from './serviceWorker'
import { DEFAULT_RATE_PERIOD } from './services/calculateService'
import './App.css'

type PageType = 'home' | 'simple' | 'input' | 'result' | 'coach'

interface Query {
  scenarioId: string
  usage: UsageInput
  period: { year: number; month: number }
  /** かんたん試算で電気料金から使用量を逆算した場合の内訳 */
  estimate?: SimpleEstimate
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [query, setQuery] = useState<Query>({
    scenarioId: 'chugoku_juryo_a',
    usage: {},
    period: DEFAULT_RATE_PERIOD
  })
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null)
  /**
   * 直近の試算の要点。商談ナビが「高くなる結果なら勧めない」に倒すのと、
   * 商談の記録に使う。null は「まだ試算していない」
   */
  const [lastEstimate, setLastEstimate] = useState<{
    scenarioId: string
    totalKwh: number
    annualSavingsYen: number | null
    period: { year: number; month: number }
  } | null>(null)
  /** 試算から戻るときに商談ナビへ返すか */
  const [cameFromCoach, setCameFromCoach] = useState(false)

  useEffect(() => {
    // setState に関数を渡すと更新関数と解釈されるため、包んで保持する
    registerServiceWorker(apply => setApplyUpdate(() => apply))
  }, [])

  const handleInputComplete = (
    scenarioId: string,
    usage: UsageInput,
    period: { year: number; month: number },
    estimate?: SimpleEstimate
  ) => {
    setQuery({ scenarioId, usage, period, estimate })
    setCurrentPage('result')
  }

  // 結果から戻ったとき、来た画面へ返す
  const [lastInputPage, setLastInputPage] = useState<'simple' | 'input'>('input')

  return (
    <div className="app">
      {applyUpdate && <UpdateBanner onApply={applyUpdate} />}
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <span className="topbar-sub">JA職員向け ／ 中国電力エリア・低圧</span>
        </div>
      </header>
      {currentPage === 'home' && (
        <Home
          onStartInput={() => {
            setLastInputPage('input')
            setCurrentPage('input')
          }}
          onStartSimple={() => {
            setLastInputPage('simple')
            setCurrentPage('simple')
          }}
          onStartCoach={() => {
            setCameFromCoach(true)
            setCurrentPage('coach')
          }}
        />
      )}
      {/*
        商談ナビは試算画面と行き来する。畳むと聞き取った内容が消えて、
        お客様の前で同じことを二度聞くはめになるので、隠して保持する
      */}
      {(currentPage === 'coach' || cameFromCoach) && (
        <div style={currentPage === 'coach' ? undefined : { display: 'none' }}>
          <SalesCoach
            lastEstimate={lastEstimate}
            onOpenEstimate={kind => {
              setLastInputPage(kind === 'simple' ? 'simple' : 'input')
              setCurrentPage(kind === 'simple' ? 'simple' : 'input')
            }}
            onBack={() => {
              setCameFromCoach(false)
              setCurrentPage('home')
            }}
          />
        </div>
      )}
      {currentPage === 'simple' && (
        <SimpleInput
          onComplete={handleInputComplete}
          onBack={() => setCurrentPage(cameFromCoach ? 'coach' : 'home')}
          onSwitchToDetailed={() => {
            setLastInputPage('input')
            setCurrentPage('input')
          }}
        />
      )}
      {/*
        入力画面はいったん開いたら畳まずに隠しておく。条件を変えて試算し直すたびに
        プラン・検針月・検針期間・契約容量・各時間帯の入力が消えると、
        お客様の前で全部打ち直すことになる。
      */}
      {currentPage !== 'home' && (
        <div style={currentPage === 'input' ? undefined : { display: 'none' }}>
          <ManualInput
            onComplete={handleInputComplete}
            onBack={() => setCurrentPage(cameFromCoach ? 'coach' : 'home')}
          />
        </div>
      )}
      {currentPage === 'result' && (
        <ComparisonResult
          scenarioId={query.scenarioId}
          usage={query.usage}
          period={query.period}
          estimate={query.estimate}
          onEstimateSummary={setLastEstimate}
          onReturnToCoach={cameFromCoach ? () => setCurrentPage('coach') : undefined}
          onBack={() => setCurrentPage(lastInputPage)}
        />
      )}
      {/*
        認証をかけていない＝URLを知っていれば誰でも開ける。
        お客様の画面に映ることもあるので、誰向けの道具なのかを画面にも書いておく（フェーズ9）
      */}
      <footer className="sitefoot">
        <p>
          JA職員向けの試算ツールです。表示金額は目安であり、請求額を保証するものではありません。
        </p>
        <p>入力した数字はこの端末の中だけで計算され、どこにも送信・保存されません。</p>
      </footer>
    </div>
  )
}
