/**
 * オフライン動作用の Service Worker。
 *
 * 料金シミュレータをキャッシュする以上、古い単価で試算し続ける危険が最大の関心事。
 * そこで:
 *   - ナビゲーションは network-first。通信があれば必ず最新を取りに行く
 *   - アセットは cache-first（ハッシュ付きファイル名なので内容が変われば URL が変わる）
 *   - ビルドごとに CACHE 名を変え、有効化時に古いキャッシュを消す
 *   - 新版を検知したらページ側にバナーを出し、利用者の操作で切り替える
 *
 * caches.match に ignoreVary を付けているのは、配信サーバーが Vary: Origin を返し、
 * Vite が module script に crossorigin を付ける（＝Origin ヘッダが付く）ため。
 * プリキャッシュ時のリクエストとヘッダが食い違い、JS だけキャッシュに当たらず
 * オフラインで白画面になる。同一オリジンの GET しか入れないので無視して安全。
 *
 * 単価は JS バンドルに含まれるため、バンドルが更新されれば単価も更新される。
 */
const CACHE = '__CACHE_VERSION__'
const PRECACHE_URLS = __PRECACHE_MANIFEST__

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', event => {
  // 利用者が「更新する」を押したときだけ待機中の新版に切り替える
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 画面遷移は必ず通信を試す。古い単価を掴んだままにしないため
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 503 や 404 の画面をオフライン時の代替にしてしまわないよう、成功応答だけ残す
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            event.waitUntil(
              caches.open(CACHE).then(cache => cache.put('/index.html', copy)).catch(() => {})
            )
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html', { ignoreVary: true }).then(hit => hit ?? Response.error())
        )
    )
    return
  }

  // ハッシュ付きアセットは内容が変われば URL も変わるのでキャッシュ優先で問題ない
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(hit => {
      if (hit) return hit
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          // waitUntil に載せないと、応答を返した直後に SW が止められて保存を取りこぼす。
          // 保存に失敗してもページの表示は続ける（容量超過などで put は落ちうる）
          event.waitUntil(
            caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {})
          )
        }
        return response
      })
    })
  )
})
