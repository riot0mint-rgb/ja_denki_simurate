import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import Icon from '../components/Icon'
import {
  DEFAULT_RATE_PERIOD,
  calculateAnnual,
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

  // 年額は月額の12倍ではない。かんたん試算でも1年分を出す
  const annual = useMemo(
    () =>
      usage && preview?.status === 'ok'
        ? calculateAnnual(scenarioId, usage, preview.view.recommended.planId, { period })
        : null,
    [usage, preview, scenarioId, period]
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
          <div className="card-head" style={{ marginBottom: '4px' }}>
            <span className="badge-icon badge-leaf"><Icon name="receipt" size={20} /></span>
            <label className="field-label" htmlFor="simple-scenario">いまのご契約プラン</label>
          </div>
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
          <div className="card-head" style={{ marginBottom: '4px' }}>
            <span className="badge-icon badge-teal"><Icon name="calendar" size={20} /></span>
            <label className="field-label" htmlFor="simple-period">いつの電気料金ですか</label>
          </div>
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
            <div className="card-head" style={{ marginBottom: '4px' }}>
              <span className="badge-icon badge-green"><Icon name="bolt" size={20} /></span>
              <p className="card-title">
                {scenario.contract === 'kva' ? 'ご契約容量' : 'ご契約電力'}
              </p>
            </div>
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
          <div className="card-head" style={{ marginBottom: '4px' }}>
            <span className="badge-icon badge-green"><Icon name="bolt" size={20} /></span>
            <label className="field-label" htmlFor="simple-bill">1か月の電気料金</label>
          </div>
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

        {outcome?.status === 'ok' && preview?.status === 'ok' && (
          <div className="card hero">
            <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="coins" size={18} />
              {preview.view.recommended.planName} なら
            </p>

            {/* いちばん大きいのは1年のおトク額。使用量はその根拠として下に小さく置く */}
            {annual && (
              <>
                <p
                  className={`figure-xl ${annual.savingsYen >= 0 ? 'figure-gain' : 'figure-loss'}`}
                  style={{ margin: '10px 0 0' }}
                >
                  {formatCurrency(Math.abs(annual.savingsYen))}
                  <span className="figure-word">
                    {annual.savingsYen >= 0 ? 'おトク' : 'ご負担増'}
                  </span>
                </p>
                <p className="note" style={{ marginTop: '2px' }}>1年あたり</p>
              </>
            )}

            <p
              className={`figure-lg ${
                preview.view.recommended.monthlySavingsYen >= 0 ? 'figure-gain' : 'figure-loss'
              }`}
              style={{ marginTop: '16px' }}
            >
              {formatCurrency(Math.abs(preview.view.recommended.monthlySavingsYen))}
              <span className="figure-word">
                {preview.view.recommended.monthlySavingsYen >= 0 ? 'おトク' : 'ご負担増'}
              </span>
            </p>
            <p className="note" style={{ marginTop: '2px' }}>1か月あたり</p>

            <p
              className="note"
              style={{
                marginTop: '18px',
                paddingTop: '14px',
                borderTop: '1px solid var(--field-line)'
              }}
            >
              電気料金 {formatCurrency(billYen)} から、ご使用量を{' '}
              <strong className="num">およそ {outcome.estimate.kwh.toLocaleString()} kWh</strong>{' '}
              と見ています。
              {!outcome.estimate.exact &&
                `このご使用量だと ${formatCurrency(outcome.estimate.billYen)} になります。`}
              {outcome.estimate.rangeKwh.min !== outcome.estimate.rangeKwh.max &&
                ` 同じ金額になるご使用量は ${outcome.estimate.rangeKwh.min}〜${outcome.estimate.rangeKwh.max} kWh の幅があります。`}
            </p>
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
