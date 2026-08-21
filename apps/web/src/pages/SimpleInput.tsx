import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import {
  DEFAULT_RATE_PERIOD,
  SCENARIOS,
  calculateComparison,
  estimateUsage,
  findScenario,
  formatCurrency,
  periodOptionsFor,
  supportsSimpleEstimate
} from '../services/calculateService'

export interface SimpleEstimate {
  billYen: number
  kwh: number
  exact: boolean
  estimatedBillYen: number
}

interface SimpleInputProps {
  onComplete: (
    scenarioId: string,
    usage: UsageInput,
    period: { year: number; month: number },
    estimate: SimpleEstimate
  ) => void;
  onBack: () => void;
  onSwitchToDetailed: () => void;
}

/** よくある契約容量。検針票が無くてもブレーカーの色や数字から選べる */
const COMMON_KVA = [6, 8, 10, 12, 15]
const COMMON_KW = [4, 5, 6, 8, 10]

/**
 * かんたん試算。
 *
 * 検針票が手元にないお客様向けに、**1か月の電気料金だけ**から使用量を戻す。
 * 逆算は実際の計算式をそのまま逆に引いたもので、近似式は使っていない。
 * ただし1kWhあたり数十円動くため、入力額ぴったりの使用量は無いことが多い。
 * 「およそ◯kWh」と出し、その使用量での請求額も併記する。
 */
export default function SimpleInput({ onComplete, onBack, onSwitchToDetailed }: SimpleInputProps) {
  const simpleScenarios = SCENARIOS.filter(supportsSimpleEstimate)
  const [scenarioId, setScenarioId] = useState(simpleScenarios[0].scenarioId)
  const [period, setPeriod] = useState(DEFAULT_RATE_PERIOD)
  const [billText, setBillText] = useState('')
  const [contract, setContract] = useState('6')

  const scenario = findScenario(scenarioId)!
  const periodOptions = periodOptionsFor(scenario)
  const billYen = billText.trim() === '' ? 0 : Number(billText)
  const contractValue = contract.trim() === '' ? 0 : Number(contract)

  const outcome = useMemo(
    () =>
      billText.trim() === ''
        ? null
        : estimateUsage(scenarioId, billYen, { period, contract: contractValue }),
    [scenarioId, billYen, billText, period, contractValue]
  )

  const usage: UsageInput | null = useMemo(() => {
    if (!outcome || outcome.status !== 'ok') return null
    const u: UsageInput = { totalKwh: outcome.estimate.kwh }
    if (scenario.contract === 'kw') u.contractKw = contractValue
    if (scenario.contract === 'kva') u.contractKva = contractValue
    return u
  }, [outcome, scenario, contractValue])

  const preview = useMemo(
    () => (usage ? calculateComparison(scenarioId, usage, { period }) : null),
    [usage, scenarioId, period]
  )

  const canProceed = outcome?.status === 'ok' && preview?.status === 'ok'

  return (
    <main className="wrap">
      <h1 className="page-title">かんたん試算</h1>
      <p className="page-lead">
        検針票がお手元になくても、1か月の電気料金がわかれば試算できます。
      </p>

      <div className="stack">
        <div className="card">
          <label className="field-label" htmlFor="simple-scenario">いまのご契約プラン</label>
          <select
            id="simple-scenario"
            className="select"
            value={scenarioId}
            onChange={e => {
              setScenarioId(e.target.value)
              const next = findScenario(e.target.value)
              if (
                next &&
                !periodOptionsFor(next).some(o => o.year === period.year && o.month === period.month)
              ) {
                setPeriod(DEFAULT_RATE_PERIOD)
              }
            }}
          >
            {simpleScenarios.map(s => (
              <option key={s.scenarioId} value={s.scenarioId}>{s.label}</option>
            ))}
          </select>
          <p className="field-hint">{scenario.hint}</p>
          <p className="note" style={{ marginTop: '10px' }}>
            時間帯別のプラン（電化Style・ファミリータイムなど）は、月ごとの内訳が
            電気料金だけでは決まりません。
            <button
              type="button"
              onClick={onSwitchToDetailed}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: 'var(--green)',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 'inherit',
                fontFamily: 'inherit',
                textDecoration: 'underline'
              }}
            >
              くわしい試算
            </button>
            からご入力ください。
          </p>
        </div>

        <div className="card">
          <label className="field-label" htmlFor="simple-period">いつの電気料金ですか</label>
          <select
            id="simple-period"
            className="select"
            value={`${period.year}-${period.month}`}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setPeriod({ year: y, month: m })
            }}
          >
            {periodOptions.map(p => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {p.year}年{p.month}月
              </option>
            ))}
          </select>
          <p className="field-hint">燃料費調整額はその月の実際の単価で計算します</p>
        </div>

        {scenario.contract !== 'none' && (
          <div className="card">
            <p className="card-title">
              {scenario.contract === 'kva' ? 'ご契約容量' : 'ご契約電力'}
            </p>
            <p className="card-sub">
              わからない場合は、いちばん多い
              {scenario.contract === 'kva' ? ' 6kVA ' : ' 6kW '}
              のままで結構です
            </p>
            <div className="chip-row">
              {(scenario.contract === 'kva' ? COMMON_KVA : COMMON_KW).map(v => (
                <button
                  key={v}
                  type="button"
                  className={contract === String(v) ? 'chip is-active' : 'chip'}
                  onClick={() => setContract(String(v))}
                >
                  {v}{scenario.contract === 'kva' ? 'kVA' : 'kW'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <label className="field-label" htmlFor="simple-bill">1か月の電気料金</label>
          <p className="field-hint">
            口座振替のお知らせやクレジットカードの明細に出ている金額で結構です
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <input
              id="simple-bill"
              className="input input-lg"
              type="number"
              inputMode="numeric"
              min="0"
              step="100"
              placeholder="10000"
              value={billText}
              onChange={e => setBillText(e.target.value)}
            />
            <span style={{ whiteSpace: 'nowrap' }}>円</span>
          </div>
        </div>

        {outcome?.status === 'ok' && (
          <div className="card hero">
            <p className="eyebrow">この金額から見たご使用量</p>
            <p className="hero-figure" style={{ fontSize: '40px' }}>
              およそ {outcome.estimate.kwh.toLocaleString()}
              <span style={{ fontSize: '0.4em', marginLeft: '0.15em' }}>kWh</span>
            </p>
            <p className="note">
              {outcome.estimate.exact
                ? `${formatCurrency(outcome.estimate.billYen)} ちょうどになるご使用量です。`
                : `このご使用量だと ${formatCurrency(outcome.estimate.billYen)} になります（ご入力は ${formatCurrency(billYen)}）。`}
              {outcome.estimate.rangeKwh.min !== outcome.estimate.rangeKwh.max &&
                ` 同じ金額になるご使用量は ${outcome.estimate.rangeKwh.min}〜${outcome.estimate.rangeKwh.max} kWh の幅があります。`}
            </p>
            {preview?.status === 'ok' && (
              <p className="note" style={{ marginTop: '10px' }}>
                <strong>{preview.view.recommended.planName}</strong> なら 月あたり{' '}
                <strong className="num">
                  {formatCurrency(Math.abs(preview.view.recommended.monthlySavingsYen))}
                </strong>
                {preview.view.recommended.monthlySavingsYen >= 0 ? 'おトク' : 'ご負担増'}です。
              </p>
            )}
          </div>
        )}

        {outcome?.status === 'unsupported' && <div className="note-warn">{outcome.reason}</div>}

        <div className="btn-row section-gap">
          <button type="button" className="btn btn-ghost" onClick={onBack}>戻る</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canProceed}
            onClick={() => {
              if (!usage || outcome?.status !== 'ok') return
              onComplete(scenarioId, usage, period, {
                billYen,
                kwh: outcome.estimate.kwh,
                exact: outcome.estimate.exact,
                estimatedBillYen: outcome.estimate.billYen
              })
            }}
          >
            詳しい結果を見る
          </button>
        </div>
      </div>
    </main>
  )
}
