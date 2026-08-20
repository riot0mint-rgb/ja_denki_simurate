import { useState } from 'react'
import Home from './pages/Home'
import ManualInput from './pages/ManualInput'
import ComparisonResult from './pages/ComparisonResult'
import './App.css'

type PageType = 'home' | 'input' | 'result'

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home')
  const [usageKwh, setUsageKwh] = useState<number>(0)
  const [currentProvider, setCurrentProvider] = useState<string>('chugoku')

  const handleStartInput = () => {
    setCurrentPage('input')
  }

  const handleInputComplete = (usage: number, provider: string) => {
    setUsageKwh(usage)
    setCurrentProvider(provider)
    setCurrentPage('result')
  }

  const handleBackHome = () => {
    setCurrentPage('home')
  }

  return (
    <div className="app">
      {currentPage === 'home' && (
        <Home onStartInput={handleStartInput} />
      )}
      {currentPage === 'input' && (
        <ManualInput onComplete={handleInputComplete} onBack={handleBackHome} />
      )}
      {currentPage === 'result' && (
        <ComparisonResult usageKwh={usageKwh} currentProvider={currentProvider} onBack={handleBackHome} />
      )}
    </div>
  )
}
