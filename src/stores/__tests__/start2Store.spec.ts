import { describe, it, expect, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStart2Store } from '@/stores/start2Store'

// initializeData 并发去重：App.vue 同时挂载 DataInitializer 与 DevelopmentView，
// 二者各自 await initializeData()。若没有进行中缓存，第二个调用方进入时第一个的
// fetch 还没 resolve，会触发第二次完整加载链路 —— 重复拉取 1.9MB 的 start2.json，
// 且第二遍会整体替换 filterButtonList，静默清空用户已做的装备选择。
// 这条必须是行为测试：把 `inflight ??= ...` 换回直接调用内部实现，这里必须变红。
describe('start2Store.initializeData 并发去重', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('并发调用两次，只触发一次 start2.json 拉取', async () => {
    setActivePinia(createPinia())
    let start2FetchCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('start2.json')) start2FetchCount++
        return {
          json: async () =>
            url.includes('start2.json')
              ? {
                  api_mst_ship: [],
                  api_mst_slotitem: [],
                  api_mst_stype: [],
                  api_mst_equip_ship: [],
                  api_mst_equip_exslot_ship: {},
                }
              : {},
          text: async () => '[]',
        }
      }),
    )

    const store = useStart2Store()
    const p1 = store.initializeData()
    const p2 = store.initializeData()
    await Promise.all([p1, p2])

    expect(start2FetchCount).toBe(1)
  })

  it('并发调用只跑一次底层加载：两次调用拿到同一个结果对象', async () => {
    // 注：不能直接断言两次调用返回的 Promise 引用相等（`toBe`）——Pinia 的 action
    // 包装会为每次调用生成新的 Promise 包装壳（用于 devtools/订阅），即使底层共享
    // 同一个进行中 Promise。真正能证明去重生效的是 resolve 出的结果对象是否同一个
    // 引用：只有底层只跑了一次 `_initializeData()`，两次 resolve 的才会是同一个对象。
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({}), text: async () => '[]' })),
    )
    const store = useStart2Store()
    const [r1, r2] = await Promise.all([store.initializeData(), store.initializeData()])
    expect(r1).toBe(r2)
  })
})
