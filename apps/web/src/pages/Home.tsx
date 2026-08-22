import Icon, { IconName } from '../components/Icon'

interface HomeProps {
  /** くわしい試算（検針票の数字を入力する） */
  onStartInput: () => void;
  /** かんたん試算（1か月の電気料金から逆算する） */
  onStartSimple: () => void;
  /** 商談ナビ（おうかがいから、お手続きのご案内まで） */
  onStartCoach: () => void;
  /** 営業の集計（支店で集めた記録を貼ると、何が効いているかが出る） */
  onStartInsights: () => void;
}

/**
 * 検針票のどこを見ればよいかを先に示す。営業が説明する順番と同じにする。
 *
 * 文言は営業がお客様に読み上げても不自然にならない言葉を選ぶ。
 * 「端末」「送信」「データ」のような言い回しは使わない。
 */
const STEPS: Array<{ n: string; icon: IconName; tone: string; title: string; body: string }> = [
  {
    n: '1',
    icon: 'receipt',
    tone: 'badge-leaf',
    title: '検針票を手元に',
    body: '使うのは3か所だけ。「ご契約種別」「ご使用量」「ご契約容量」です。お手元になければ、1か月の電気料金だけでも試算できます'
  },
  {
    n: '2',
    icon: 'pencil',
    tone: 'badge-green',
    title: 'そのまま入力',
    body: '入力するそばから金額が出るので、検針票と見くらべられます'
  },
  {
    n: '3',
    icon: 'coins',
    tone: 'badge-teal',
    title: '1年分でくらべる',
    body: '1か月ではなく1年で。毎月変わる燃料費調整額も月ごとに計算します'
  }
]

export default function Home({
  onStartInput,
  onStartSimple,
  onStartCoach,
  onStartInsights
}: HomeProps) {
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
          <button
            className="btn btn-gold btn-full"
            onClick={onStartInput}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Icon name="receipt" size={20} />
            検針票から試算する
          </button>
          <button
            className="btn btn-ghost btn-full"
            onClick={onStartSimple}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Icon name="calculator" size={20} />
            検針票がない → かんたん試算
          </button>
        </div>
        <p className="note" style={{ marginTop: '10px', fontSize: '12.5px' }}>
          かんたん試算は、1か月の電気料金だけでおよその金額を出します。
        </p>
      </section>

      {/*
        試算そのものより、お客様の前で何を言えばよいかで困る職員のほうが多い。
        入口を分けて、試算の手前から支えられるようにする
      */}
      <div className="card">
        <div className="card-head" style={{ marginBottom: '8px' }}>
          <span className="badge-icon badge-teal"><Icon name="chat" size={20} /></span>
          <p className="card-title">はじめてのご訪問ですか</p>
        </div>
        <p className="note">
          おうかがいすること、ご説明のしかた、よくお受けするご質問への答え方を、
          順番にご案内します。そのまま読める言葉で出ます。
        </p>
        <button className="btn btn-ghost btn-full" style={{ marginTop: '14px' }} onClick={onStartCoach}>
          商談ナビをひらく
        </button>
        <button
          className="btn btn-ghost btn-full"
          style={{ marginTop: '8px' }}
          onClick={onStartInsights}
        >
          営業の集計をひらく
        </button>
        <p className="note" style={{ marginTop: '10px', fontSize: '12.5px' }}>
          集計は、支店で集めた記録を貼るとその場で数えます。
        </p>
      </div>

      <ol className="card" style={{ listStyle: 'none', display: 'grid', gap: '18px' }}>
        {STEPS.map(s => (
          <li key={s.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <span className={`badge-icon ${s.tone}`} style={{ marginTop: '2px' }}>
              <Icon name={s.icon} size={20} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 700 }}>{s.title}</span>
              <span className="note" style={{ display: 'block' }}>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="card" style={{ background: 'transparent' }}>
        <div className="card-head" style={{ marginBottom: '6px' }}>
          <span className="badge-icon badge-teal"><Icon name="check" size={20} /></span>
          <p className="card-title">お客様にお伝えしていること</p>
        </div>
        <ul className="note" style={{ paddingLeft: '18px', marginTop: '8px' }}>
          <li>料金の単価はJAでんきの公式資料そのままです。どの資料の何ページから取った数字か、画面で確かめられます</li>
          <li>毎月変わる燃料費調整額も、その月の実際の金額で計算します</li>
          <li>お名前やご住所はうかがいません。入力した数字が外に送られることもありません</li>
        </ul>
      </div>
    </main>
  )
}
