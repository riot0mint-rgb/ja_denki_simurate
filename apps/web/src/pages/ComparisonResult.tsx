import { useEffect, useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import Icon from '../components/Icon'
import { DEMAND_PROFILE } from '../data/demandProfile'
import { EstimateSummary } from '../services/estimateTalk'
import {
  AnnualView,
  GAS_SET_DISCOUNT_YEN,
  calculateAnnual,
  AnnualMethod,
  calculateComparison,
  formatCurrency,
  formatPercentage
} from '../services/calculateService'

interface ComparisonResultProps {
  scenarioId: string;
  usage: UsageInput;
  period: { year: number; month: number };
  /** かんたん試算で電気料金から使用量を逆算した場合の内訳 */
  estimate?: { billYen: number; kwh: number; exact: boolean; estimatedBillYen: number };
  /**
   * 試算の要点を外へ知らせる。商談ナビが「高くなるなら勧めない」に倒すのと、
   * 商談の記録に使う。個人にたどり着く値は渡さない
   */
  onEstimateSummary?: (summary: EstimateSummary) => void;
  /** 商談ナビから来たときだけ。試算のあと台本へ戻る導線 */
  onReturnToCoach?: () => void;
  onBack: () => void;
}

const gasSetOnLabel = `あり（月${GAS_SET_DISCOUNT_YEN}円割引）`

const GAS_SET_OPTIONS: ReadonlyArray<{ value: boolean; label: string }> = [
  { value: false, label: 'なし' },
  { value: true, label: gasSetOnLabel }
]

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

/** 通貨記号を一段小さく組む。数字を主役に見せるため */
function BigMoney({ yen }: { yen: number }) {
  const text = formatCurrency(Math.abs(yen))
  return (
    <>
      <span className="yen">{text.slice(0, 1)}</span>
      {text.slice(1)}
    </>
  )
}

/** 金額の向きを色だけで伝えない。必ず語を添える */
function toneOf(yen: number): { className: string; word: string } {
  if (yen > 0) return { className: 'figure-gain', word: 'おトク' }
  if (yen < 0) return { className: 'figure-loss', word: 'ご負担増' }
  return { className: 'figure-flat', word: '同額' }
}

/** 現在と乗り換え後の年額を横棒で並べる。長さの比が差額の実感になる */
function CompareBars({
  currentName,
  currentYen,
  candidateName,
  candidateYen
}: {
  currentName: string
  currentYen: number
  candidateName: string
  candidateYen: number
}) {
  const widest = Math.max(currentYen, candidateYen, 1)
  const diff = currentYen - candidateYen
  const rows = [
    {
      name: currentName,
      suffix: '（現在）',
      yen: currentYen,
      color: 'var(--leaf)',
      chip: null as string | null,
      chipColor: ''
    },
    {
      name: candidateName,
      suffix: '',
      yen: candidateYen,
      color: 'var(--green-bright)',
      chip: diff === 0 ? '同額' : `${diff > 0 ? '−' : '+'}${formatCurrency(Math.abs(diff))}`,
      // 差額チップは向きで色を変える。安くなっていないのに緑だと逆に読める
      chipColor:
        diff > 0 ? 'var(--green-bright)' : diff < 0 ? 'var(--loss)' : 'var(--ink-3)'
    }
  ]
  return (
    <div className="compare-bars">
      {rows.map(r => (
        <div className="compare-row" key={r.name}>
          <span className="compare-name">
            <span>{r.name}</span>
            {r.suffix}
          </span>
          <span className="compare-amount num">
            {formatCurrency(r.yen)}
            {r.chip && (
              <span
                className="delta-chip"
                style={{ marginLeft: '8px', background: r.chipColor }}
              >
                {r.chip}
              </span>
            )}
          </span>
          <span className="compare-track">
            <span
              className="compare-fill"
              style={{ width: `${Math.max(2, (r.yen / widest) * 100)}%`, background: r.color }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * 月ごとの請求額を現在と乗り換え後で並べる。
 *
 * 差額だけを描くと、同じ燃調を使うプランどうしでは棒が横一線になって
 * 何も分からない。実際の請求額を並べれば、燃調の改定で総額がどう動くかと、
 * その中で差がどれだけあるかが同時に見える。
 */
function MonthlyBars({
  months,
  currentName,
  candidateName
}: {
  months: AnnualView['months']
  currentName: string
  candidateName: string
}) {
  const max = Math.max(...months.flatMap(m => [m.currentYen, m.candidateYen]), 1)
  return (
    <>
      <div className="bars" role="img" aria-label={`月ごとの${currentName}と${candidateName}の料金`}>
        {months.map(m => (
          <div
            className="bar-col"
            key={`${m.year}-${m.month}`}
            title={`${m.year}年${m.month}月${
              m.usageKwh === null ? '' : ` ${m.usageKwh.toLocaleString()}kWh`
            } ${currentName} ${formatCurrency(m.currentYen)} / ${candidateName} ${formatCurrency(
              m.candidateYen
            )}`}
          >
            <div className="bar-slot">
              <span
                className="bar"
                style={{ height: `${(m.currentYen / max) * 100}%`, background: 'var(--leaf)', opacity: 0.8 }}
              />
              <span
                className="bar"
                style={{ height: `${(m.candidateYen / max) * 100}%`, background: 'var(--green-bright)' }}
              />
            </div>
            <span className="bar-label">{m.month}</span>
          </div>
        ))}
      </div>
      <div className="bar-legend">
        <span>
          <span className="bar-swatch" style={{ background: 'var(--leaf)', opacity: 0.8 }} />
          {currentName}（現在）
        </span>
        <span>
          <span className="bar-swatch" style={{ background: 'var(--green-bright)' }} />
          {candidateName}
        </span>
      </div>
    </>
  )
}

/**
 * 1年ぶんの見積もり方を選ぶ。
 *
 * 検針票は1か月ぶんしかないので、残りの11か月は必ず「みなし」になる。
 * どちらの「みなし」なのかをお客様の目の前で切り替えられるようにする。
 * 隠して片方だけ見せると、あとで実額と違ったときに説明ができない。
 */
function AnnualMethodSwitch({
  value,
  onChange
}: {
  value: AnnualMethod
  onChange: (next: AnnualMethod) => void
}) {
  const options: Array<{ id: AnnualMethod; label: string; hint: string }> = [
    {
      id: 'flat',
      label: '毎月おなじ',
      hint: '検針票と同じご使用量が1年つづくものとして計算します'
    },
    {
      id: 'seasonal',
      label: '季節で変わる',
      hint: '中国エリアのご家庭の平均に合わせ、夏と冬は多め、春と秋は少なめに見込みます'
    }
  ]
  const current = options.find(o => o.id === value)
  return (
    <div className="method-switch">
      <p className="method-switch-title">1年ぶんの見積もり方</p>
      <div className="segmented" role="group" aria-label="1年ぶんの見積もり方">
        {options.map(o => (
          <button
            key={o.id}
            type="button"
            className={`segmented-btn${o.id === value ? ' is-on' : ''}`}
            aria-pressed={o.id === value}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="note method-switch-hint">{current?.hint}</p>
    </div>
  )
}

export default function ComparisonResult({
  scenarioId,
  usage,
  period,
  estimate,
  onEstimateSummary,
  onReturnToCoach,
  onBack
}: ComparisonResultProps) {
  const [gasSet, setGasSet] = useState(false)
  // 既定は「毎月おなじだけ使う」。検針票に書いてある数字だけで説明が済み、
  // 統計をあいだに挟まないぶん、お客様に確かめてもらいやすい
  const [annualMethod, setAnnualMethod] = useState<AnnualMethod>('flat')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const handlePrint = usePrint(setDetailsOpen)
  const outcome = useMemo(
    () => calculateComparison(scenarioId, usage, { period, gasSetDiscount: gasSet }),
    [scenarioId, usage, period, gasSet]
  )
  const annual = useMemo(
    () =>
      outcome.status === 'ok'
        ? calculateAnnual(scenarioId, usage, outcome.view.recommended.planId, {
            period,
            gasSetDiscount: gasSet,
            method: annualMethod
          })
        : null,
    [scenarioId, usage, period, gasSet, annualMethod, outcome]
  )

  if (outcome.status === 'unsupported') {
    return (
      <main className="wrap">
        <h1 className="page-title">料金比較結果</h1>
        <div className="card" style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-bg)' }}>
          <p className="card-title" style={{ color: 'var(--warn-ink)' }}>
            自動計算に対応していません
          </p>
          <p className="card-sub" style={{ color: 'var(--warn-ink)' }}>{outcome.reason}</p>
          <ul className="note" style={{ color: 'var(--warn-ink)', paddingLeft: '18px', marginTop: '10px' }}>
            {outcome.nextSteps.map(step => <li key={step}>{step}</li>)}
          </ul>
        </div>
        <div className="btn-row section-gap">
          <button className="btn btn-primary" onClick={onBack}>
            入力し直す
          </button>
          {onReturnToCoach && (
            <button className="btn btn-ghost" onClick={onReturnToCoach}>
              商談ナビにもどる
            </button>
          )}
        </div>
      </main>
    )
  }

  const v = outcome.view
  const savings = v.recommended.monthlySavingsYen
  const isSaving = savings > 0
  // 同額を「現在の方が安い」に入れると、下の比較表が「同額」と出しているのに
  // 見出しだけ「切り替えても安くなりません」になる
  const isSame = savings === 0
  // 年額はガスセット割を含むため、月額と符号が食い違うことがある
  // （月 -50円 でもセット割 +110円/月 で年間は +720円）。年額の符号は年額で判断する
  const annualYen = annual ? annual.savingsYen : v.annualSavingsYen

  const firstYearYen = annual ? annual.firstYearSavingsYen : v.firstYearSavingsYen
  const annualTone = toneOf(annualYen)
  const monthTone = toneOf(savings)
  const rollup = annual?.basis === 'rollup'

  /*
   * 商談ナビへ知らせる。描画中に親を更新しないよう、描画後に渡す。
   *
   * 台本で読み上げる数字は、ここで計算し直さず**画面に出ている値をそのまま**渡す。
   * ナビ側で年額を12で割ったりすると、画面と台本で1円ずれる（ルール2）。
   */
  const summary: EstimateSummary = useMemo(
    () => ({
      scenarioId,
      totalKwh: v.totalKwh,
      annualSavingsYen: annualYen,
      monthlySavingsYen: savings,
      currentPlanName: v.current.planName,
      recommendedPlanName: v.recommended.planName,
      annualCurrentYen: annual ? annual.currentYen : null,
      annualRecommendedYen: annual ? annual.candidateYen - annual.gasSetDiscountYen : null,
      highlights: v.explanation?.comparable ? v.explanation.highlights : [],
      annualMethod: annual && rollup ? annual.method : null,
      period
    }),
    [scenarioId, v, annualYen, savings, annual, rollup, period]
  )
  useEffect(() => {
    onEstimateSummary?.(summary)
  }, [summary, onEstimateSummary])
  // 「いちばん差が大きい月」は、差がほぼ一定のプランでは意味を持たない
  // （同じ燃調を使う相手なら差額は単価の差だけで動かない）。
  // 幅として示すほうが、月ごとにどれだけ振れるかが伝わる
  /** 見込んだご使用量の幅。毎月おなじなら出さない（「300kWh 〜 300kWh」は情報ではない） */
  const usageSpread = useMemo(() => {
    const rows = (annual?.months ?? []).filter(
      (m): m is typeof m & { usageKwh: number } => m.usageKwh !== null
    )
    if (rows.length === 0) return null
    const min = rows.reduce((a, b) => (b.usageKwh < a.usageKwh ? b : a))
    const max = rows.reduce((a, b) => (b.usageKwh > a.usageKwh ? b : a))
    if (min.usageKwh === max.usageKwh) return null
    return {
      min: { month: min.month, kwh: min.usageKwh },
      max: { month: max.month, kwh: max.usageKwh },
      total: rows.reduce((a, m) => a + m.usageKwh, 0)
    }
  }, [annual])

  const spread =
    annual && annual.months.length > 0
      ? {
          min: Math.min(...annual.months.map(m => m.savingsYen)),
          max: Math.max(...annual.months.map(m => m.savingsYen))
        }
      : null

  return (
    <main className="wrap">
      <h1 className="page-title">料金比較結果</h1>
      <p className="page-lead">
        {v.current.planName} ／ 検針月 {v.ratePeriodLabel} ／ ご使用量{' '}
        <span className="num">{v.totalKwh.toLocaleString()}</span> kWh
        {estimate && '（電気料金からの概算）'}
      </p>

      {/* どこから来た使用量なのかを、画面にも紙にも必ず残す */}
      {estimate && (
        <div className="note-warn" style={{ marginBottom: '14px', display: 'flex', gap: '10px' }}>
          <Icon name="calculator" size={19} style={{ marginTop: '3px', flex: 'none' }} />
          <span>
          <strong>かんたん試算の結果です</strong>
          <br />
          1か月の電気料金 {formatCurrency(estimate.billYen)} から、ご使用量を
          およそ <strong className="num">{estimate.kwh.toLocaleString()} kWh</strong> と
          見て計算しています
          {!estimate.exact &&
            `（このご使用量での請求額は ${formatCurrency(estimate.estimatedBillYen)}）`}
          。実際のご使用量がわかる場合は、検針票から試算し直すと正確になります。
          </span>
        </div>
      )}

      <section className="card hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="coins" size={18} />
              {isSame ? '年間の料金は同額です' : `年間の想定${annualTone.word}額`}
            </p>
            <p className={`hero-figure ${annualTone.className}`}>
              <BigMoney yen={annualYen} />
              {!isSame && <span className="figure-word">{annualTone.word}</span>}
            </p>
            <p className="note">
              <strong>{v.recommended.planName}</strong>
              {isSame ? 'は現在のご契約と同額です' : 'に切り替えた場合'}
              {annual && rollup
                ? ` ／ ${annual.rangeLabel}の燃料費調整額・再エネ賦課金で、${
                    annual.method === 'seasonal'
                      ? '季節によるご使用量の増え減りを見込んで'
                      : '毎月おなじご使用量として'
                  }1年ぶんを積み上げた金額です`
                : annual
                  ? ` ／ ${annual.fallbackReason}`
                  : ''}
            </p>

            {annual && rollup && (
              <AnnualMethodSwitch value={annualMethod} onChange={setAnnualMethod} />
            )}
          </div>

          <div>
            <p className="eyebrow">年間の料金</p>
            {annual && (
              <CompareBars
                currentName={v.current.planName}
                currentYen={annual.currentYen}
                candidateName={annual.planName}
                candidateYen={annual.candidateYen - annual.gasSetDiscountYen}
              />
            )}
            <dl className="hero-figures">
              <div>
                <dt className="note">月あたり</dt>
                <dd className={`num ${monthTone.className}`}>
                  {isSame ? (
                    '同額'
                  ) : (
                    <>
                      {formatCurrency(Math.abs(savings))}
                      <span className="figure-word">{monthTone.word}</span>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="note">
                  初年度
                  <span style={{ display: 'block' }}>
                    新規契約割引 {formatCurrency(v.firstYearSpecialDiscountYen)} 込み
                  </span>
                </dt>
                <dd className={`num ${toneOf(firstYearYen).className}`}>
                  {formatCurrency(Math.abs(firstYearYen))}
                  <span className="figure-word">{toneOf(firstYearYen).word}</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {annual && rollup && (
        <section className="card">
          <p className="card-title">月ごとの料金</p>
          <p className="card-sub">
            {annual.method === 'seasonal' ? (
              <>
                {period.month}月の {v.totalKwh.toLocaleString()} kWh
                を出発点に、季節ごとの使われ方に合わせて増やしたり減らしたりした場合。燃料費調整額も毎月改定されるため、請求額は月ごとに動きます。
              </>
            ) : (
              <>
                ご使用量が毎月 {v.totalKwh.toLocaleString()} kWh
                だとした場合。燃料費調整額が毎月改定されるため、同じ使用量でも請求額は月ごとに動きます。
              </>
            )}
          </p>
          <MonthlyBars
            months={annual.months}
            currentName={v.current.planName}
            candidateName={annual.planName}
          />
          {usageSpread && (
            <p className="note" style={{ marginTop: '10px' }}>
              見込んだご使用量は{' '}
              <strong className="num">{usageSpread.min.month}月 {usageSpread.min.kwh.toLocaleString()} kWh</strong>
              {' 〜 '}
              <strong className="num">{usageSpread.max.month}月 {usageSpread.max.kwh.toLocaleString()} kWh</strong>
              、1年で <strong className="num">{usageSpread.total.toLocaleString()} kWh</strong> です。
            </p>
          )}
          {spread && (
            <p className="note" style={{ marginTop: '10px' }}>
              {spread.min === spread.max ? (
                <>
                  月ごとの差額はどの月も{' '}
                  <strong className="num">{formatCurrency(Math.abs(spread.min))}</strong>
                  {toneOf(spread.min).word}です。
                </>
              ) : (
                <>
                  月ごとの差額は{' '}
                  <strong className="num">{formatCurrency(Math.abs(spread.min))}</strong>
                  {toneOf(spread.min).word} 〜{' '}
                  <strong className="num">{formatCurrency(Math.abs(spread.max))}</strong>
                  {toneOf(spread.max).word} の幅で動きます。
                </>
              )}
            </p>
          )}
        </section>
      )}

      {/* なぜ差が出るのか。生成AIは使わず、計算の内訳の引き算から作っている。
          同じ入力には必ず同じ説明が出る */}
      {v.explanation && (v.explanation.highlights.length > 0 || !v.explanation.comparable) && (
        <section className="card">
          <div className="card-head" style={{ marginBottom: '6px' }}>
            <span className="badge-icon badge-teal"><Icon name="check" size={20} /></span>
            <p className="card-title">差が出ている理由</p>
          </div>

          {v.explanation.comparable ? (
            <>
              <ul style={{ listStyle: 'none', padding: 0, marginTop: '12px', display: 'grid', gap: '8px' }}>
                {v.explanation.highlights.map(h => (
                  <li key={h} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        flex: 'none',
                        width: '7px',
                        height: '7px',
                        borderRadius: '999px',
                        background: 'var(--gold-500)',
                        marginTop: '9px'
                      }}
                    />
                    <span style={{ fontSize: '14.5px' }}>{h}</span>
                  </li>
                ))}
              </ul>

              <div className="table-scroll" style={{ marginTop: '16px' }}>
                <table className="rate-table diff-table" aria-label="差額の内訳">
                  <thead>
                    <tr>
                      <th>内訳</th>
                      <th>{v.current.planName}</th>
                      <th>{v.explanation.planName}</th>
                      <th>差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.explanation.parts.map(part => (
                      <tr key={part.label}>
                        <td className="plan-name">{part.label}</td>
                        <td>{part.currentYen === null ? '—' : formatCurrency(part.currentYen)}</td>
                        <td>{part.candidateYen === null ? '—' : formatCurrency(part.candidateYen)}</td>
                        <td
                          style={{
                            color: `var(--${
                              part.differenceYen > 0 ? 'gain' : part.differenceYen < 0 ? 'loss' : 'ink-3'
                            })`
                          }}
                        >
                          {part.differenceYen > 0 ? '−' : '+'}
                          {formatCurrency(Math.abs(part.differenceYen))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="note" style={{ marginTop: '12px' }}>
                この表の差を足すと、月額の差{' '}
                <strong className="num">
                  {formatCurrency(Math.abs(v.explanation.totalDifferenceYen))}
                </strong>{' '}
                になります。
              </p>
            </>
          ) : (
            <p className="note" style={{ marginTop: '10px' }}>{v.explanation.reason}</p>
          )}
        </section>
      )}

      <div className="result-grid">
        <div className="stack">
          <section className="card">
            <div className="card-head" style={{ marginBottom: '6px' }}>
              <span className="badge-icon badge-green"><Icon name="table" size={20} /></span>
              <p className="card-title">料金比較表（月額）</p>
            </div>
            <p className="card-sub">
              単価 {v.unitPriceEffectiveLabel} ／ 燃料費調整額・再エネ賦課金 {v.ratePeriodLabel}
            </p>
            <div className="table-scroll">
              <table className="rate-table" aria-label="料金比較表">
                <thead>
                  <tr>
                    <th>プラン</th>
                    <th>月額</th>
                    <th>差額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="is-current">
                    <td className="plan-name">{v.current.planName}（現在）</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(v.current.monthlyChargeYen)}</td>
                    <td>—</td>
                  </tr>
                  {v.candidates.map(c => {
                    // 削減にならないプランを「推奨」と表示しない。候補が1件しかない
                    // シナリオ（ナイトホリデー→夜トクなど）では、最安＝唯一の候補が
                    // 現行より高いことがある。
                    const rec = c.planId === v.recommended.planId && isSaving
                    return (
                      <tr key={c.planId}>
                        <td className="plan-name">
                          <span style={{ fontWeight: rec ? 700 : 400 }}>{c.planName}</span>
                          {rec && <span className="tag">おすすめ</span>}
                        </td>
                        <td style={{ fontWeight: 700 }}>{formatCurrency(c.monthlyChargeYen)}</td>
                        <td style={{ color: `var(--${c.monthlySavingsYen > 0 ? 'gain' : c.monthlySavingsYen < 0 ? 'loss' : 'ink-3'})` }}>
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
            </div>
            <p className="note" style={{ marginTop: '14px' }}>
              {isSaving ? (
                <>
                  このご使用量では <strong>{v.recommended.planName}</strong> がいちばん安く、
                  削減率は {formatPercentage(v.savingsPercent)} です。
                </>
              ) : isSame ? (
                <>
                  このご使用量では <strong>{v.recommended.planName}</strong> と現在のご契約が
                  同額です。ご使用量が変わると差が出ます。
                </>
              ) : (
                <>
                  このご使用量では <strong>{v.recommended.planName}</strong> に切り替えても
                  安くなりません。現在のご契約のご継続をおすすめします。
                </>
              )}
            </p>
          </section>

          <details
            className="card"
            open={detailsOpen}
            onToggle={e => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>
              {/* 紙では「表示」が操作の指示に読めてしまうので見出しに変える */}
              <Icon name="calculator" size={19} style={{ color: 'var(--teal-deep)' }} />
              <span className="print-hide">計算の内訳を表示</span>
              <span className="print-only">計算の内訳</span>
            </summary>
            <div style={{ marginTop: '16px' }}>
              {[v.current, ...v.candidates].map(p => (
                <div key={p.planId} style={{ marginTop: '14px' }}>
                  <p style={{ fontWeight: 700, fontSize: '14px' }}>{p.planName}</p>
                  <p className="formula">{p.formula}</p>
                  {p.notes.map(n => (
                    <p key={n} className="note" style={{ color: 'var(--warn-ink)' }}>※ {n}</p>
                  ))}
                </div>
              ))}
              <p style={{ fontWeight: 700, fontSize: '14px', marginTop: '20px' }}>単価の出典</p>
              <ul className="note" style={{ paddingLeft: '18px' }}>
                {v.sources.map(s => <li key={s}>{s}</li>)}
              </ul>
              {annual?.method === 'seasonal' && (
                <>
                  <p style={{ fontWeight: 700, fontSize: '14px', marginTop: '20px' }}>
                    季節ごとの使われ方の出典
                  </p>
                  <ul className="note" style={{ paddingLeft: '18px' }}>
                    <li>
                      {DEMAND_PROFILE.source.document}／{DEMAND_PROFILE.source.locator}
                    </li>
                    {annual.profileNote && <li>{annual.profileNote}</li>}
                  </ul>
                </>
              )}
            </div>
          </details>
        </div>

        <div className="stack">
          {/* チェックボックスだと「入れ忘れ」と「なしと判断した」が画面上で同じに見える。
              あり／なしを明示的に選ばせる。既定は「なし」——既定を「あり」にすると、
              セット割に入っていないお客様に割引後の額を見せてしまう */}
          <section className="card print-hide gasset-card">
            <div className="card-head" style={{ marginBottom: '6px' }}>
              <span className="badge-icon badge-leaf"><Icon name="tag" size={20} /></span>
              <p className="card-title">ガスとでんきのセット割</p>
            </div>
            <p className="card-sub">
              JAのガスとあわせてご契約の場合、電気料金が月{GAS_SET_DISCOUNT_YEN}円割引になります。
            </p>
            <div className="choice-row" role="radiogroup" aria-label="ガスとでんきのセット割">
              {GAS_SET_OPTIONS.map(o => (
                <label className="choice" key={o.label}>
                  <input
                    type="radio"
                    name="gas-set-discount"
                    checked={gasSet === o.value}
                    onChange={() => setGasSet(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 年額・初年度額はこの選択を含んでいる。紙にも選んだ側を必ず残す */}
          <p className="print-only note">
            ガスとでんきのセット割: {gasSet ? gasSetOnLabel : 'なし'}
          </p>


          {/* 紙で受け取った人が「いつ時点の試算か」を判断できるようにする。
              日付は個人情報ではなく、印刷物の有効期限の目安として必要 */}
          <p className="print-only note">
            試算日: {new Date().toLocaleDateString('ja-JP')} ／ 検針月: {v.ratePeriodLabel} ／ 単価:{' '}
            {v.unitPriceEffectiveLabel}
          </p>

          <div className="note-warn" style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
            <Icon name="alert" size={19} style={{ marginTop: '3px' }} />
            <span>
            <strong>ご確認ください</strong>
            <br />
            {v.unitPriceEffectiveLabel}の単価に、{v.ratePeriodLabel}の燃料費調整額・再エネ賦課金を
            当てた試算です。燃料費調整額・再エネ賦課金は毎月改定されます。
            {v.periodPrecedesUnitPrices &&
              `なお ${v.ratePeriodLabel} は単価の適用開始より前のため、実際の請求額とは異なります。`}
            {annual?.method === 'seasonal'
              ? '年額は、中国エリアのご家庭の平均的な使われ方に合わせて季節ごとに増減させた目安です。実際の使い方によって変わります。'
              : '年額は、ご使用量が毎月同じだとした場合の目安です。'}
            検針票発行手数料（1契約55円）やポイント還元は含んでいません。
            正確な金額は営業担当までお問い合わせください。
            </span>
          </div>

          <div className="btn-row section-gap print-hide">
            <button className="btn btn-ghost" onClick={handlePrint}>PDFで保存・印刷</button>
            <button className={`btn ${onReturnToCoach ? 'btn-ghost' : 'btn-primary'}`} onClick={onBack}>
              条件を変えて試算する
            </button>
            {/* 商談の途中なら、次の一手は台本に戻ること。いちばん強いボタンにする */}
            {onReturnToCoach && (
              <button className="btn btn-primary" onClick={onReturnToCoach}>
                商談ナビにもどる
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
