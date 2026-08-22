import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { parseTsv, summarize, Tally, MIN_SAMPLE, headerRow } from '../services/visitLog'

interface SalesInsightsProps {
  onBack: () => void
}

/**
 * 支店で集めた商談の記録を貼ると、何が効いているかを出す。
 *
 * この画面も**貼られた表をその場で数えるだけ**で、どこにも送らないし保存しない。
 * 集計表そのものはJAが既に持っている仕組み（Excel・グループウェア）に置く。
 * ここを保管場所にすると、無認証の画面に組織の営業データが溜まることになる。
 */
function TallyTable({ title, rows, note }: { title: string; rows: Tally[]; note?: string }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map(r => r.count), 1)
  return (
    <div className="card">
      <p className="card-title">{title}</p>
      {note && <p className="note">{note}</p>}
      <div className="tally">
        {rows.map(r => (
          <div className="tally-row" key={r.label}>
            <span className="tally-label">{r.label}</span>
            <span className="tally-bar">
              <span className="tally-fill" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="tally-count num">{r.count}件</span>
            <span className="tally-rate num">
              {r.appliedRate === null ? '—' : `${r.appliedRate}%`}
            </span>
          </div>
        ))}
      </div>
      <p className="note" style={{ marginTop: '10px' }}>
        右は、その区分でお申し込みに至った割合です。{MIN_SAMPLE}件に満たない区分は
        「—」にしています（1件2件の割合は判断を誤らせるため）。
      </p>
    </div>
  )
}

export default function SalesInsights({ onBack }: SalesInsightsProps) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() === '' ? null : parseTsv(text)), [text])
  const summary = useMemo(
    () => (parsed && !parsed.error ? summarize(parsed.rows) : null),
    [parsed]
  )

  return (
    <main className="wrap">
      <div className="card-head" style={{ marginBottom: '12px' }}>
        <span className="badge-icon badge-teal">
          <Icon name="chart" size={20} />
        </span>
        <div>
          <h1 className="page-title">営業の集計</h1>
          <p className="page-lead">
            支店で集めた商談の記録を貼ると、何が効いているかが出ます。
          </p>
        </div>
      </div>

      <div className="card">
        <p className="card-title">集計表を貼る</p>
        <p className="note">
          1行目に見出し（{headerRow().slice(0, 4).join('・')}…）が入った表を、
          Excel からそのままコピーして貼ってください。
          <strong>支店・担当などの列が増えていても読めます。</strong>
        </p>
        <textarea
          className="input paste-area"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`${headerRow().join('\t')}\n2026-08-22\tclosing\t...`}
          aria-label="集計表を貼る"
          rows={6}
        />
        {parsed?.error && (
          <p className="note" style={{ color: 'var(--warn-ink)', marginTop: '10px' }}>
            {parsed.error}
          </p>
        )}
        {parsed && !parsed.error && parsed.missing.length > 0 && (
          <p className="note" style={{ marginTop: '10px' }}>
            見つからなかった列: {parsed.missing.join('・')}。その分の集計は出ません。
          </p>
        )}
        <p className="note" style={{ marginTop: '10px' }}>
          貼った内容はこの画面の中だけで数えます。どこにも送信・保存しません。
        </p>
      </div>

      {summary && (
        <>
          <section className="card hero">
            <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="coins" size={18} />
              商談 {summary.total} 件
            </p>
            <p className="hero-figure figure-gain">
              {summary.appliedRate === null ? '—' : summary.appliedRate}
              <span className="figure-word">％がお申し込み</span>
            </p>
            <p className="note">
              {summary.applied} 件のお申し込み
              {summary.appliedRate === null &&
                `（${MIN_SAMPLE}件に満たないため割合は出していません）`}
            </p>
          </section>

          <TallyTable
            title="いくら安くなると決まるのか"
            rows={summary.bySavingsBand}
            note="ここがいちばん効きます。差額がいくらから決まりやすいかで、訪問先の選び方が変わります。"
          />
          <TallyTable
            title="どこで止まったか"
            rows={summary.byReached}
            note="到達段階の分布。特定の段階に固まっていれば、そこに台本の弱いところがあります。"
          />
          <TallyTable
            title="出た反論"
            rows={summary.byObjection}
            note="多い反論から、台本を厚くします。"
          />
          <TallyTable title="お客様の気がかり" rows={summary.byConcern} />
          <TallyTable title="現在のご契約" rows={summary.byScenario} />
          <TallyTable title="結果の内訳" rows={summary.byOutcome} />
        </>
      )}

      <div className="btn-row" style={{ marginTop: '18px' }}>
        <button className="btn btn-ghost" onClick={onBack}>
          ホームへ
        </button>
      </div>
    </main>
  )
}
