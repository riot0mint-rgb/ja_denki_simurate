interface ComparisonResultProps {
  usageKwh: number;
  currentProvider: string;
  onBack: () => void;
}

export default function ComparisonResult({ usageKwh, currentProvider, onBack }: ComparisonResultProps) {
  const monthlySavings = 500 // Placeholder - will be calculated by calc-core
  const annualSavings = monthlySavings * 12

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
          <h2 style={{ fontSize: '32px', margin: '10px 0' }}>¥{monthlySavings.toLocaleString()}</h2>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>年間削減額: ¥{annualSavings.toLocaleString()}</p>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>比較条件</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>電力会社</p>
              <p style={{ fontWeight: 'bold' }}>{currentProvider === 'chugoku' ? '中国電力' : currentProvider}</p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>月間使用量</p>
              <p style={{ fontWeight: 'bold' }}>{usageKwh} kWh</p>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ marginBottom: '10px' }}>詳細</h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
            この試算は相対値をベースにした概算値です。正確な金額については、
            JAでんきの公式サイトまたは営業担当までお問い合わせください。
          </p>
        </div>

        <button className="primary button-full" onClick={onBack}>
          別の条件で比較する
        </button>
      </div>
    </div>
  )
}
