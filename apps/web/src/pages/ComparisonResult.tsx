import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import { calculateComparison, formatCurrency, formatPercentage } from '../services/calculateService'

interface ComparisonResultProps {
  scenarioId: string;
  usage: UsageInput;
  period: { year: number; month: number };
  onBack: () => void;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  padding: '20px',
  borderRadius: '8px',
  marginBottom: '20px'
}

export default function ComparisonResult({ scenarioId, usage, period, onBack }: ComparisonResultProps) {
  const [gasSet, setGasSet] = useState(false)
  const outcome = useMemo(
    () => calculateComparison(scenarioId, usage, { period, gasSetDiscount: gasSet }),
    [scenarioId, usage, period, gasSet]
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

  return (
    <div className="container">
      <div className="header"><h1>料金比較結果</h1></div>
      <div className="content">
        <div style={{
          background: isSaving
            ? 'linear-gradient(135deg, #2d9d78 0%, #247a5f 100%)'
            : 'linear-gradient(135deg, #9d5b2d 0%, #7a4724 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {isSaving ? '毎月のお得額' : '毎月の差額（現在の方が安い）'}
          </p>
          <h2 style={{ fontSize: '32px', margin: '10px 0' }}>{formatCurrency(Math.abs(savings))}</h2>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            年間{isSaving ? '削減額' : '増加額'}: {formatCurrency(Math.abs(v.annualSavingsYen))}
          </p>
          <p style={{ fontSize: '12px', opacity: 0.85, marginTop: '10px' }}>
            初年度合計（新規契約割引 {formatCurrency(v.firstYearSpecialDiscountYen)} 含む）:{' '}
            {formatCurrency(v.firstYearSavingsYen)}
          </p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginBottom: '4px' }}>料金比較表</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {v.ratePeriodLabel} ／ ご使用量 {v.totalKwh.toLocaleString()} kWh
          </p>
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
                // 削減にならないプランを「推奨」と表示しない。候補が1件しかない
                // シナリオ（ナイトホリデー→夜トクなど）では、最安＝唯一の候補が
                // 現行より高いことがある。
                const rec = c.planId === v.recommended.planId && isSaving
                return (
                  <tr key={c.planId} style={{ borderBottom: '1px solid var(--border, #eee)' }}>
                    <td style={{ padding: '8px 4px', fontWeight: rec ? 'bold' : 'normal' }}>
                      {c.planName}{rec ? '  ★推奨' : ''}
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
          <p style={{ fontSize: '13px', marginTop: '12px' }}>
            {isSaving ? (
              <>
                推奨: <strong>{v.recommended.planName}</strong>（削減率{' '}
                {formatPercentage(v.savingsPercent)}）
              </>
            ) : (
              <>
                このご使用量では <strong>{v.recommended.planName}</strong> に切り替えても
                安くなりません。現在のご契約のご継続をおすすめします。
              </>
            )}
          </p>
        </div>

        <div style={cardStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={gasSet} onChange={e => setGasSet(e.target.checked)} />
            <span>ガスとでんきのセット割を適用する（月110円）</span>
          </label>
        </div>

        <details style={cardStyle}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>計算の内訳を表示</summary>
          <div style={{ marginTop: '15px', fontSize: '12px', lineHeight: 1.8 }}>
            {[v.current, ...v.candidates].map(p => (
              <div key={p.planId}>
                <p style={{ fontWeight: 'bold', marginTop: '10px' }}>{p.planName}</p>
                <p style={{ color: 'var(--text-secondary)' }}>{p.formula}</p>
                {p.notes.map(n => (
                  <p key={n} style={{ color: '#92400e' }}>※ {n}</p>
                ))}
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
            <strong>注意:</strong> {v.ratePeriodLabel}の単価による試算です。
            燃料費調整額・再エネ賦課金は毎月改定されます。
            検針票発行手数料（1契約55円）やポイント還元は含んでいません。
            正確な金額は営業担当までお問い合わせください。
          </p>
        </div>

        <button className="primary button-full" onClick={onBack}>条件を変えて試算する</button>
      </div>
    </div>
  )
}
