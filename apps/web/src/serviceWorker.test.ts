import { describe, it, expect, vi, afterEach } from 'vitest'
import { registerServiceWorker } from './serviceWorker'

type Listener = () => void

class FakeWorker {
  state = 'installing'
  private listeners: Listener[] = []
  addEventListener(_type: string, fn: Listener) {
    this.listeners.push(fn)
  }
  transitionTo(state: string) {
    this.state = state
    this.listeners.forEach(fn => fn())
  }
}

class FakeRegistration {
  waiting: { postMessage: ReturnType<typeof vi.fn> } | null = null
  installing: FakeWorker | null = null
  private listeners: Listener[] = []
  addEventListener(_type: string, fn: Listener) {
    this.listeners.push(fn)
  }
  fireUpdateFound() {
    this.listeners.forEach(fn => fn())
  }
}

function installFakeContainer(registration: FakeRegistration | null, controller: object | null) {
  const containerListeners: Record<string, Listener[]> = {}
  const container = {
    controller,
    register: vi.fn(() => (registration ? Promise.resolve(registration) : Promise.reject(new Error('拒否')))),
    addEventListener: (type: string, fn: Listener) => {
      ;(containerListeners[type] ??= []).push(fn)
    }
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
    writable: true
  })
  return { container, fire: (type: string) => containerListeners[type]?.forEach(fn => fn()) }
}

/** register().then() のマイクロタスクを消化する */
const flush = () => new Promise(r => setTimeout(r, 0))

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error テスト間で消しておく
  delete navigator.serviceWorker
})

describe('Service Worker の登録', () => {
  it('未対応ブラウザでは何もしない（例外を投げない）', () => {
    expect(() => registerServiceWorker(() => {})).not.toThrow()
  })

  it('/sw.js を登録する', async () => {
    const { container } = installFakeContainer(new FakeRegistration(), null)
    registerServiceWorker(() => {})
    await flush()
    expect(container.register).toHaveBeenCalledWith('/sw.js')
  })

  it('登録に失敗してもアプリは動く（更新通知だけ出ない）', async () => {
    installFakeContainer(null, null)
    const onUpdate = vi.fn()
    registerServiceWorker(onUpdate)
    await flush()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('更新の検知', () => {
  it('初回インストールでは更新を通知しない', async () => {
    const registration = new FakeRegistration()
    installFakeContainer(registration, null) // controller なし = 初回
    const onUpdate = vi.fn()
    registerServiceWorker(onUpdate)
    await flush()

    registration.installing = new FakeWorker()
    registration.fireUpdateFound()
    registration.installing.transitionTo('installed')

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('2回目以降の installed で更新を通知する', async () => {
    const registration = new FakeRegistration()
    installFakeContainer(registration, {}) // controller あり = 更新
    const onUpdate = vi.fn()
    registerServiceWorker(onUpdate)
    await flush()

    registration.installing = new FakeWorker()
    registration.fireUpdateFound()
    registration.installing.transitionTo('installing')
    expect(onUpdate).not.toHaveBeenCalled()

    registration.installing.transitionTo('installed')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('既に待機中の新版があれば即座に通知する', async () => {
    const registration = new FakeRegistration()
    registration.waiting = { postMessage: vi.fn() }
    installFakeContainer(registration, {})
    const onUpdate = vi.fn()
    registerServiceWorker(onUpdate)
    await flush()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('updatefound で installing が無ければ何も起きない', async () => {
    const registration = new FakeRegistration()
    installFakeContainer(registration, {})
    const onUpdate = vi.fn()
    registerServiceWorker(onUpdate)
    await flush()
    registration.fireUpdateFound()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('更新の適用', () => {
  it('利用者が押すまで切り替えない。押したら SKIP_WAITING を送って再読み込みする', async () => {
    const registration = new FakeRegistration()
    registration.waiting = { postMessage: vi.fn() }
    const { fire } = installFakeContainer(registration, {})
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true
    })

    let apply: (() => void) | null = null
    registerServiceWorker(fn => {
      apply = fn
    })
    await flush()

    // 通知が出ただけでは何も起きない
    expect(registration.waiting.postMessage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    apply!()
    expect(registration.waiting.postMessage).toHaveBeenCalledWith('SKIP_WAITING')
    expect(reload).not.toHaveBeenCalled()

    // 新しい SW が制御を取ってから読み込み直す
    fire('controllerchange')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
