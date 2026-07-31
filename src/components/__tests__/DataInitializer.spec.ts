// @vitest-environment jsdom
//
// DataInitializer 之前没有测试。这份钉住任务 9（以及审查驳回后的修复）
// 最容易失手的地方：loadingSteps / loadingMessageKey / errorMessage 里的
// 兜底文案存的是消息 key 还是已求值的字符串——只测挂载时的 zh-Hans 渲染
// 测不出这类 bug（改造前存字符串也长这样，同样能通过），必须证明**挂载
// 后再切语言**，面板文案会跟着更新，才能排除"存的是触发那一刻定死的
// 字符串"这种回归。
//
// 做法同 LocaleSwitcher.spec.ts / FlagshipSearch.spec.ts：createApp().mount()
// + 原生 i18n API，不引入 @vue/test-utils。
//
// 覆盖边界：不陪跑 onMounted 里 start2Store/developmentStore 两层 try/catch
// 的每一条分支排列组合——那部分控制流是既有逻辑，本任务未改动其结构，只
// 改了文案来源。这里挑了四条路径：正常加载中、外层 catch 的 error.unknown
// 兜底、内层 devResult.success===false 的 error.poolLoadFailed 兜底；
// devError 那层 catch 的 error.poolLoadException 走的是同一个
// fragmentFromCaught 辅助函数、同一个 errorMessage computed，未单独起
// 用例——与 error.unknown 那条（同样用 fragmentFromCaught）是重复的机制
// 覆盖，不再重复举证。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import DataInitializer from '../DataInitializer.vue'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { __resetI18nForTest, setLocale } from '@/i18n'

function mockFetchOk(tables: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(tables).find((k) => String(url).includes(k))
    if (!key) throw new Error(`未预期的请求: ${url}`)
    return { ok: true, status: 200, json: async () => tables[key] } as unknown as Response
  })
}

// 等待 onMounted 的同步/微任务部分跑完并把状态刷进 DOM。同 LocaleSwitcher.spec.ts 的 flush()。
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  await nextTick()
}

describe('DataInitializer', () => {
  let app: App | null = null
  let container: HTMLElement | null = null

  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    document.documentElement.lang = 'zh-Hans'

    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    app?.unmount()
    app = null
    container?.remove()
    container = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mount() {
    app = createApp(DataInitializer)
    app.mount(container as HTMLElement)
  }

  it('挂载时以 zh-Hans 渲染，文案与替换前的硬编码字符串一致', async () => {
    // 永不 resolve：组件卡在 start2Store.initializeData 的 await 上，
    // isLoading 保持 true、loadingMessageKey 停在 'loading.gameData'、三条
    // loadingSteps 都未完成——面板持续渲染，可以在这个状态下观察。
    vi.spyOn(useStart2Store(), 'initializeData').mockReturnValue(new Promise(() => {}))
    useDevelopmentStore()

    mount()
    await flush()
    const text = container!.textContent ?? ''
    expect(text).toContain('正在加载游戏数据...')
    expect(text).toContain('加载步骤:')
    expect(text).toContain('加载舰船数据')
    expect(text).toContain('加载深海舰船数据')
    expect(text).toContain('加载开发池数据')
    expect(text).toContain('处理中...')
  })

  it('挂载后切换语言：loadingMessageKey 与三条 loadingSteps 的译文都会更新 —— 证明存的是 key，不是挂载那一刻已求值的字符串', async () => {
    vi.spyOn(useStart2Store(), 'initializeData').mockReturnValue(new Promise(() => {}))
    useDevelopmentStore()
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
    }))
    mount()
    await flush()
    expect(container!.textContent ?? '').toContain('正在加载游戏数据...')

    const ok = await setLocale('en')
    expect(ok).toBe(true)
    await flush()

    const text = container!.textContent ?? ''
    // loadingMessageKey 对应 'loading.gameData' 的英文译文，与中文原文不同
    expect(text).toContain('Loading game data...')
    // 三条 loadingSteps 的 key 各自的英文译文
    expect(text).toContain('Loading ship data')
    expect(text).toContain('Loading abyssal data')
    expect(text).toContain('Loading development pool data')
    // 三条步骤都未完成，v-else 分支的 'loading.stepPending' 英文译文
    expect(text).toContain('In progress...')
    expect(text).toContain('Loading steps:')
    // 中文原文应完全消失——不是"英文追加在中文后面"这种半吊子实现
    expect(text).not.toContain('正在加载游戏数据...')
    expect(text).not.toContain('加载舰船数据')
    expect(text).not.toContain('处理中...')
  })

  // 复现审查 Finding 1：errorMessage 里 `error.unknown` 兜底文案改造前是
  // "赋值那一刻调一次 $t() 存死结果"，语言切换不会重新翻译，即便面板上
  // 其它文字（loadingMessageKey/loadingSteps）都会。用一个 reject 了非
  // Error 值（字符串）的 start2Store.initializeData 触发外层 catch 的
  // `error instanceof Error ? ... : fallback` 分支，强制走 fallback key，
  // 而不是走 Error.message 那条不查表的诊断文本路径。
  it('数据加载失败且异常不是 Error 实例：error.unknown 兜底文案挂载后切语言会重新翻译', async () => {
    vi.spyOn(useStart2Store(), 'initializeData').mockRejectedValue('boom')
    useDevelopmentStore()
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
    }))

    mount()
    await flush()
    expect(container!.textContent ?? '').toContain('未知错误')

    const ok = await setLocale('en')
    expect(ok).toBe(true)
    await flush()

    const text = container!.textContent ?? ''
    expect(text).toContain('Unknown error')
    expect(text).not.toContain('未知错误')
  })

  // 复现审查 Finding 2：`开发池数据加载错误` 这条兜底文案改造前完全没有
  // 对应的消息 key（不是"存了字符串"这种半吊子翻译，是压根没翻译），任何
  // 非 zh-Hans 用户看到的都是硬编码中文。现在它经由 error.poolLoadFailed
  // 走消息表，这里验证挂载后切语言也会重新翻译。
  //
  // 触发路径：devResult.success === false 且 devResult.error 为 null（没有
  // 可用的 message），对应 fragmentFromStoreError 的 fallback 分支——这条
  // 分支在生产代码里理论上不可达（developmentStore 的失败一律 throw new
  // Error(...)，devResult.error 实际总有 message），但类型上合法，且正是
  // 这个防御性兜底本身需要被测到。
  it('开发池数据加载失败且无可用 message：error.poolLoadFailed 兜底文案挂载后切语言会重新翻译', async () => {
    vi.spyOn(useStart2Store(), 'initializeData').mockResolvedValue({ success: true, error: null })
    vi.spyOn(useDevelopmentStore(), 'initializeData').mockResolvedValue({ success: false, error: null })
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
    }))

    mount()
    await flush()
    expect(container!.textContent ?? '').toContain('开发池数据加载错误')

    const ok = await setLocale('en')
    expect(ok).toBe(true)
    await flush()

    const text = container!.textContent ?? ''
    expect(text).toContain('Development pool data load error')
    expect(text).not.toContain('开发池数据加载错误')
  })
})
