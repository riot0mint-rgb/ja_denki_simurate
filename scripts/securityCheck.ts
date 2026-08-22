/**
 * 「入力した数字が端末の外に出ない」を、文章ではなくコードで検査する。
 *
 * CLAUDE.md ルール7（個人情報をログに出さない）とルール9（Phase A で
 * サーバーに送らない）は、いまは**構造として**成立している。アプリ全体に
 * 保存API も通信API も1つも無い。だが放っておけば誰かが1行 fetch を足せる。
 * そのとき壊れるのは機能ではなく約束なので、テストでは落ちない。
 *
 * ここは「約束が壊れたら CI が落ちる」ための関門であって、
 * 難読化された攻撃を見つけるためのものではない。
 */

export type Severity = 'error' | 'warn'

export interface Finding {
  severity: Severity
  rule: string
  file: string
  line: number
  detail: string
}

export interface SourceFile {
  path: string
  content: string
}

/**
 * ソースに現れてはいけないもの。
 *
 * `fetch` をここに入れないのは、Service Worker が使うため。
 * sw.js は別の規則（同一オリジン限定）で検査する。
 */
const FORBIDDEN_IN_SOURCE: Array<{ rule: string; pattern: RegExp; why: string }> = [
  {
    rule: 'no-persistence',
    pattern: /\b(localStorage|sessionStorage|indexedDB)\b|document\s*\.\s*cookie/,
    why: '入力を端末に残さない（ルール9）。残すと次の利用者に前の人の数字が見える'
  },
  {
    rule: 'no-network',
    pattern: /\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|navigator\s*\.\s*sendBeacon|\bfetch\s*\(/,
    why: '入力をサーバーに送らない（ルール9）'
  },
  {
    rule: 'no-console',
    pattern: /\bconsole\s*\.\s*(log|info|warn|error|debug|table|dir)\s*\(/,
    why: '個人情報をログに出さない（ルール7）。ブラウザのコンソールも記録される'
  },
  {
    rule: 'no-dynamic-code',
    pattern: /\beval\s*\(|new\s+Function\s*\(|document\s*\.\s*write\s*\(/,
    why: '動的コード実行はXSSの経路になる'
  },
  {
    rule: 'no-raw-html',
    pattern: /dangerouslySetInnerHTML|\.\s*innerHTML\s*=|insertAdjacentHTML/,
    why: 'DOM への生HTML挿入はXSSの経路になる。表示は React に任せる'
  },
  {
    rule: 'no-env',
    pattern: /import\s*\.\s*meta\s*\.\s*env|process\s*\.\s*env/,
    why: 'Phase A は環境変数を読まない。読み始めると設定漏れが本番の挙動を変える'
  }
]

/** 検査対象外。テストと、検査そのものを書いたファイル */
export function isScannedSource(path: string): boolean {
  if (/\.(test|spec)\.[tj]sx?$/.test(path)) return false
  if (/[/\\]test[/\\]/.test(path)) return false
  if (/securityCheck\.ts$/.test(path)) return false
  return /\.[tj]sx?$/.test(path)
}

/** 行内のコメントを落とす。出典URLや説明文が規則に当たるのを避ける */
function stripComments(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
}

export function scanSource(files: SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const file of files) {
    if (!isScannedSource(file.path)) continue
    file.content.split('\n').forEach((raw, i) => {
      const line = stripComments(raw)
      for (const rule of FORBIDDEN_IN_SOURCE) {
        if (rule.pattern.test(line)) {
          out.push({
            severity: 'error',
            rule: rule.rule,
            file: file.path,
            line: i + 1,
            detail: `${rule.why}: ${line.trim().slice(0, 90)}`
          })
        }
      }
    })
  }
  return out
}

/**
 * ビルド成果物の検査。
 *
 * ソースが綺麗でも、依存ライブラリが保存APIや通信APIを持ち込むことがある。
 * 実際に配るのは dist なので、配る物そのものを見る。
 */
const FORBIDDEN_IN_BUNDLE = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon'
]

export function scanBundle(files: SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const file of files) {
    for (const token of FORBIDDEN_IN_BUNDLE) {
      if (file.content.includes(token)) {
        out.push({
          severity: 'error',
          rule: 'bundle-clean',
          file: file.path,
          line: 0,
          detail: `配布物に ${token} が入っている。依存ライブラリが持ち込んだ可能性がある`
        })
      }
    }
  }
  return out
}

/** 配布する HTML が外部ホストを読みに行かないこと */
export function scanHtml(file: SourceFile): Finding[] {
  const out: Finding[] = []
  const refs = file.content.matchAll(/(?:src|href)\s*=\s*"(https?:)?\/\/([^"/]+)/g)
  for (const m of refs) {
    out.push({
      severity: 'error',
      rule: 'no-external-host',
      file: file.path,
      line: 0,
      detail: `外部ホスト ${m[2]} を読みに行っている。誰がこの画面を開いたかが相手に伝わる`
    })
  }
  return out
}

/**
 * Service Worker は fetch を使わざるを得ない。
 * 他オリジンへの要求に一切触らないことだけを確かめる。
 */
export function scanServiceWorker(file: SourceFile): Finding[] {
  const guarded = /url\s*\.\s*origin\s*!==\s*self\s*\.\s*location\s*\.\s*origin/.test(file.content)
  if (guarded) return []
  return [
    {
      severity: 'error',
      rule: 'sw-same-origin',
      file: file.path,
      line: 0,
      detail: '他オリジンへの要求を素通しする前の同一オリジン判定が見つからない'
    }
  ]
}

/**
 * 管理者向けの集計が、職員向けの配布物に混ざっていないこと。
 *
 * 集計（何件回って何件決まったか）は訪問中の職員には要らない。
 * 職員の画面に置くと、お客様の前で開いてしまう事故が起きる。
 * ビルドを分けてあるが、import を1本足せば簡単に元へ戻る。
 */
export const ADMIN_ONLY_MARKERS = ['いくら安くなると決まるのか', '集計表を貼る']

/** ファイル名で管理者向けの成果物を見分ける（vite のエントリ名が admin） */
export function isAdminAsset(path: string): boolean {
  return /(^|[/\\])admin[-.]/.test(path)
}

export function scanAdminSeparation(files: SourceFile[]): Finding[] {
  const out: Finding[] = []
  for (const file of files) {
    if (isAdminAsset(file.path)) continue
    for (const marker of ADMIN_ONLY_MARKERS) {
      if (file.content.includes(marker)) {
        out.push({
          severity: 'error',
          rule: 'admin-separated',
          file: file.path,
          line: 0,
          detail: `職員向けの配布物に管理者向けの文言「${marker}」が入っている。お客様の前で開いてしまう`
        })
      }
    }
  }
  return out
}

/** Service Worker が管理者向けの画面を職員の端末に先読みしないこと */
export function scanPrecache(file: SourceFile): Finding[] {
  const hit = file.content.match(/["'][^"']*admin[^"']*["']/)
  if (!hit) return []
  return [
    {
      severity: 'error',
      rule: 'admin-not-precached',
      file: file.path,
      line: 0,
      detail: `Service Worker が管理者向けの ${hit[0]} を先読みしている。職員の端末にオフラインで残る`
    }
  ]
}

export function renderReport(findings: Finding[]): string {
  if (findings.length === 0) {
    return '✓ ブラウザの外に出る経路は見つかりませんでした（保存API・通信API・ログ出力・外部ホスト参照）'
  }
  const lines = [`✗ ${findings.length}件の指摘があります`, '']
  for (const f of findings) {
    const where = f.line > 0 ? `${f.file}:${f.line}` : f.file
    lines.push(`[${f.rule}] ${where}`)
    lines.push(`  ${f.detail}`)
  }
  return lines.join('\n')
}

export function hasBlocking(findings: Finding[]): boolean {
  return findings.some(f => f.severity === 'error')
}
