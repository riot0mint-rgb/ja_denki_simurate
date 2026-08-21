interface HomeProps {
  /** くわしい試算（検針票の数字を入力する） */
  onStartInput: () => void;
  /** かんたん試算（1か月の電気料金から逆算する） */
  onStartSimple: () => void;
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
    body: '使うのは3か所だけ。「ご契約種別」「ご使用量」「ご契約容量」です。お手元になければ、1か月の電気料金だけでも試算できます'
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

export default function Home({ onStartInput, onStartSimple }: HomeProps) {
  return (
    <main className="wrap">
      <section className="card hero">
        <p className="eyebrow">中国電力・auでんき ⇄ JAでんき</p>
        <h1 style={{ fontSize: '30px', margin: '12px 0 0', letterSpacing: '0.01em', color: 'var(--green-deep)' }}>
          電気代、1年でいくら
          <br />
          おトクになる？
        </h1>
        <p className="note" style={{ marginTop: '14px', fontSize: '14px' }}>
          検針票の数字を入れるだけ。JAでんきに切り替えた場合の1年分を、その場で計算します。
          12のプランに対応しています。
        </p>
        {/* 検針票が手元にあるかで最初に分ける。無い方をあきらめさせない */}
        <div style={{ display: 'grid', gap: '10px', marginTop: '22px' }}>
          <button className="btn btn-gold btn-full" onClick={onStartInput}>
            検針票から試算する
          </button>
          <button className="btn btn-ghost btn-full" onClick={onStartSimple}>
            検針票がない → かんたん試算
          </button>
        </div>
        <p className="note" style={{ marginTop: '10px', fontSize: '12.5px' }}>
          かんたん試算は、1か月の電気料金だけでおよその金額を出します。
        </p>
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
