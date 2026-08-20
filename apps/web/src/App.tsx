import { useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import Home from './pages/Home'
import ManualInput from './pages/ManualInput'
import ComparisonResult from './pages/ComparisonResult'
import { DEFAULT_RATE_PERIOD } from './services/calculateService'
import './App.css'

type PageType = 'home' | 'input' | 'result'

interface Query {
  scenarioId: string
  usage: UsageInput
  period: { year: number; month: number }
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [query, setQuery] = useState<Query>({
    scenarioId: 'chugoku_juryo_a',
    usage: {},
    period: DEFAULT_RATE_PERIOD
  })

  const handleInputComplete = (
    scenarioId: string,
    usage: UsageInput,
    period: { year: number; month: number }
  ) => {
    setQuery({ scenarioId, usage, period })
    setCurrentPage('result')
  }

  return (
    <div className="app">
      {currentPage === 'home' && <Home onStartInput={() => setCurrentPage('input')} />}
      {currentPage === 'input' && (
        <ManualInput onComplete={handleInputComplete} onBack={() => setCurrentPage('home')} />
      )}
      {currentPage === 'result' && (
        <ComparisonResult
          scenarioId={query.scenarioId}
          usage={query.usage}
          period={query.period}
          onBack={() => setCurrentPage('input')}
        />
      )}
    </div>
  )
}
