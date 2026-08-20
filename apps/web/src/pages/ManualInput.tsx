import { useState } from 'react'
import { CURRENT_PLAN_OPTIONS } from '../services/calculateService'

interface ManualInputProps {
  onComplete: (usage: number, provider: string) => void;
  onBack: () => void;
}

export default function ManualInput({ onComplete, onBack }: ManualInputProps) {
  const [usage, setUsage] = useState('')
  const [provider, setProvider] = useState(CURRENT_PLAN_OPTIONS[0].planId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const usageNum = parseFloat(usage)
    if (isNaN(usageNum) || usageNum < 0) {
      alert('正の数値を入力してください')
      return
    }
    onComplete(usageNum, provider)
  }

  return (
    <div className="container">
      <div className="header">
        <h1>料金を入力</h1>
      </div>
      <div className="content">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="provider">
              <strong>現在のご契約プラン:</strong>
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              style={{ marginTop: '8px' }}
            >
              {CURRENT_PLAN_OPTIONS.map(o => (
                <option key={o.planId} value={o.planId}>{o.planName}</option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              検針票の「ご契約種別」欄をご確認ください
            </p>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="usage">
              <strong>月間使用量 (kWh):</strong>
            </label>
            <input
              id="usage"
              type="number"
              step="0.1"
              min="0"
              value={usage}
              onChange={(e) => setUsage(e.target.value)}
              placeholder="例: 250"
              style={{ marginTop: '8px' }}
              autoFocus
            />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              検針票の「ご使用量」または「今月の使用電力量」欄を入力してください
            </p>
          </div>

          <div className="button-group">
            <button type="button" className="secondary" onClick={onBack}>
              戻る
            </button>
            <button type="submit" className="primary" disabled={!usage}>
              比較する
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
