import { useEffect, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import Home from './pages/Home'
import ManualInput from './pages/ManualInput'
import SimpleInput, { SimpleEstimate } from './pages/SimpleInput'
import ComparisonResult from './pages/ComparisonResult'
import UpdateBanner from './components/UpdateBanner'
import Logo from './components/Logo'
import { registerServiceWorker } from './serviceWorker'
import { DEFAULT_RATE_PERIOD } from './services/calculateService'
import './App.css'

type PageType = 'home' | 'simple' | 'input' | 'result'

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
          <span className="topbar-sub">中国電力エリア・低圧</span>
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
        />
      )}
      {currentPage === 'simple' && (
        <SimpleInput
          onComplete={handleInputComplete}
          onBack={() => setCurrentPage('home')}
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
          <ManualInput onComplete={handleInputComplete} onBack={() => setCurrentPage('home')} />
        </div>
      )}
      {currentPage === 'result' && (
        <ComparisonResult
          scenarioId={query.scenarioId}
          usage={query.usage}
          period={query.period}
          estimate={query.estimate}
          onBack={() => setCurrentPage(lastInputPage)}
        />
      )}
    </div>
  )
}
