import { useMemo, useState } from 'react'
import { UsageInput } from '@ja-denki-simulator/calc-core'
import {
  AnnualView,
  GAS_SET_DISCOUNT_YEN,
  calculateAnnual,
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
  const rows = [
    { name: currentName, suffix: '（現在）', yen: currentYen, color: 'var(--line-strong)' },
    { name: candidateName, suffix: '', yen: candidateYen, color: 'var(--green)' }
  ]
  return (
    <div className="compare-bars">
      {rows.map(r => (
        <div className="compare-row" key={r.name}>
          <span className="compare-name">
            <span>{r.name}</span>
            {r.suffix}
          </span>
          <span className="compare-amount num">{formatCurrency(r.yen)}</span>
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
            title={`${m.year}年${m.month}月 ${currentName} ${formatCurrency(
              m.currentYen
            )} / ${candidateName} ${formatCurrency(m.candidateYen)}`}
          >
            <div className="bar-slot">
              <span
                className="bar"
                style={{ height: `${(m.currentYen / max) * 100}%`, background: 'var(--line-strong)' }}
              />
              <span
                className="bar"
                style={{ height: `${(m.candidateYen / max) * 100}%`, background: 'var(--green)' }}
              />
            </div>
            <span className="bar-label">{m.month}</span>
          </div>
        ))}
      </div>
      <div className="bar-legend">
        <span>
          <span className="bar-swatch" style={{ background: 'var(--line-strong)' }} />
          {currentName}（現在）
        </span>
        <span>
          <span className="bar-swatch" style={{ background: 'var(--green)' }} />
          {candidateName}
        </span>
      </div>
    </>
  )
}

export default function ComparisonResult({ scenarioId, usage, period, onBack }: ComparisonResultProps) {
  const [gasSet, setGasSet] = useState(false)
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
            gasSetDiscount: gasSet
          })
        : null,
    [scenarioId, usage, period, gasSet, outcome]
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
        <button className="btn btn-primary btn-full section-gap" onClick={onBack}>
          入力し直す
        </button>
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
  // 「いちばん差が大きい月」は、差がほぼ一定のプランでは意味を持たない
  // （同じ燃調を使う相手なら差額は単価の差だけで動かない）。
  // 幅として示すほうが、月ごとにどれだけ振れるかが伝わる
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
      </p>

      <section className="card hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">
              {isSame ? '年間の料金は同額です' : `年間の想定${annualTone.word}額`}
            </p>
            <p className={`hero-figure ${annualTone.className}`}>
              {formatCurrency(Math.abs(annualYen))}
            </p>
            <p className="note">
              <strong>{v.recommended.planName}</strong>
              {isSame ? 'は現在のご契約と同額です' : 'に切り替えた場合'}
              {annual && rollup
                ? ` ／ ${annual.rangeLabel}の燃料費調整額・再エネ賦課金で、毎月同じご使用量として積み上げた金額です`
                : annual
                  ? ` ／ ${annual.fallbackReason}`
                  : ''}
            </p>

            <dl className="hero-figures">
              <div>
                <dt className="note">月あたり</dt>
                <dd className={`num ${monthTone.className}`}>
                  {isSame ? '同額' : `${formatCurrency(Math.abs(savings))}${monthTone.word}`}
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
                  {toneOf(firstYearYen).word}
                </dd>
              </div>
            </dl>
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
          </div>
        </div>
      </section>

      <div className="result-grid">
        <div className="stack">
          {annual && rollup && (
            <section className="card">
              <p className="card-title">月ごとの料金</p>
              <p className="card-sub">
                ご使用量が毎月 {v.totalKwh.toLocaleString()} kWh だとした場合。
                燃料費調整額が毎月改定されるため、同じ使用量でも請求額は月ごとに動きます。
              </p>
              <MonthlyBars
                months={annual.months}
                currentName={v.current.planName}
                candidateName={annual.planName}
              />
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
        </div>

        <div className="stack">
          <section className="card">
            <p className="card-title">料金比較表（月額）</p>
            <p className="card-sub">
              単価 {v.unitPriceEffectiveLabel} ／ 燃料費調整額・再エネ賦課金 {v.ratePeriodLabel}
            </p>
            <table className="rate-table">
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

          {/* チェックボックスだと「入れ忘れ」と「なしと判断した」が画面上で同じに見える。
              あり／なしを明示的に選ばせる。既定は「なし」——既定を「あり」にすると、
              セット割に入っていないお客様に割引後の額を見せてしまう */}
          <section className="card print-hide">
            <p className="card-title">ガスとでんきのセット割</p>
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

          <details
            className="card"
            open={detailsOpen}
            onToggle={e => setDetailsOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary>
              {/* 紙では「表示」が操作の指示に読めてしまうので見出しに変える */}
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
            </div>
          </details>

          {/* 紙で受け取った人が「いつ時点の試算か」を判断できるようにする。
              日付は個人情報ではなく、印刷物の有効期限の目安として必要 */}
          <p className="print-only note">
            試算日: {new Date().toLocaleDateString('ja-JP')} ／ 検針月: {v.ratePeriodLabel} ／ 単価:{' '}
            {v.unitPriceEffectiveLabel}
          </p>

          <div className="note-warn" style={{ marginTop: '14px' }}>
            <strong>ご確認ください</strong>
            <br />
            {v.unitPriceEffectiveLabel}の単価に、{v.ratePeriodLabel}の燃料費調整額・再エネ賦課金を
            当てた試算です。燃料費調整額・再エネ賦課金は毎月改定されます。
            {v.periodPrecedesUnitPrices &&
              `なお ${v.ratePeriodLabel} は単価の適用開始より前のため、実際の請求額とは異なります。`}
            年額はご使用量が毎月同じだとした場合の目安です。
            検針票発行手数料（1契約55円）やポイント還元は含んでいません。
            正確な金額は営業担当までお問い合わせください。
          </div>

          <div className="btn-row section-gap print-hide">
            <button className="btn btn-ghost" onClick={handlePrint}>PDFで保存・印刷</button>
            <button className="btn btn-primary" onClick={onBack}>条件を変えて試算する</button>
          </div>
        </div>
      </div>
    </main>
  )
}
