import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import {
  DISCOUNT_TERMS,
  calculateComparison,
  formatCurrency,
  formatPercentage
} from '../services/calculateService'

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

/**
 * 印刷（PDF保存）。営業がその場でお客様に渡せるように、内訳と出典まで含めて出す。
 *
 * 個人情報は一切載せない。そもそもこの画面が持っているのは使用量・契約容量・
 * プラン名だけで、氏名も住所も入力させていない（CLAUDE.md ルール7・9）。
 */
function usePrint(openDetails: (open: boolean) => void) {
  return () => {
    // 内訳は畳まれていると印刷にも出ないため、印刷の前だけ開く
    openDetails(true)
    // 開いた状態を描画してから印刷ダイアログを出す
    requestAnimationFrame(() => window.print())
  }
}

export default function ComparisonResult({ scenarioId, usage, period, onBack }: ComparisonResultProps) {
  const [gasSet, setGasSet] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const handlePrint = usePrint(setDetailsOpen)
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
  // 年額はガスセット割を含むため、月額と符号が食い違うことがある
  // （月 -50円 でもセット割 +110円/月 で年間は +720円）。年額の符号は年額で判断する
  const isSavingAnnually = v.annualSavingsYen > 0

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
            年間{isSavingAnnually ? '削減額' : '増加額'}: {formatCurrency(Math.abs(v.annualSavingsYen))}
          </p>
          <p style={{ fontSize: '12px', opacity: 0.85, marginTop: '10px' }}>
            初年度合計（新規契約割引 {formatCurrency(v.firstYearSpecialDiscountYen)} 含む）:{' '}
            {formatCurrency(v.firstYearSavingsYen)}
          </p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginBottom: '4px' }}>料金比較表</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            検針月 {v.ratePeriodLabel} ／ 単価 {v.unitPriceEffectiveLabel} ／ ご使用量{' '}
            {v.totalKwh.toLocaleString()} kWh
          </p>
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px' }}>プラン</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>月額</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>差額</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
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
                  <tr key={c.planId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '8px 4px', fontWeight: rec ? 'bold' : 'normal' }}>
                      {c.planName}{rec ? '  ★推奨' : ''}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 4px', fontWeight: 'bold' }}>
                      {formatCurrency(c.monthlyChargeYen)}
                    </td>
                    <td style={{
                      textAlign: 'right',
                      padding: '8px 4px',
                      color:
                        c.monthlySavingsYen > 0
                          ? '#16a34a'
                          : c.monthlySavingsYen < 0
                            ? '#dc2626'
                            : 'var(--text-secondary)'
                    }}>
                      {/* 同額のときに「+￥0」を赤で出すと、高くなったように読める */}
                      {c.monthlySavingsYen === 0
                        ? '同額'
                        : `${c.monthlySavingsYen > 0 ? '−' : '+'}${formatCurrency(Math.abs(c.monthlySavingsYen))}`}
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

        <div style={cardStyle} className={gasSet ? undefined : 'print-hide'}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={gasSet} onChange={e => setGasSet(e.target.checked)} />
            <span>ガスとでんきのセット割を適用する（月{DISCOUNT_TERMS.gasSetMonthlyYen}円）</span>
          </label>
        </div>

        <details
          style={cardStyle}
          open={detailsOpen}
          onToggle={e => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            {/* 紙では「表示」が操作の指示に読めてしまうので見出しに変える */}
            <span className="print-hide">計算の内訳を表示</span>
            <span className="print-only">計算の内訳</span>
          </summary>
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

        {/* 紙で受け取った人が「いつ時点の試算か」を判断できるようにする。
            日付は個人情報ではなく、印刷物の有効期限の目安として必要 */}
        <p className="print-only" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          試算日: {new Date().toLocaleDateString('ja-JP')} ／ 検針月: {v.ratePeriodLabel} ／ 単価:{' '}
          {v.unitPriceEffectiveLabel}
        </p>

        <div style={{ marginBottom: '20px', padding: '15px', background: '#fef3c7', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <p style={{ fontSize: '12px', color: '#92400e', lineHeight: '1.6' }}>
            <strong>注意:</strong> {v.unitPriceEffectiveLabel}の単価に、
            {v.ratePeriodLabel}の燃料費調整額・再エネ賦課金を当てた試算です。
            燃料費調整額・再エネ賦課金は毎月改定されます。
            {v.periodPrecedesUnitPrices &&
              `なお ${v.ratePeriodLabel} は単価の適用開始より前のため、実際の請求額とは異なります。`}
            検針票発行手数料（1契約55円）やポイント還元は含んでいません。
            正確な金額は営業担当までお問い合わせください。
          </p>
        </div>

        <div className="button-group print-hide">
          <button className="secondary" onClick={handlePrint}>PDFで保存・印刷</button>
          <button className="primary" onClick={onBack}>条件を変えて試算する</button>
        </div>
      </div>
    </div>
  )
}
