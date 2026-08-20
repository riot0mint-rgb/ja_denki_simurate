import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import {
  DEFAULT_RATE_PERIOD,
  PERIOD_OPTIONS,
  SCENARIOS,
  findScenario,
  formatCurrency,
  calculateComparison,
  isSummerMonth
} from '../services/calculateService'

interface ManualInputProps {
  onComplete: (scenarioId: string, usage: UsageInput, period: { year: number; month: number }) => void;
  onBack: () => void;
}

/** よくある契約容量。タップで選べるようにして数値入力の手間を省く。 */
const COMMON_KW = [4, 5, 6, 8, 10]
const COMMON_KVA = [6, 8, 10, 12, 15]

const numberFieldStyle: React.CSSProperties = {
  marginTop: '6px',
  fontSize: '18px',
  padding: '12px',
  width: '100%'
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  borderRadius: '999px',
  border: active ? '2px solid #2d9d78' : '1px solid var(--border, #ccc)',
  background: active ? 'rgba(45,157,120,0.12)' : 'transparent',
  color: 'inherit',
  fontWeight: active ? 700 : 400,
  cursor: 'pointer',
  fontSize: '15px'
})

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  padding: '16px',
  borderRadius: '8px',
  marginBottom: '16px'
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label htmlFor={id}><strong>{label}</strong></label>
      {hint && (
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{hint}</p>
      )}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="1"
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0"
        style={numberFieldStyle}
      />
    </div>
  )
}

export default function ManualInput({ onComplete, onBack }: ManualInputProps) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].scenarioId)
  const [period, setPeriod] = useState(DEFAULT_RATE_PERIOD)
  const [totalKwh, setTotalKwh] = useState('')
  const [contract, setContract] = useState('6')
  const [summerKwh, setSummerKwh] = useState('')
  const [otherKwh, setOtherKwh] = useState('')
  const [dayKwh, setDayKwh] = useState('')
  const [nightKwh, setNightKwh] = useState('')
  const [holidayKwh, setHolidayKwh] = useState('')

  const scenario = findScenario(scenarioId)!
  const summer = isSummerMonth(period.month)
  const num = (s: string) => (s.trim() === '' ? 0 : Number(s))

  const usage: UsageInput = useMemo(() => {
    const base: UsageInput = {}
    if (scenario.contract === 'kw') base.contractKw = num(contract)
    if (scenario.contract === 'kva') base.contractKva = num(contract)

    if (scenario.usageForm === 'total') {
      base.totalKwh = num(totalKwh)
    } else if (scenario.usageForm === 'seasonal') {
      // 対象月で夏季かその他季かが決まるため、入力欄は 1 つで足りる
      base.seasonal = summer
        ? { summerKwh: num(summerKwh), otherKwh: 0 }
        : { summerKwh: 0, otherKwh: num(otherKwh) }
      base.totalKwh = summer ? num(summerKwh) : num(otherKwh)
    } else {
      // 同上。デイタイムは夏季／その他季のどちらか一方しか発生しない
      base.tou = {
        daySummer: summer ? num(dayKwh) : 0,
        dayOther: summer ? 0 : num(dayKwh),
        night: num(nightKwh),
        holiday: num(holidayKwh)
      }
    }
    return base
  }, [scenario, contract, totalKwh, summerKwh, otherKwh, dayKwh, nightKwh, holidayKwh, summer])

  // 入力しながら結果が見えるほうが検針票との突き合わせが速い
  const preview = useMemo(
    () => calculateComparison(scenarioId, usage, { period }),
    [scenarioId, usage, period]
  )

  const touTotal = num(dayKwh) + num(nightKwh) + num(holidayKwh)
  const hasInput =
    scenario.usageForm === 'total'
      ? totalKwh.trim() !== ''
      : scenario.usageForm === 'seasonal'
        ? (summer ? summerKwh : otherKwh).trim() !== ''
        : touTotal > 0

  return (
    <div className="container">
      <div className="header"><h1>料金を試算</h1></div>
      <div className="content">
        <div style={cardStyle}>
          <label htmlFor="scenario"><strong>現在のご契約プラン</strong></label>
          <select
            id="scenario"
            value={scenarioId}
            onChange={e => setScenarioId(e.target.value)}
            style={{ marginTop: '8px', fontSize: '16px', padding: '10px' }}
          >
            {SCENARIOS.map(s => (
              <option key={s.scenarioId} value={s.scenarioId}>{s.label}</option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            {scenario.hint}
          </p>
        </div>

        <div style={cardStyle}>
          <label htmlFor="period"><strong>検針月</strong></label>
          <select
            id="period"
            value={`${period.year}-${period.month}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setPeriod({ year: y, month: m })
            }}
            style={{ marginTop: '8px', fontSize: '16px', padding: '10px' }}
          >
            {PERIOD_OPTIONS.map(p => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {p.year}年{p.month}月
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            燃料費調整額・再エネ賦課金は月ごとに改定されます
            {scenario.usageForm !== 'total' && (summer ? '（夏季料金の期間です）' : '（その他季の期間です）')}
          </p>
        </div>

        {scenario.contract !== 'none' && (
          <div style={cardStyle}>
            <strong>{scenario.contract === 'kva' ? 'ご契約容量' : 'ご契約電力'}</strong>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 10px' }}>
              検針票の「ご契約{scenario.contract === 'kva' ? '容量' : '電力'}」欄
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {(scenario.contract === 'kva' ? COMMON_KVA : COMMON_KW).map(v => (
                <button
                  key={v}
                  type="button"
                  style={chipStyle(contract === String(v))}
                  onClick={() => setContract(String(v))}
                >
                  {v}{scenario.contract === 'kva' ? 'kVA' : 'kW'}
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={contract}
              onChange={e => setContract(e.target.value)}
              style={numberFieldStyle}
              aria-label={scenario.contract === 'kva' ? 'ご契約容量' : 'ご契約電力'}
            />
          </div>
        )}

        <div style={cardStyle}>
          {scenario.usageForm === 'total' && (
            <NumberField
              id="usage"
              label="ご使用量 (kWh)"
              hint="検針票の「ご使用量」欄"
              value={totalKwh}
              onChange={setTotalKwh}
            />
          )}

          {scenario.usageForm === 'seasonal' && (
            <NumberField
              id="usage"
              label={summer ? 'ご使用量 (kWh)・夏季単価' : 'ご使用量 (kWh)・その他季単価'}
              hint={
                summer
                  ? '7〜9月は夏季単価が適用されます'
                  : '4〜6月・10〜3月はその他季単価が適用されます'
              }
              value={summer ? summerKwh : otherKwh}
              onChange={summer ? setSummerKwh : setOtherKwh}
            />
          )}

          {scenario.usageForm === 'tou' && (
            <>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                検針票の時間帯ごとのご使用量を入力してください
              </p>
              <NumberField
                id="day"
                label={summer ? 'デイタイム（夏季） kWh' : 'デイタイム kWh'}
                value={dayKwh}
                onChange={setDayKwh}
              />
              <NumberField id="night" label="ナイトタイム kWh" value={nightKwh} onChange={setNightKwh} />
              <NumberField
                id="holiday"
                label="ホリデータイム kWh"
                hint="土日祝の日中。区分がない検針票は 0 のままで結構です"
                value={holidayKwh}
                onChange={setHolidayKwh}
              />
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(45,157,120,0.10)',
                  fontSize: '14px'
                }}
              >
                合計 <strong>{touTotal.toLocaleString()}</strong> kWh
                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>
                  検針票の合計と一致するか確認してください
                </span>
              </div>
            </>
          )}
        </div>

        {hasInput && preview.status === 'ok' && (
          <div
            style={{
              ...cardStyle,
              background: 'linear-gradient(135deg, #2d9d78 0%, #247a5f 100%)',
              color: 'white'
            }}
          >
            <p style={{ fontSize: '13px', opacity: 0.9, margin: 0 }}>試算中</p>
            <p style={{ fontSize: '15px', margin: '6px 0 0' }}>
              {preview.view.recommended.planName}なら{' '}
              <strong style={{ fontSize: '22px' }}>
                {formatCurrency(Math.abs(preview.view.recommended.monthlySavingsYen))}
              </strong>{' '}
              {preview.view.recommended.monthlySavingsYen >= 0 ? '月々おトク' : '月々割高'}
            </p>
          </div>
        )}

        {hasInput && preview.status === 'unsupported' && (
          <div style={{ ...cardStyle, background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
            <p style={{ color: '#92400e', fontSize: '13px', margin: 0 }}>{preview.reason}</p>
          </div>
        )}

        <div className="button-group">
          <button type="button" className="secondary" onClick={onBack}>戻る</button>
          <button
            type="button"
            className="primary"
            disabled={!hasInput}
            onClick={() => onComplete(scenarioId, usage, period)}
          >
            詳しい結果を見る
          </button>
        </div>
      </div>
    </div>
  )
}
