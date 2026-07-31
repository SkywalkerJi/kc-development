// @vitest-environment jsdom
//
// 真实 SFC 挂载测试，做法同 src/views/__tests__/DevelopmentView.spec.ts：
// createApp(LocaleSwitcher).mount() + 原生 dispatchEvent，不引入
// @vue/test-utils（vitest.config.ts 已经装了 @vitejs/plugin-vue，.vue
// 文件能像生产代码一样被编译后 import；jsdom 补 DOM 实现）。
//
// LocaleSwitcher 本身不读任何 Pinia store（$t/currentLocale/localePending/
// setLocale 都是纯 i18n 模块状态），所以这里不需要 createPinia/setActivePinia，
// 与 src/i18n/__tests__/index.spec.ts 的直接单测不同，这份测的是组件这一层：
// 选项列表是否与 LOCALES 一一对应、切换成功/失败之后 DOM 是否如切换器自己
// 承诺的那样反应（失败提示出现、select 被拨回原语言）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import LocaleSwitcher from '../LocaleSwitcher.vue'
import { LOCALES } from '@/i18n/types'
import { __resetI18nForTest } from '@/i18n'

function mockFetchOk(tables: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(tables).find((k) => String(url).includes(k))
    if (!key) throw new Error(`未预期的请求: ${url}`)
    return { ok: true, status: 200, json: async () => tables[key] } as unknown as Response
  })
}

// 等待 onChange 里 `await setLocale(next)` 的续体跑完并把状态变化刷进 DOM。
// 与 DevelopmentView.spec.ts 的 flush() 同一套理由：先清空微任务队列
// （mock fetch 的 Promise 结算），再两次 nextTick 让 Vue 渲染调度队列走完。
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  await nextTick()
}

describe('LocaleSwitcher', () => {
  let app: App | null = null
  let container: HTMLElement | null = null

  beforeEach(() => {
    __resetI18nForTest()
    localStorage.clear()
    // document 在同一测试文件的多个用例之间是共享的 DOM，__resetI18nForTest
    // 只重置 i18n 模块内部状态，不会把上一个用例切换成功时写的 <html lang>
    // 改回来 —— 这里显式对齐 localeRef 的重置值，让每个用例都从已知状态开始。
    document.documentElement.lang = 'zh-Hans'
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    app?.unmount()
    app = null
    container?.remove()
    container = null
    vi.unstubAllGlobals()
  })

  function mount() {
    app = createApp(LocaleSwitcher)
    app.mount(container!)
  }

  it('选项列表与 LOCALES 一一对应，标签是各语言的母语自称', () => {
    mount()
    const options = Array.from(container!.querySelectorAll('option'))
    expect(options.map((o) => o.value)).toEqual([...LOCALES])
    // 顺序与 LOCALES 定义一致：zh-Hans/zh-Hant/ja/en
    expect(options.map((o) => o.textContent)).toEqual(['简体中文', '繁體中文', '日本語', 'English'])
  })

  it('切换成功：不显示失败提示，select 停在目标语言，<html lang> 同步更新', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
    }))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement
    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()

    expect(document.documentElement.lang).toBe('en')
    expect(select.value).toBe('en')
    expect(container!.querySelector('.switch-failed')).toBeNull()
  })

  it('切换失败：显示失败提示文案，select 被拨回原语言，<html lang> 不变', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as unknown as Response)))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement
    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()

    expect(container!.querySelector('.switch-failed')?.textContent).toBe('语言切换失败，已保持当前语言')
    // onChange 失败分支手动把 DOM 属性拨回 currentLocale（zh-Hans）
    expect(select.value).toBe('zh-Hans')
    expect(document.documentElement.lang).toBe('zh-Hans')
  })
})
