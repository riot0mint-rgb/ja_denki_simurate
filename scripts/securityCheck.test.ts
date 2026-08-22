import { describe, it, expect } from 'vitest'
import {
  isScannedSource,
  scanSource,
  scanBundle,
  scanHtml,
  scanServiceWorker,
  scanAdminSeparation,
  scanPrecache,
  isAdminAsset,
  ADMIN_ONLY_MARKERS,
  renderReport,
  hasBlocking
} from './securityCheck'

const file = (path: string, content: string) => [{ path, content }]
const rules = (fs: ReturnType<typeof scanSource>) => fs.map(f => f.rule)

describe('isScannedSource', () => {
  it('アプリのソースは見る', () => {
    expect(isScannedSource('apps/web/src/App.tsx')).toBe(true)
    expect(isScannedSource('packages/calc-core/src/calculator.ts')).toBe(true)
  })

  it('テストは見ない（テスト自身が禁止語を書くため）', () => {
    expect(isScannedSource('apps/web/src/App.test.tsx')).toBe(false)
    expect(isScannedSource('apps/web/src/pages/Home.spec.ts')).toBe(false)
    expect(isScannedSource('apps/web/src/test/setup.ts')).toBe(false)
  })

  it('検査の実装自身は見ない（規則の文字列が当たるため）', () => {
    expect(isScannedSource('scripts/securityCheck.ts')).toBe(false)
  })

  it('コード以外は見ない', () => {
    expect(isScannedSource('apps/web/src/index.css')).toBe(false)
  })
})

describe('scanSource — 端末の外に出る経路を見つける', () => {
  it('保存APIを見つける', () => {
    expect(rules(scanSource(file('a.ts', 'localStorage.setItem("usage", u)')))).toContain(
      'no-persistence'
    )
    expect(rules(scanSource(file('a.ts', 'sessionStorage.clear()')))).toContain('no-persistence')
    expect(rules(scanSource(file('a.ts', 'const db = indexedDB.open("x")')))).toContain(
      'no-persistence'
    )
    expect(rules(scanSource(file('a.ts', 'document.cookie = "a=1"')))).toContain('no-persistence')
  })

  it('通信APIを見つける', () => {
    expect(rules(scanSource(file('a.ts', 'await fetch("/api/analyze")')))).toContain('no-network')
    expect(rules(scanSource(file('a.ts', 'new XMLHttpRequest()')))).toContain('no-network')
    expect(rules(scanSource(file('a.ts', 'new WebSocket(url)')))).toContain('no-network')
    expect(rules(scanSource(file('a.ts', 'new EventSource(url)')))).toContain('no-network')
    expect(rules(scanSource(file('a.ts', 'navigator.sendBeacon(url, body)')))).toContain(
      'no-network'
    )
  })

  it('ログ出力を見つける（ルール7）', () => {
    expect(rules(scanSource(file('a.ts', 'console.log({ usage, area })')))).toContain('no-console')
    expect(rules(scanSource(file('a.ts', 'console.error(e)')))).toContain('no-console')
  })

  it('動的コード実行と生HTMLを見つける', () => {
    expect(rules(scanSource(file('a.ts', 'eval(src)')))).toContain('no-dynamic-code')
    expect(rules(scanSource(file('a.ts', 'new Function("return 1")')))).toContain(
      'no-dynamic-code'
    )
    expect(rules(scanSource(file('a.ts', 'document.write(x)')))).toContain('no-dynamic-code')
    expect(rules(scanSource(file('a.tsx', '<div dangerouslySetInnerHTML={h} />')))).toContain(
      'no-raw-html'
    )
    expect(rules(scanSource(file('a.ts', 'el.innerHTML = s')))).toContain('no-raw-html')
    expect(rules(scanSource(file('a.ts', 'el.insertAdjacentHTML("beforeend", s)')))).toContain(
      'no-raw-html'
    )
  })

  it('環境変数の参照を見つける', () => {
    expect(rules(scanSource(file('a.ts', 'const k = import.meta.env.VITE_KEY')))).toContain(
      'no-env'
    )
    expect(rules(scanSource(file('a.ts', 'process.env.API_KEY')))).toContain('no-env')
  })

  it('行番号とファイル名を添える', () => {
    const found = scanSource(file('apps/web/src/x.ts', 'const a = 1\nconsole.log(a)\n'))
    expect(found[0].file).toBe('apps/web/src/x.ts')
    expect(found[0].line).toBe(2)
  })

  it('コメント内の記述では落とさない', () => {
    // 出典URLや設計の説明に禁止語が出るのは正常
    const src = [
      '// localStorage は使わない（ルール9）',
      '/* fetch も置かない */',
      'const x = 1'
    ].join('\n')
    expect(scanSource(file('a.ts', src))).toEqual([])
  })

  it('問題のないソースでは何も出さない', () => {
    expect(scanSource(file('a.ts', 'export const sum = (a: number, b: number) => a + b'))).toEqual(
      []
    )
  })

  it('テストファイルは中身が禁止語だらけでも素通しする', () => {
    expect(scanSource(file('a.test.ts', 'localStorage.setItem("x", "1")'))).toEqual([])
  })
})

describe('scanBundle — 配布物そのものを見る', () => {
  it('依存ライブラリが持ち込んだ保存API・通信APIを見つける', () => {
    const found = scanBundle(file('dist/assets/index.js', 'var a=window.localStorage'))
    expect(found).toHaveLength(1)
    expect(found[0].rule).toBe('bundle-clean')
    expect(found[0].detail).toContain('localStorage')
  })

  it('複数の混入を全部挙げる', () => {
    const found = scanBundle(file('dist/a.js', 'sessionStorage;new WebSocket(x);sendBeacon(y)'))
    expect(found).toHaveLength(3)
  })

  it('綺麗な配布物では何も出さない', () => {
    expect(scanBundle(file('dist/a.js', 'const t=(a,b)=>a+b'))).toEqual([])
  })
})

describe('scanHtml — 外部ホストを読みに行かない', () => {
  it('外部のスクリプト・スタイルを見つける', () => {
    const html = '<script src="https://cdn.example.com/x.js"></script>'
    const found = scanHtml({ path: 'dist/index.html', content: html })
    expect(found[0].rule).toBe('no-external-host')
    expect(found[0].detail).toContain('cdn.example.com')
  })

  it('プロトコル相対も見つける', () => {
    const found = scanHtml({ path: 'i.html', content: '<link href="//fonts.example/x.css">' })
    expect(found).toHaveLength(1)
  })

  it('同一オリジンの参照は通す', () => {
    const html = '<script src="/assets/index.js"></script><link href="./a.css">'
    expect(scanHtml({ path: 'i.html', content: html })).toEqual([])
  })
})

describe('scanServiceWorker — 他オリジンに触らない', () => {
  it('同一オリジン判定があれば通す', () => {
    const sw = 'const url = new URL(request.url)\nif (url.origin !== self.location.origin) return'
    expect(scanServiceWorker({ path: 'sw.js', content: sw })).toEqual([])
  })

  it('判定が無ければ落とす', () => {
    const found = scanServiceWorker({ path: 'sw.js', content: 'fetch(request)' })
    expect(found[0].rule).toBe('sw-same-origin')
  })
})

describe('職員向けと管理者向けの切り離し', () => {
  const marker = ADMIN_ONLY_MARKERS[0]

  it('管理者向けの成果物をファイル名で見分ける', () => {
    expect(isAdminAsset('apps/web/dist/admin.html')).toBe(true)
    expect(isAdminAsset('apps/web/dist/assets/admin-a1b2c3.js')).toBe(true)
    expect(isAdminAsset('apps/web/dist/assets/index-a1b2c3.js')).toBe(false)
    // 「admin」を含むだけの別物を巻き込まない
    expect(isAdminAsset('apps/web/dist/assets/administrator.js')).toBe(false)
  })

  it('職員向けのバンドルに集計が混ざっていたら落とす', () => {
    // import を1本足せば簡単に元へ戻ってしまうので、機械で止める
    const found = scanAdminSeparation(file('dist/assets/index-a1.js', `x="${marker}"`))
    expect(found[0].rule).toBe('admin-separated')
    expect(found[0].detail).toContain(marker)
  })

  it('共有チャンクに漏れても落とす', () => {
    const found = scanAdminSeparation(file('dist/assets/vendor-a1.js', marker))
    expect(found).toHaveLength(1)
  })

  it('管理者向けの成果物には入っていてよい', () => {
    expect(scanAdminSeparation(file('dist/assets/admin-a1.js', marker))).toEqual([])
    expect(scanAdminSeparation(file('dist/admin.html', marker))).toEqual([])
  })

  it('職員向けの成果物がそのままなら通す', () => {
    expect(scanAdminSeparation(file('dist/assets/index-a1.js', 'const a=1'))).toEqual([])
  })

  it('Service Worker が管理者向けを先読みしていたら落とす', () => {
    // 職員が使わないものを、職員の端末に持たせる理由がない
    const sw = { path: 'dist/sw.js', content: 'const P=["/index.html","/admin.html"]' }
    const found = scanPrecache(sw)
    expect(found[0].rule).toBe('admin-not-precached')
    expect(found[0].detail).toContain('admin.html')
  })

  it('先読み一覧に管理者向けが無ければ通す', () => {
    expect(scanPrecache({ path: 'dist/sw.js', content: 'const P=["/index.html"]' })).toEqual([])
  })
})

describe('レポート', () => {
  it('指摘が無ければ通った旨だけ出す', () => {
    expect(renderReport([])).toContain('見つかりませんでした')
    expect(hasBlocking([])).toBe(false)
  })

  it('指摘があれば件数・場所・理由を出す', () => {
    const findings = scanSource(file('apps/web/src/x.ts', 'console.log(usage)'))
    const report = renderReport(findings)
    expect(report).toContain('1件')
    expect(report).toContain('apps/web/src/x.ts:1')
    expect(report).toContain('no-console')
    expect(hasBlocking(findings)).toBe(true)
  })

  it('警告だけなら CI は落とさない', () => {
    const warn = [
      { severity: 'warn' as const, rule: 'r', file: 'f', line: 0, detail: 'd' }
    ]
    expect(hasBlocking(warn)).toBe(false)
    expect(renderReport(warn)).toContain('[r] f')
  })
})
