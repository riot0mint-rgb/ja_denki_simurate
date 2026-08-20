interface HomeProps {
  onStartInput: () => void;
}

/** 検針票のどこを見ればよいかを先に示す。営業が説明する順番と同じにする */
const STEPS = [
  { n: '1', title: '検針票を用意する', body: '「ご契約種別」「ご使用量」「ご契約容量」の3か所を使います' },
  { n: '2', title: 'そのまま入力する', body: '打ち込みながら結果が動くので、検針票と突き合わせられます' },
  { n: '3', title: '年間の差額を見る', body: '12か月ぶんの燃料費調整額で積み上げた金額を出します' }
]

export default function Home({ onStartInput }: HomeProps) {
  return (
    <main className="wrap">
      <section className="card hero">
        <p className="eyebrow">中国電力・auでんき ↔ JAでんき</p>
        <h1 style={{ fontSize: '28px', margin: '12px 0 0', letterSpacing: '0.01em', color: 'var(--green-deep)' }}>
          いまの検針票から、
          <br />
          年間いくら変わるかを出します。
        </h1>
        <p className="note" style={{ marginTop: '12px', fontSize: '14px' }}>
          12種類のご契約プランに対応しています。入力した内容はこの端末から外に出ません。
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
        <p className="card-title">この試算について</p>
        <ul className="note" style={{ paddingLeft: '18px', marginTop: '8px' }}>
          <li>単価はJAでんきの公式試算表から取り込み、すべて出典を表示します</li>
          <li>燃料費調整額・再エネ賦課金は検針月ごとの実際の単価を使います</li>
          <li>計算はこの端末の中だけで行い、入力内容を送信しません</li>
        </ul>
      </div>
    </main>
  )
}
