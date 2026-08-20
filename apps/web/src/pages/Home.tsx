interface HomeProps {
  onStartInput: () => void;
}

/**
 * 検針票のどこを見ればよいかを先に示す。営業が説明する順番と同じにする。
 *
 * 文言は営業がお客様に読み上げても不自然にならない言葉を選ぶ。
 * 「端末」「送信」「データ」のような言い回しは使わない。
 */
const STEPS = [
  {
    n: '1',
    title: '検針票を手元に',
    body: '使うのは3か所だけです。「ご契約種別」「ご使用量」「ご契約容量」'
  },
  {
    n: '2',
    title: 'そのまま入力',
    body: '入力するそばから金額が出るので、検針票と見くらべられます'
  },
  {
    n: '3',
    title: '1年分でくらべる',
    body: '1か月ではなく1年で。毎月変わる燃料費調整額も月ごとに計算します'
  }
]

export default function Home({ onStartInput }: HomeProps) {
  return (
    <main className="wrap">
      <section className="card hero">
        <p className="eyebrow">中国電力・auでんき ⇄ JAでんき</p>
        <h1 style={{ fontSize: '28px', margin: '12px 0 0', letterSpacing: '0.01em', color: 'var(--green-deep)' }}>
          検針票が1枚あれば、
          <br />
          電気代が1年でいくら変わるか、わかります。
        </h1>
        <p className="note" style={{ marginTop: '12px', fontSize: '14px' }}>
          いまのご契約と、JAでんきに切り替えた場合の料金をその場でくらべます。12のプランに対応しています。
        </p>
        <button className="btn btn-gold btn-full" style={{ marginTop: '22px' }} onClick={onStartInput}>
          検針票から試算する
        </button>
      </section>

      <ol className="card" style={{ listStyle: 'none', display: 'grid', gap: '18px' }}>
        {STEPS.map(s => (
          <li key={s.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span
              className="num"
              style={{
                flex: '0 0 26px',
                height: '26px',
                borderRadius: '999px',
                background: 'var(--green-soft)',
                color: 'var(--green-dark)',
                fontWeight: 700,
                fontSize: '13px',
                display: 'grid',
                placeItems: 'center',
                marginTop: '4px'
              }}
            >
              {s.n}
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700 }}>{s.title}</span>
              <span className="note" style={{ display: 'block' }}>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="card" style={{ background: 'transparent' }}>
        <p className="card-title">お客様にお伝えしていること</p>
        <ul className="note" style={{ paddingLeft: '18px', marginTop: '8px' }}>
          <li>料金の単価はJAでんきの公式資料そのままです。どの資料の何ページから取った数字か、画面で確かめられます</li>
          <li>毎月変わる燃料費調整額も、その月の実際の金額で計算します</li>
          <li>お名前やご住所はうかがいません。入力した数字が外に送られることもありません</li>
        </ul>
      </div>
    </main>
  )
}
