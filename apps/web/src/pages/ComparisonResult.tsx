import { useMemo } from 'react'
import { calculateComparison, formatCurrency, formatPercentage } from '../services/calculateService'

interface ComparisonResultProps {
  usageKwh: number;
  currentProvider: string;
  onBack: () => void;
}

export default function ComparisonResult({ usageKwh, currentProvider, onBack }: ComparisonResultProps) {
  const comparison = useMemo(
    () => calculateComparison(usageKwh, currentProvider),
    [usageKwh, currentProvider]
  )

  const monthlySavingColor = comparison.monthlySavings > 0 ? '#16a34a' : '#dc2626'

  return (
    <div className="container">
      <div className="header">
        <h1>料金比較結果</h1>
      </div>
      <div className="content">
        <div style={{
          background: 'linear-gradient(135deg, #2d9d78 0%, #247a5f 100%)',
          color: 'white',
          padding: '30px',
          borderRadius: '12px',
          marginBottom: '30px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>毎月のお得額</p>
          <h2 style={{ fontSize: '32px', margin: '10px 0' }}>
            {formatCurrency(comparison.monthlySavings)}
          </h2>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            年間削減額: {formatCurrency(comparison.annualSavings)}
          </p>
          {comparison.campaignBonus > 0 && (
            <p style={{ fontSize: '12px', opacity: 0.85, marginTop: '10px' }}>
              + キャンペーン割引 {formatCurrency(comparison.campaignBonus)} (初期3か月)
            </p>
          )}
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>料金比較表</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '12px' }}>
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '5px' }}>現在</p>
              <p style={{ fontWeight: 'bold', fontSize: '16px' }}>{formatCurrency(comparison.currentProviderCharge)}</p>
            </div>
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '5px' }}>JAでんき</p>
              <p style={{ fontWeight: 'bold', fontSize: '16px' }}>
                {comparison.recommendedPlan === 'raten_a'
                  ? formatCurrency(comparison.jadenRatenACharge)
                  : formatCurrency(comparison.jadenRatenSCharge)}
              </p>
            </div>
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '5px' }}>削減額</p>
              <p style={{ fontWeight: 'bold', fontSize: '16px', color: monthlySavingColor }}>
                {formatCurrency(comparison.monthlySavings)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>推奨プラン</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>推奨プラン</p>
              <p style={{ fontWeight: 'bold' }}>
                {comparison.recommendedPlan === 'raten_a' ? 'JAでんき 従量電灯A' : 'JAでんき 従量電灯S'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>削減率</p>
              <p style={{ fontWeight: 'bold' }}>
                {comparison.monthlySavingsPercent >= 0 ? '-' : '+'}{formatPercentage(Math.abs(comparison.monthlySavingsPercent))}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>月間使用量</p>
              <p style={{ fontWeight: 'bold' }}>{usageKwh.toLocaleString()} kWh</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>電力会社</p>
              <p style={{ fontWeight: 'bold' }}>中国電力</p>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '20px', padding: '15px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <p style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.6' }}>
            <strong>注意:</strong> この試算は相対値をベースにした概算値です。正確な金額については、
            JAでんきの公式サイトまたは営業担当までお問い合わせください。
            燃料費調整や再エネ賦課金の詳細は今後更新される予定です。
          </p>
        </div>

        <button className="primary button-full" onClick={onBack}>
          別の条件で比較する
        </button>
      </div>
    </div>
  )
}
