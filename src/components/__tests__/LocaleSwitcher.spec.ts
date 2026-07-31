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
    // 内容与这条用例无关（只关心切换成功后的 UI 状态），但 Fix 4 之后
    // 真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable 拒绝，
    // setLocale 会失败。随便给一条非空内容。
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': { 1: 'x' }, 'i18n/en/ships.json': { 1: 'x' }, 'i18n/en/ctype.json': { 1: 'x' },
    }))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement
    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()

    expect(document.documentElement.lang).toBe('en')
    expect(select.value).toBe('en')
    expect(container!.querySelector('.switch-failed')).toBeNull()
    expect(container!.querySelector('.switch-retry')).toBeNull()
  })

  it('切换失败：显示失败提示文案与重试按钮，select 被拨回原语言，<html lang> 不变', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as unknown as Response)))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement
    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()

    expect(container!.querySelector('.switch-failed')?.textContent).toBe('语言切换失败，已保持当前语言')
    expect(container!.querySelector('.switch-retry')?.textContent).toBe('重试')
    // onChange 失败分支手动把 DOM 属性拨回 currentLocale（zh-Hans）
    expect(select.value).toBe('zh-Hans')
    expect(document.documentElement.lang).toBe('zh-Hans')
  })

  // Fix B：验证重试按钮真的能让用户走出"下拉框拨不动"的死胡同。这里特意
  // 让失败目标（en）与失败后 select 显示的值（zh-Hans，因为 onChange 把它
  // 拨回了 currentLocale）不同——用点击按钮而不是"重新选中同一个下拉选项"
  // 来触发重试，覆盖的正是原生 <select> 对"值没变"不派发 change 事件、
  // 用户在下拉框里点不出任何变化的那种场景（另见 index.spec.ts 里
  // "initLocale 加载失败 → 错误可见 → 重试 → 成功后错误清空" 一测，从
  // i18n 模块状态而不是组件 DOM 的角度覆盖了同一条重试路径，并额外用请求
  // 次数确认了重试确实重新发起了网络请求）。
  it('点击重试按钮：失败后重试成功，横幅与按钮一起消失，select 落在重试的目标语言上', async () => {
    let shouldFail = true
    vi.stubGlobal('fetch', vi.fn(async () =>
      shouldFail
        ? ({ ok: false, status: 500 } as unknown as Response)
        // 内容与这些用例无关（只关心切换成功/失败后的横幅与 select 状态），
        // 但 Fix 4 之后真实发起的请求不能再用 {} 糊弄——空表会被
        // isValidNameTable 拒绝，"成功" 分支会变回失败。
        : ({ ok: true, status: 200, json: async () => ({ 1: 'x' }) } as unknown as Response)))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement

    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(container!.querySelector('.switch-failed')).not.toBeNull()
    const retryButton = container!.querySelector('.switch-retry') as HTMLButtonElement
    expect(retryButton).not.toBeNull()

    shouldFail = false
    retryButton.click()
    await flush()

    expect(container!.querySelector('.switch-failed')).toBeNull()
    expect(container!.querySelector('.switch-retry')).toBeNull()
    expect(select.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })

  // 上面两个用例各自独立，都没证明失败横幅会在后续一次成功切换时消失——
  // onChange 里 `failed.value = !(await setLocale(next))` 无条件覆盖旧值，
  // 理论上第二次成功调用会把它重新写成 false，但这只是代码推理，不是观测
  // 结果。如果这行以后被改成只在失败分支赋值（比如写成
  // `if (!ok) failed.value = true`，漏了成功分支该清空），横幅就会卡住
  // 不消失——这种回归不会被前两个各自独立的用例发现，只有连续跑一次失败
  // 再成功才能看见。
  it('先失败后成功：失败横幅在下一次成功切换后消失，select 落在新语言上', async () => {
    // 用一个可变标志切换 fetch 行为的两个阶段，不用对 locale 的请求路径
    // （en 请求 3 个文件、ja 只请求 ctype.json）做特判。
    let shouldFail = true
    vi.stubGlobal('fetch', vi.fn(async () =>
      shouldFail
        ? ({ ok: false, status: 500 } as unknown as Response)
        // 内容与这些用例无关（只关心切换成功/失败后的横幅与 select 状态），
        // 但 Fix 4 之后真实发起的请求不能再用 {} 糊弄——空表会被
        // isValidNameTable 拒绝，"成功" 分支会变回失败。
        : ({ ok: true, status: 200, json: async () => ({ 1: 'x' }) } as unknown as Response)))
    mount()
    const select = container!.querySelector('select') as HTMLSelectElement

    // 第一次：切到 en，请求失败，横幅应出现
    select.value = 'en'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(container!.querySelector('.switch-failed')).not.toBeNull()
    expect(select.value).toBe('zh-Hans')

    // 第二次：请求转为成功，切到 ja，横幅应消失、select 落在 ja 上
    shouldFail = false
    select.value = 'ja'
    select.dispatchEvent(new Event('change'))
    await flush()
    expect(container!.querySelector('.switch-failed')).toBeNull()
    expect(select.value).toBe('ja')
    expect(document.documentElement.lang).toBe('ja')
  })
})
