import { useEffect, useMemo, useState } from 'react'
import {
  HolidayUsageRatio,
  UsageInput,
  countMeterPeriodDays,
  countMonthDays
} from '@ja-denki-simulator/calc-core'
import {
  DEFAULT_RATE_PERIOD,
  allElectricTermsOf,
  periodOptionsFor,
  SCENARIOS,
  findScenario,
  formatCurrency,
  calculateComparison,
  isSummerMonth,
  needsCalendar
} from '../services/calculateService'

interface ManualInputProps {
  onComplete: (scenarioId: string, usage: UsageInput, period: { year: number; month: number }) => void;
  onBack: () => void;
}

/** よくある契約容量。タップで選べるようにして数値入力の手間を省く。 */
const COMMON_KW = [4, 5, 6, 8, 10]
const COMMON_KVA = [6, 8, 10, 12, 15]

/** 休日電力使用割合。④入力シート C9 の 3 択。 */
const HOLIDAY_RATIOS: Array<{ value: HolidayUsageRatio; label: string; hint: string }> = [
  { value: 'same', label: '同じくらい', hint: '平日と変わらない' },
  { value: 'more', label: '多い', hint: '休日は家にいる時間が長い' },
  { value: 'much_more', label: 'とても多い', hint: '休日はほぼ在宅' }
]

/** 検針期間の既定値。対象月の前月6日〜当月5日を初期値にする。 */
function defaultMeterPeriod(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return { start: `${prevYear}-${pad(prevMonth)}-06`, end: `${year}-${pad(month)}-05` }
}

const numberFieldStyle: React.CSSProperties = {
  marginTop: '6px',
  fontSize: '18px',
  padding: '12px',
  width: '100%'
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '10px 16px',
  borderRadius: '999px',
  border: active ? '2px solid #2d9d78' : '1px solid var(--border-color)',
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

function TotalBadge({ total }: { total: number }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        background: 'rgba(45,157,120,0.10)',
        fontSize: '14px'
      }}
    >
      合計 <strong>{total.toLocaleString()}</strong> kWh
      <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>
        検針票の合計と一致するか確認してください
      </span>
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
  // 検針期間が季節をまたぐ月だけ使う「デイタイム夏季」
  const [daySummerKwh, setDaySummerKwh] = useState('')
  const [nightKwh, setNightKwh] = useState('')
  const [holidayKwh, setHolidayKwh] = useState('')
  // ファミリータイム／時間帯別電灯
  const [famDaySummer, setFamDaySummer] = useState('')
  const [famDayOther, setFamDayOther] = useState('')
  const [famFamily, setFamFamily] = useState('')
  const [famNight, setFamNight] = useState('')
  const [ecoDay, setEcoDay] = useState('')
  const [ecoNight, setEcoNight] = useState('')
  const [allElectric, setAllElectric] = useState(true)
  const [holidayRatio, setHolidayRatio] = useState<HolidayUsageRatio>('same')
  const [meterStart, setMeterStart] = useState('')
  const [meterEnd, setMeterEnd] = useState('')
  // 日付から自動算出した日数内訳。検針票と合わない場合は手で直せるようにする。
  const [dayCounts, setDayCounts] = useState<{ days: string; weekendDays: string; holidayDays: string } | null>(null)

  const scenario = findScenario(scenarioId)!
  const allElectricTerms = allElectricTermsOf(scenario)
  // 選択肢は事業者ごとに変わる（燃調の公表時期がずれるため）
  const periodOptions = periodOptionsFor(scenario)
  const summer = isSummerMonth(period.month)
  const num = (s: string) => (s.trim() === '' ? 0 : Number(s))

  // 検針期間は日付から日数・土日・祝日を自動算出する。未入力なら対象月の既定値。
  const defaults = defaultMeterPeriod(period.year, period.month)
  const startDate = meterStart || defaults.start
  const endDate = meterEnd || defaults.end
  const autoCounts = countMeterPeriodDays(startDate, endDate)

  // 検針期間を変えたら日数内訳を引き直す
  useEffect(() => {
    setDayCounts(
      autoCounts
        ? {
            days: String(autoCounts.days),
            weekendDays: String(autoCounts.weekendDays),
            holidayDays: String(autoCounts.holidayDays)
          }
        : null
    )
    // 日付が変わったときだけ引き直す。手入力を上書きしないよう counts は依存に入れない。
  }, [startDate, endDate])

  const periodDays = dayCounts
    ? {
        days: num(dayCounts.days),
        weekendDays: num(dayCounts.weekendDays),
        holidayDays: num(dayCounts.holidayDays)
      }
    : null
  // min="0" は入力を止めないので、負の日数がそのまま按分に入りうる。
  // 祝日 -20 で JAでんきの試算額が 3,000円 以上動いてしまう
  const calendarValid =
    periodDays !== null &&
    periodDays.days > 0 &&
    periodDays.weekendDays >= 0 &&
    periodDays.holidayDays >= 0 &&
    periodDays.days - periodDays.weekendDays - periodDays.holidayDays >= 0
  // 夏季／その他季の按分だけは日付から数える（月をまたぐ日数が要るため）。
  // 日数は手で直せるので、直した値と日付の期間がずれることがある。
  // どちらが正しいかは決められないので、ずれていることを利用者に見せる
  const spanDays = autoCounts?.days ?? null
  const daysEdited = periodDays !== null && spanDays !== null && periodDays.days !== spanDays
  const julyDays = countMonthDays(startDate, endDate, 7)
  const octoberDays = countMonthDays(startDate, endDate, 10)
  const calendar =
    calendarValid && julyDays !== null && octoberDays !== null
      ? { ...periodDays!, holidayUsageRatio: holidayRatio, julyDays, octoberDays }
      : undefined

  // ファミリータイムの検針票は検針期間が季節をまたぐ月だけ夏季／その他季が併記される
  const mixedSeason = period.month === 7 || period.month === 10
  const summerOnly = period.month === 8 || period.month === 9

  const usage: UsageInput = useMemo(() => {
    const base: UsageInput = {}
    if (scenario.contract === 'kw') base.contractKw = num(contract)
    if (scenario.contract === 'kva') base.contractKva = num(contract)

    if (scenario.usageForm === 'total') {
      base.totalKwh = num(totalKwh)
    } else if (scenario.usageForm === 'seasonal') {
      // 検針期間が季節をまたぐ月（7月・10月）は両方が発生する。
      // ⑤の入力シートも「その他」E16 と「夏季」E18 を別々に聞いている
      base.seasonal = mixedSeason
        ? { summerKwh: num(summerKwh), otherKwh: num(otherKwh) }
        : summer
          ? { summerKwh: num(summerKwh), otherKwh: 0 }
          : { summerKwh: 0, otherKwh: num(otherKwh) }
      base.totalKwh = base.seasonal.summerKwh + base.seasonal.otherKwh
    } else if (scenario.usageForm === 'tou') {
      // 同上。③の入力シートも「デイタイムその他」F16 と「デイタイム夏季」F18 を
      // 別々に聞いている。1欄にまとめると7月・10月の検針が丸ごと片方の単価になる
      base.tou = {
        daySummer: mixedSeason ? num(daySummerKwh) : summer ? num(dayKwh) : 0,
        dayOther: mixedSeason ? num(dayKwh) : summer ? 0 : num(dayKwh),
        night: num(nightKwh),
        holiday: num(holidayKwh)
      }
    } else if (scenario.usageForm === 'family') {
      base.familyTime = {
        daySummer: mixedSeason ? num(famDaySummer) : summerOnly ? num(famDayOther) : 0,
        dayOther: mixedSeason ? num(famDayOther) : summerOnly ? 0 : num(famDayOther),
        family: num(famFamily),
        night: num(famNight)
      }
      base.allElectricDiscount = allElectric
      base.calendar = calendar
    } else {
      base.economyNight = { dayKwh: num(ecoDay), nightKwh: num(ecoNight) }
      base.calendar = calendar
    }
    return base
  }, [
    scenario, contract, totalKwh, summerKwh, otherKwh, dayKwh, daySummerKwh, nightKwh, holidayKwh, summer,
    famDaySummer, famDayOther, famFamily, famNight, ecoDay, ecoNight, allElectric,
    calendar, mixedSeason, summerOnly
  ])

  // 入力しながら結果が見えるほうが検針票との突き合わせが速い
  const preview = useMemo(
    () => calculateComparison(scenarioId, usage, { period }),
    [scenarioId, usage, period]
  )

  const touTotal = num(dayKwh) + (mixedSeason ? num(daySummerKwh) : 0) + num(nightKwh) + num(holidayKwh)
  // 季節をまたがない月は famDaySummer を計算に渡さない。合計にだけ残ると
  // 検針票と突き合わせる利用者に、請求されない kWh を見せてしまう
  const familyTotal =
    (mixedSeason ? num(famDaySummer) : 0) + num(famDayOther) + num(famFamily) + num(famNight)
  const ecoTotal = num(ecoDay) + num(ecoNight)
  const hasInput =
    scenario.usageForm === 'total'
      ? totalKwh.trim() !== ''
      : scenario.usageForm === 'seasonal'
        // 季節をまたぐ月は2欄あるので、どちらか一方の入力で先へ進める
        ? (mixedSeason
            ? summerKwh.trim() !== '' || otherKwh.trim() !== ''
            : (summer ? summerKwh : otherKwh).trim() !== '')
        : scenario.usageForm === 'tou'
          ? touTotal > 0
          : scenario.usageForm === 'family'
            ? familyTotal > 0 && calendar !== undefined
            : ecoTotal > 0 && calendar !== undefined

  return (
    <div className="container">
      <div className="header"><h1>料金を試算</h1></div>
      <div className="content">
        <div style={cardStyle}>
          <label htmlFor="scenario"><strong>現在のご契約プラン</strong></label>
          <select
            id="scenario"
            value={scenarioId}
            onChange={e => {
              setScenarioId(e.target.value)
              // 事業者が変わると選べる月も変わる。選択中の月が新しい選択肢に
              // 無ければ既定に戻す（選べるのに計算できない状態を作らない）。
              const next = findScenario(e.target.value)
              if (next && !periodOptionsFor(next).some(o => o.year === period.year && o.month === period.month)) {
                setPeriod(DEFAULT_RATE_PERIOD)
              }
            }}
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
            {periodOptions.map(p => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                {p.year}年{p.month}月
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
            燃料費調整額・再エネ賦課金は月ごとに改定されます
            {/* 7月・10月の検針期間は季節をまたぐ。片方だけと書くと、
                下で2欄を出していることと食い違う */}
            {scenario.usageForm !== 'total' &&
              (mixedSeason
                ? '（この検針期間は夏季とその他季にまたがります）'
                : summer
                  ? '（夏季料金の期間です）'
                  : '（その他季の期間です）')}
          </p>
        </div>

        {needsCalendar(scenario) && (
          <div style={cardStyle}>
            <strong>検針期間</strong>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 10px' }}>
              日数・土日・祝日は自動で数えます。夜トクプランの「ホリデータイム」を求めるために必要です
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                aria-label="検針期間の開始日"
                value={startDate}
                onChange={e => setMeterStart(e.target.value)}
                style={{ ...numberFieldStyle, fontSize: '15px' }}
              />
              <span>〜</span>
              <input
                type="date"
                aria-label="検針期間の終了日"
                value={endDate}
                onChange={e => setMeterEnd(e.target.value)}
                style={{ ...numberFieldStyle, fontSize: '15px' }}
              />
            </div>
            {dayCounts ? (
              <>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  {([
                    ['days', '日数'],
                    ['weekendDays', '土日'],
                    ['holidayDays', '祝日']
                  ] as const).map(([key, label]) => (
                    <label key={key} style={{ flex: 1, fontSize: '12px' }}>
                      {label}
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        aria-label={label}
                        value={dayCounts[key]}
                        onChange={e => setDayCounts({ ...dayCounts, [key]: e.target.value })}
                        style={{ ...numberFieldStyle, fontSize: '16px', padding: '8px' }}
                      />
                    </label>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: calendarValid ? 'var(--text-secondary)' : '#dc2626', marginTop: '8px' }}>
                  {calendarValid
                    ? `平日 ${periodDays!.days - periodDays!.weekendDays - periodDays!.holidayDays}日。検針票と違う場合は直接直してください`
                    : periodDays !== null &&
                        (periodDays.weekendDays < 0 || periodDays.holidayDays < 0)
                      ? '土日・祝日の日数に負の値は入れられません'
                      : '日数の内訳が合いません。土日と祝日の合計が日数を超えています'}
                </p>
                {daysEdited && mixedSeason && (
                  <p style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>
                    日数（{periodDays!.days}日）と検針期間の日付（{spanDays}日）が違います。
                    夏季とその他季の分け方は日付のほうから求めます。
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: '13px', marginTop: '10px', color: '#dc2626' }}>
                検針期間を正しく入力してください
              </p>
            )}

            <div style={{ marginTop: '16px' }}>
              <strong>休日の電気の使い方</strong>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 8px' }}>
                平日と比べて休日にどれくらい電気を使うか
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {HOLIDAY_RATIOS.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    title={r.hint}
                    style={chipStyle(holidayRatio === r.value)}
                    onClick={() => setHolidayRatio(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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

          {scenario.usageForm === 'seasonal' &&
            (mixedSeason ? (
              <>
                <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                  この検針期間は夏季とその他季にまたがります。検針票の内訳どおりに入力してください
                </p>
                <NumberField
                  id="usageSummer"
                  label="ご使用量 (kWh)・夏季単価"
                  hint="7〜9月にかかる分"
                  value={summerKwh}
                  onChange={setSummerKwh}
                />
                <NumberField
                  id="usage"
                  label="ご使用量 (kWh)・その他季単価"
                  value={otherKwh}
                  onChange={setOtherKwh}
                />
                <TotalBadge total={num(summerKwh) + num(otherKwh)} />
              </>
            ) : (
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
            ))}

          {scenario.usageForm === 'tou' && (
            <>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                検針票の時間帯ごとのご使用量を入力してください
                {mixedSeason && '（この検針期間は夏季とその他季にまたがります）'}
              </p>
              {mixedSeason ? (
                <>
                  <NumberField
                    id="daySummer"
                    label="デイタイム夏季 kWh"
                    hint="検針期間が7〜9月にかかる分"
                    value={daySummerKwh}
                    onChange={setDaySummerKwh}
                  />
                  <NumberField
                    id="day"
                    label="デイタイムその他季 kWh"
                    value={dayKwh}
                    onChange={setDayKwh}
                  />
                </>
              ) : (
                <NumberField
                  id="day"
                  label={summer ? 'デイタイム（夏季） kWh' : 'デイタイム kWh'}
                  value={dayKwh}
                  onChange={setDayKwh}
                />
              )}
              <NumberField id="night" label="ナイトタイム kWh" value={nightKwh} onChange={setNightKwh} />
              <NumberField
                id="holiday"
                label="ホリデータイム kWh"
                hint="土日祝の日中。区分がない検針票は 0 のままで結構です"
                value={holidayKwh}
                onChange={setHolidayKwh}
              />
              <TotalBadge total={touTotal} />
            </>
          )}

          {scenario.usageForm === 'family' && (
            <>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                検針票の時間帯ごとのご使用量を入力してください
                {mixedSeason && '（この検針期間は夏季とその他季にまたがります）'}
              </p>
              {mixedSeason ? (
                <>
                  <NumberField
                    id="famDaySummer"
                    label="デイタイム夏季 kWh"
                    hint="検針期間が7〜9月にかかる分"
                    value={famDaySummer}
                    onChange={setFamDaySummer}
                  />
                  <NumberField
                    id="famDayOther"
                    label="デイタイムその他季 kWh"
                    value={famDayOther}
                    onChange={setFamDayOther}
                  />
                </>
              ) : (
                <NumberField
                  id="famDayOther"
                  label={summerOnly ? 'デイタイム（夏季） kWh' : 'デイタイム kWh'}
                  value={famDayOther}
                  onChange={setFamDayOther}
                />
              )}
              <NumberField id="famFamily" label="ファミリータイム kWh" value={famFamily} onChange={setFamFamily} />
              <NumberField id="famNight" label="ナイトタイム kWh" value={famNight} onChange={setFamNight} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 12px', cursor: 'pointer' }}>
                <input type="checkbox" checked={allElectric} onChange={e => setAllElectric(e.target.checked)} />
                <span>
                  電化住宅割を適用する
                  {allElectricTerms &&
                    `（基本料金＋電力量料金の${allElectricTerms.ratePercent}%・上限${allElectricTerms.capYen.toLocaleString()}円）`}
                </span>
              </label>
              <TotalBadge total={familyTotal} />
            </>
          )}

          {scenario.usageForm === 'economy_night' && (
            <>
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                検針票の昼間時間・夜間時間のご使用量を入力してください
              </p>
              <NumberField id="ecoDay" label="昼間時間 kWh" value={ecoDay} onChange={setEcoDay} />
              <NumberField id="ecoNight" label="夜間時間 kWh" value={ecoNight} onChange={setEcoNight} />
              <TotalBadge total={ecoTotal} />
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
