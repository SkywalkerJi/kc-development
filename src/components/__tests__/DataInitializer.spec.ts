// @vitest-environment jsdom
//
// DataInitializer 之前没有测试。这份钉住任务 9 最容易失手的地方：
// loadingSteps / loadingMessageKey 存的是消息 key 还是已求值的字符串——
// 只测挂载时的 zh-Hans 渲染测不出这个 bug（改造前存字符串也长这样，同样能
// 通过），必须证明**挂载后再切语言**，面板文案会跟着更新，才能排除"存的
// 是求值那一刻定死的字符串"这种回归。
//
// 做法同 LocaleSwitcher.spec.ts / FlagshipSearch.spec.ts：createApp().mount()
// + 原生 i18n API，不引入 @vue/test-utils。
//
// 覆盖边界：不陪跑 onMounted 里 start2Store/developmentStore 两层 try/catch
// 的各条错误分支——那部分是本任务范围外的既有逻辑，本任务未改动其结构，
// 只改了文案来源。这里用一个永不 resolve 的 start2Store.initializeData
// mock，把组件钉在"游戏数据加载中"这一步（loadingMessageKey ===
// 'loading.gameData'，三条 loadingSteps 均未完成），既够触发目标断言，又
// 不需要连带 mock developmentStore.initializeData。
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

// 等待 onMounted 的同步部分（`loadingMessageKey.value = 'loading.gameData'`）
// 跑完并把状态刷进 DOM。同 LocaleSwitcher.spec.ts 的 flush()。
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

    // 永不 resolve：组件卡在 start2Store.initializeData 的 await 上，
    // isLoading 保持 true、loadingMessageKey 停在 'loading.gameData'、三条
    // loadingSteps 都未完成——面板持续渲染，可以在这个状态下切语言观察。
    vi.spyOn(useStart2Store(), 'initializeData').mockReturnValue(new Promise(() => {}))
    useDevelopmentStore()

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
})
