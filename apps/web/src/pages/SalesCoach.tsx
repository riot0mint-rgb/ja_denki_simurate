import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import {
  HearingAnswers,
  EMPTY_ANSWERS,
  HEARING,
  PREPARE,
  BEFORE_ESTIMATE,
  CLOSING,
  BEFORE_SIGNING,
  REVIEW,
  NEVER_SAY,
  Script
} from '../data/playbook'
import {
  VisitLog,
  OUTCOMES,
  Outcome,
  usageBand,
  savingsBand,
  toTsv,
  headerRow
} from '../services/visitLog'
import {
  Stage,
  STAGES,
  stageIndex,
  nextStage,
  previousStage,
  answeredCount,
  hearingDone,
  openingFor,
  explainFor,
  estimateHint,
  orderedObjections,
  preemptiveObjectionIds,
  situationSummary,
  shouldStandDown
} from '../services/coachService'

interface SalesCoachProps {
  /** 試算画面をひらく。検針票があるかで分ける */
  onOpenEstimate: (kind: 'detailed' | 'simple') => void
  onBack: () => void
  /** 直近の試算の要点。まだ試算していなければ null */
  lastEstimate: {
    scenarioId: string
    totalKwh: number
    annualSavingsYen: number | null
  } | null
  /** 今日の日付。テストから固定できるようにしておく */
  today?: string
}

/** 読み上げる言葉。営業がそのまま声に出せる形で大きく出す */
function SayBlock({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="say">
      <p className="say-label">
        <Icon name="chat" size={16} />
        このまま読めます
      </p>
      {lines.map(line => (
        <p key={line} className="say-line">
          {line}
        </p>
      ))}
    </div>
  )
}

/** なぜそう言うのか。台本だけ渡すと棒読みになるので必ず添える */
function WhyBlock({ text }: { text: string }) {
  return (
    <p className="why">
      <strong>なぜ：</strong>
      {text}
    </p>
  )
}

function AvoidBlock({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="avoid">
      <p className="avoid-label">
        <Icon name="alert" size={16} />
        ここで言わないこと
      </p>
      <ul>
        {items.map(i => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

function ScriptCard({ script, title }: { script: Script; title?: string }) {
  return (
    <div className="card">
      {title && <p className="card-title">{title}</p>}
      <SayBlock lines={script.say} />
      <WhyBlock text={script.why} />
      <AvoidBlock items={script.avoid} />
    </div>
  )
}

export default function SalesCoach({
  onOpenEstimate,
  onBack,
  lastEstimate,
  today
}: SalesCoachProps) {
  const [stage, setStage] = useState<Stage>('prepare')
  const [answers, setAnswers] = useState<HearingAnswers>(EMPTY_ANSWERS)
  const [openObjection, setOpenObjection] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  /** 実際に出た反論。開いたものを記録する */
  const [usedObjections, setUsedObjections] = useState<string[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [copied, setCopied] = useState(false)

  const hint = useMemo(() => estimateHint(answers), [answers])
  const objections = useMemo(() => orderedObjections(answers), [answers])
  const preemptive = useMemo(() => preemptiveObjectionIds(answers), [answers])
  const standDown = shouldStandDown(lastEstimate?.annualSavingsYen ?? null)

  const log: VisitLog = useMemo(
    () => ({
      date: today ?? new Date().toISOString().slice(0, 10),
      reached: stage,
      interest: answers.interest,
      household: answers.household,
      daytime: answers.daytime,
      allElectric: answers.allElectric,
      concern: answers.concern,
      scenarioId: lastEstimate?.scenarioId ?? null,
      usageBand: usageBand(lastEstimate?.totalKwh ?? null),
      savingsBand: savingsBand(lastEstimate?.annualSavingsYen ?? null),
      objections: usedObjections,
      outcome
    }),
    [today, stage, answers, lastEstimate, usedObjections, outcome]
  )

  const go = (next: Stage | null) => {
    if (!next) return
    setStage(next)
    window.scrollTo({ top: 0 })
  }

  const answer = (id: keyof HearingAnswers, value: string) =>
    setAnswers(prev => ({ ...prev, [id]: value }))

  return (
    <main className="wrap">
      <div className="card-head" style={{ marginBottom: '12px' }}>
        <span className="badge-icon badge-green">
          <Icon name="chat" size={20} />
        </span>
        <div>
          <h1 className="page-title">商談ナビ</h1>
          <p className="page-lead">おうかがいから、お手続きのご案内までをご一緒します。</p>
        </div>
      </div>

      {/* 現在地。営業が自分の位置を見失わないようにする */}
      <nav className="stage-rail" aria-label="商談の進み方">
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`stage-chip${s.id === stage ? ' is-on' : ''}${i < stageIndex(stage) ? ' is-done' : ''}`}
            aria-current={s.id === stage ? 'step' : undefined}
            onClick={() => go(s.id)}
          >
            {s.short}
          </button>
        ))}
      </nav>

      {answeredCount(answers) > 0 && (
        <p className="situation">
          <Icon name="check" size={14} />
          {situationSummary(answers)}
        </p>
      )}

      {/* ───────────── 準備 ───────────── */}
      {stage === 'prepare' && (
        <>
          <div className="card">
            <p className="card-title">持っていくもの</p>
            <ul className="checklist">
              {PREPARE.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <p className="card-title">今日の目的</p>
            <p className="say-line" style={{ fontSize: '17px' }}>
              契約をいただくことではなく、お客様が判断できる材料をお渡しすること。
            </p>
            <WhyBlock text={PREPARE.mindset.why} />
          </div>
        </>
      )}

      {/* ───────────── 導入 ───────────── */}
      {stage === 'opening' && (
        <>
          {openingFor(answers).map((s, i) => (
            <ScriptCard key={i} script={s} title={i === 0 ? '最初の30秒' : 'お客様に合わせて足す一言'} />
          ))}
          {!answers.interest && (
            <div className="card">
              <p className="card-title">お客様の様子はいかがですか</p>
              <p className="note">選ぶと、足す一言が変わります。</p>
              <div className="choice-grid">
                {HEARING[0].choices.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    className="choice-btn"
                    onClick={() => answer('interest', c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────────── ヒアリング ───────────── */}
      {stage === 'hearing' && (
        <>
          <p className="note" style={{ marginBottom: '10px' }}>
            {answeredCount(answers)} / {HEARING.length} 問
          </p>
          {HEARING.map(q => {
            const current = answers[q.id]
            return (
              <div className="card" key={q.id}>
                <SayBlock lines={[q.ask]} />
                <div className="choice-grid">
                  {q.choices.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      className={`choice-btn${current === c.value ? ' is-on' : ''}`}
                      aria-pressed={current === c.value}
                      onClick={() => answer(q.id, c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {current && (
                  <p className="implication">
                    → {q.choices.find(c => c.value === current)?.implication}
                  </p>
                )}
                <WhyBlock text={q.why} />
              </div>
            )
          })}
          {hearingDone(answers) && (
            <p className="note">おうかがいは以上です。試算にすすみましょう。</p>
          )}
        </>
      )}

      {/* ───────────── 試算 ───────────── */}
      {stage === 'estimate' && (
        <>
          <ScriptCard script={BEFORE_ESTIMATE} title="検針票を見せていただく" />
          <div className="card">
            <p className="card-title">どのプランで試算するか</p>
            <p className="say-line">{hint.lookFor}</p>
            <WhyBlock text={hint.reason} />
            <div className="btn-row" style={{ marginTop: '14px' }}>
              <button className="btn btn-primary" onClick={() => onOpenEstimate('detailed')}>
                検針票から試算する
              </button>
              {hint.simpleOk && (
                <button className="btn btn-ghost" onClick={() => onOpenEstimate('simple')}>
                  検針票がない → かんたん試算
                </button>
              )}
            </div>
            {!hint.simpleOk && (
              <p className="note" style={{ marginTop: '10px' }}>
                時間帯別のプランは、昼と夜の内訳が要るため電気料金だけでは試算できません。
                検針票をご用意いただくか、後日あらためてください。
              </p>
            )}
          </div>
        </>
      )}

      {/* ───────────── 説明 ───────────── */}
      {stage === 'explain' && (
        <>
          {standDown ? (
            <div className="card card-warn">
              <p className="card-title">
                <Icon name="alert" size={18} /> 今回は、いまのご契約のほうがお安い結果です
              </p>
              <p className="note">
                お勧めしないでください。次の反論カード「（試算の結果）高くなるのですね」に、
                そのまま読める言葉があります。
              </p>
              <button className="btn btn-ghost" style={{ marginTop: '12px' }} onClick={() => go('objection')}>
                その言葉を見る
              </button>
            </div>
          ) : (
            <ScriptCard script={explainFor(answers)} title="試算結果の伝え方" />
          )}
          <div className="card">
            <p className="card-title">伝え方の型</p>
            <ul className="checklist">
              <li>数字は1つだけ。年間の差額を覚えていただく</li>
              <li>根拠を見せる。「計算の内訳」から出典までたどれます</li>
              <li>目安であることを必ず添える。燃料費調整額は毎月変わります</li>
            </ul>
          </div>
        </>
      )}

      {/* ───────────── 反論処理 ───────────── */}
      {stage === 'objection' && (
        <>
          <p className="note" style={{ marginBottom: '10px' }}>
            お客様が言われたことに近いものを開いてください。
            {preemptive.length > 0 && ' 先ほどのお答えから、上の2つを先に出しています。'}
          </p>
          {objections.map(o => (
            <details
              className={`card objection${preemptive.includes(o.id) ? ' is-likely' : ''}`}
              key={o.id}
              open={openObjection === o.id}
              onToggle={e => {
                const open = e.currentTarget.open
                setOpenObjection(open ? o.id : null)
                // 開いた＝その反論が出た、とみなす。あとで数え直さなくて済む
                if (open) setUsedObjections(prev => (prev.includes(o.id) ? prev : [...prev, o.id]))
              }}
            >
              <summary>
                <span className="objection-said">「{o.said}」</span>
                {preemptive.includes(o.id) && <span className="tag">出そう</span>}
              </summary>
              <div style={{ marginTop: '12px' }}>
                <SayBlock lines={o.script.say} />
                <WhyBlock text={o.script.why} />
                <AvoidBlock items={o.script.avoid} />
              </div>
            </details>
          ))}
        </>
      )}

      {/* ───────────── クロージング ───────────── */}
      {stage === 'closing' && (
        <>
          {standDown && (
            <div className="card card-warn">
              <p className="card-title">
                <Icon name="alert" size={18} /> 高くなる結果でした
              </p>
              <p className="note">お手続きに進まないでください。今日は資料をお渡しして引きます。</p>
            </div>
          )}
          <ScriptCard script={CLOSING} title="お手続きのご案内" />
          <div className="card">
            <p className="card-title">お手続き前の確認</p>
            <p className="note" style={{ marginBottom: '10px' }}>
              ※ 実際の説明事項と文言は<strong>JAの説明書面が正</strong>です。
              ここは読み落としを防ぐための覚書です。
            </p>
            <ul className="checklist checklist-input">
              {BEFORE_SIGNING.map(item => (
                <li key={item}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked[item] ?? false}
                      onChange={e => setChecked(prev => ({ ...prev, [item]: e.target.checked }))}
                    />
                    <span>{item}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* ───────────── ふりかえり ───────────── */}
      {stage === 'review' && (
        <>
          <div className="card">
            <p className="card-title">今日のふりかえり</p>
            <p className="note">
              その場で3つだけ。あとで思い出そうとしても出てきません。
            </p>
          </div>
          {REVIEW.map(r => (
            <div className="card" key={r.q}>
              <p className="say-line" style={{ fontSize: '16px' }}>
                {r.q}
              </p>
              <WhyBlock text={r.why} />
            </div>
          ))}

          <div className="card">
            <p className="card-title">今日の結果</p>
            <div className="choice-grid">
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`choice-btn${outcome === o.value ? ' is-on' : ''}`}
                  aria-pressed={outcome === o.value}
                  onClick={() => setOutcome(o.value)}
                >
                  {o.label}
                  {o.note && <span className="choice-note">{o.note}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="card-title">記録を書き出す</p>
            <p className="note">
              コピーして、支店の集計表に貼ってください。
              <strong>お客様が特定できる項目は入っていません。</strong>
              日付・時刻の時刻部分・正確なご使用量も入れていません。
            </p>
            <pre className="log-row" aria-label="書き出す記録">
              {toTsv([log])}
            </pre>
            <div className="btn-row" style={{ marginTop: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  // クリップボードが使えない端末でも、上に本文が出ているので手で写せる
                  await navigator.clipboard?.writeText(toTsv([log])).catch(() => {})
                  setCopied(true)
                }}
              >
                {copied ? 'コピーしました' : '1行をコピー'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await navigator.clipboard?.writeText(headerRow().join('\t')).catch(() => {})
                  setCopied(true)
                }}
              >
                見出しをコピー
              </button>
            </div>
            <p className="note" style={{ marginTop: '12px' }}>
              集めた表は「営業の集計」画面に貼ると、どの反論が多いか・いくら安くなると
              決まりやすいかが出ます。
            </p>
          </div>
        </>
      )}

      {/* いつでも見える戒め */}
      <details className="card never-say">
        <summary>
          <Icon name="alert" size={16} /> 今日ぜったいに言わないこと
        </summary>
        <ul style={{ marginTop: '10px' }}>
          {NEVER_SAY.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>

      <div className="btn-row" style={{ marginTop: '18px' }}>
        <button
          className="btn btn-ghost"
          onClick={() => (stageIndex(stage) === 0 ? onBack() : go(previousStage(stage)))}
        >
          {stageIndex(stage) === 0 ? 'ホームへ' : 'ひとつ戻る'}
        </button>
        {nextStage(stage) && (
          <button className="btn btn-primary" onClick={() => go(nextStage(stage))}>
            {STAGES[stageIndex(stage) + 1].label}へ
          </button>
        )}
      </div>
    </main>
  )
}
