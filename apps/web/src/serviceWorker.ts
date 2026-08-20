/**
 * Service Worker の登録と更新検知。
 *
 * 料金アプリなので「古い単価のまま動き続ける」ことが最大の事故になる。
 * 新版を検知したら自動で入れ替えず、利用者に更新を促す（試算の途中で
 * 画面が作り直されると入力が消えるため）。
 */
export type UpdateHandler = (applyUpdate: () => void) => void

export function registerServiceWorker(onUpdateAvailable: UpdateHandler): void {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register('/sw.js')
    .then(registration => {
      // 既に待機中の新版があるケース（前回タブを閉じずに再訪した場合など）
      if (registration.waiting) {
        onUpdateAvailable(() => applyUpdate(registration))
        return
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          // controller が居るときだけが「更新」。初回インストールは通知しない
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateAvailable(() => applyUpdate(registration))
          }
        })
      })
    })
    .catch(() => {
      // 登録に失敗してもアプリは通常どおり動く。オフライン対応が効かないだけ
    })
}

function applyUpdate(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage('SKIP_WAITING')
  // 新しい Service Worker が制御を取ったら読み込み直す
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true
  })
}
