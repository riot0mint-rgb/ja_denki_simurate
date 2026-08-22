import Logo from '../components/Logo'
import SalesInsights from './SalesInsights'

/**
 * 管理者向けの画面。職員向けのアプリとはビルドが分かれている。
 *
 * 実務に要らない集計を職員の画面に置くと、お客様の前で開いてしまう事故が起きる。
 * コードごと分けておけば、職員側のバンドルに集計は1バイトも入らない。
 *
 * **アクセス制限は配信するサーバー側でかける。** 画面の中で判定しても、
 * JavaScript は誰でも読めるので意味がない（DEPLOY.md「管理者向け画面の切り離し」）。
 */
export default function AdminApp() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Logo />
          <span className="topbar-sub">管理者向け ／ 営業の集計</span>
        </div>
      </header>
      {/* 単独の画面なので戻り先が無い。開いたタブを閉じるだけ */}
      <SalesInsights onBack={() => window.close()} backLabel="閉じる" />
      <footer className="sitefoot">
        <p>管理者向けの画面です。この画面のURLを職員へ配らないでください。</p>
        <p>貼った内容はこの端末の中だけで数えられ、どこにも送信・保存されません。</p>
      </footer>
    </div>
  )
}
