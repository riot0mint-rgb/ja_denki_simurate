import { useMemo } from 'react'
import { calculateComparison, formatCurrency, formatPercentage } from '../services/calculateService'

interface ComparisonResultProps {
  usageKwh: number;
  currentProvider: string;
  onBack: () => void;
}

const cardStyle = {
  background: 'var(--bg-secondary)',
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '20px'
} as const

export default function ComparisonResult({ usageKwh, currentProvider, onBack }: ComparisonResultProps) {
  const outcome = useMemo(
    () => calculateComparison(usageKwh, currentProvider),
    [usageKwh, currentProvider]
  )

  if (outcome.status === 'unsupported') {
    return (
      <div className="container">
        <div className="header"><h1>料金比較結果</h1></div>
        <div className="content">
          <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b', background: '#fef3c7' }}>
            <h3 style={{ marginBottom: '10px', color: '#92400e' }}>自動計算に対応していません</h3>
            <p style={{ color: '#92400e', marginBottom: '15px' }}>{outcome.reason}</p>
            <ul style={{ color: '#92400e', fontSize: '13px', lineHeight: 1.8, paddingLeft: '20px' }}>
              {outcome.nextSteps.map(step => <li key={step}>{step}</li>)}
            </ul>
          </div>
          <button className="primary button-full" onClick={onBack}>入力し直す</button>
        </div>
      </div>
    )
  }

  const v = outcome.view
  const savings = v.recommended.monthlySavingsYen
  const isSaving = savings > 0
  const savingColor = isSaving ? '#16a34a' : '#dc2626'

  return (
    <div className="container">
      <div className="header">
        <h1>料金比較結果</h1>
      </div>
      <div className="content">
        <div style={{
          background: isSaving
            ? 'linear-gradient(135deg, #2d9d78 0%, #247a5f 100%)'
            : 'linear-gradient(135deg, #9d5b2d 0%, #7a4724 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {isSaving ? '毎月のお得額' : '毎月の差額（現在の方が安い）'}
          </p>
          <h2 style={{ fontSize: '32px', margin: '10px 0' }}>
            {formatCurrency(Math.abs(savings))}
          </h2>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            年間{isSaving ? '削減額' : '増加額'}: {formatCurrency(Math.abs(v.annualSavingsYen))}
          </p>
          <p style={{ fontSize: '12px', opacity: 0.85, marginTop: '10px' }}>
            初年度合計（新規契約割引 {formatCurrency(v.firstYearSpecialDiscountYen)} を含む）:{' '}
            {formatCurrency(v.firstYearSavingsYen)}
          </p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginBottom: '15px' }}>料金比較表（{v.ratePeriod}）</h3>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #ddd)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px' }}>プラン</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>月額</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>差額</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                <td style={{ padding: '8px 4px' }}>{v.current.planName}（現在）</td>
                <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 'bold' }}>
                  {formatCurrency(v.current.monthlyChargeYen)}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-secondary)' }}>—</td>
              </tr>
              {v.candidates.map(c => {
                const recommended = c.planId === v.recommended.planId
                return (
                  <tr key={c.planId} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '8px 4px', fontWeight: recommended ? 'bold' : 'normal' }}>
                      {c.planName}{recommended ? '  ★推奨' : ''}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 'bold' }}>
                      {formatCurrency(c.monthlyChargeYen)}
                    </td>
                    <td style={{
                      textAlign: 'right',
                      padding: '8px 4px',
                      color: c.monthlySavingsYen > 0 ? '#16a34a' : '#dc2626'
                    }}>
                      {c.monthlySavingsYen > 0 ? '−' : '+'}{formatCurrency(Math.abs(c.monthlySavingsYen))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginBottom: '15px' }}>推奨プラン</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>推奨プラン</p>
              <p style={{ fontWeight: 'bold' }}>{v.recommended.planName}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>削減率</p>
              <p style={{ fontWeight: 'bold', color: savingColor }}>
                {formatPercentage(v.savingsPercent)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>月間使用量</p>
              <p style={{ fontWeight: 'bold' }}>{usageKwh.toLocaleString()} kWh</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>現在のご契約</p>
              <p style={{ fontWeight: 'bold' }}>{v.current.planName}</p>
            </div>
          </div>
        </div>

        <details style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>計算の内訳を表示</summary>
          <div style={{ marginTop: '15px', fontSize: '12px', lineHeight: 1.8 }}>
            <p style={{ fontWeight: 'bold', marginTop: '10px' }}>{v.current.planName}</p>
            <p style={{ color: 'var(--text-secondary)' }}>{v.current.formula}</p>
            {v.candidates.map(c => (
              <div key={c.planId}>
                <p style={{ fontWeight: 'bold', marginTop: '10px' }}>{c.planName}</p>
                <p style={{ color: 'var(--text-secondary)' }}>{c.formula}</p>
              </div>
            ))}
            <p style={{ fontWeight: 'bold', marginTop: '15px' }}>単価の出典</p>
            <ul style={{ color: 'var(--text-secondary)', paddingLeft: '20px' }}>
              {v.sources.map(s => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </details>

        <div style={{ marginBottom: '20px', padding: '15px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <p style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.6' }}>
            <strong>注意:</strong> {v.ratePeriod}の単価による試算です。
            燃料費調整額・再エネ賦課金は毎月改定されるため、実際の請求額とは異なる場合があります。
            {!v.gasSetDiscountApplied && ' ガスとでんきのセット割は含んでいません。'}
            正確な金額は営業担当までお問い合わせください。
          </p>
        </div>

        <button className="primary button-full" onClick={onBack}>
          別の条件で比較する
        </button>
      </div>
    </div>
  )
}
