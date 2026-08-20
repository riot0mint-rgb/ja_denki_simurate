interface HomeProps {
  onStartInput: () => void;
}

export default function Home({ onStartInput }: HomeProps) {
  return (
    <div className="container">
      <div className="header">
        <h1>JAでんき料金比較</h1>
      </div>
      <div className="content">
        <h2>現在の電気代がいくら安くなる?</h2>
        <p>
          JAでんきとの料金比較を簡単にシミュレーション。
          あなたの使用状況に合わせた試算結果が表示されます。
        </p>

        <div className="button-group">
          <button className="primary button-full" onClick={onStartInput}>
            月の電気代を入力する
          </button>
        </div>

        <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <h3>このアプリについて</h3>
          <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
            <li>中国電力とJAでんきの料金比較</li>
            <li>ご使用量から月額・年額削減額を自動計算</li>
            <li>個人情報はブラウザ内に保存（送信なし）</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
