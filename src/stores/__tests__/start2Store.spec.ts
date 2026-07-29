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
    //
    // 注意：这里必须用**能成功解析**的 start2.json 结构，不能像早前版本那样用
    // `{}` 糊弄过去——`{}` 缺少 api_mst_ship 等字段会让 readStart2 解析失败，
    // F2 修复后 initializeData() 会 reject，`Promise.all` 会直接抛出，这条测试
    // 就无法验证它本来要验证的"去重"这件事了（解析失败/去重是两个独立问题，
    // 分别由本 describe 的第一条和下面的 F2 describe 覆盖）。
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
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
      })),
    )
    const store = useStart2Store()
    const [r1, r2] = await Promise.all([store.initializeData(), store.initializeData()])
    expect(r1).toBe(r2)
    expect(r1).toEqual({ success: true, error: null })
  })
})

// F2：readStart2 解析失败（如接口返回结构变化、start2.json 变成 {}）时，
// initializeData() 必须让调用方能感知到失败，而不是悄悄返回"成功"+ 空表；
// 且失败必须是可恢复的——下次调用会真正重新尝试，而不是返回缓存的失败结果。
describe('F2: start2 解析失败时的健壮性', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('start2.json 解析失败（如返回 {}）时，initializeData() 应该失败而不是假装成功', async () => {
    setActivePinia(createPinia())
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        // start2.json 返回 {} ——缺少 api_mst_ship，readStart2 内部
        // `for (const item of json.api_mst_ship)` 会抛出 TypeError
        json: async () => (url.includes('start2.json') ? {} : []),
        text: async () => '[]',
      })),
    )
    const store = useStart2Store()

    // 关键断言：解析失败必须让 initializeData() 的 promise 失败，调用方
    // （developmentStore / DataInitializer）现有的 try/catch 才能捕获到它。
    // 如果这里改回旧行为（readStart2 内部吞掉异常），这个 promise 会 resolve
    // 成 { success: true, error: null }，下面这行会失败。
    await expect(store.initializeData()).rejects.toThrow()

    consoleErrorSpy.mockRestore()
  })

  it('解析失败后再次调用会重新尝试，而不是返回缓存的失败结果', async () => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => {})

    let start2Calls = 0
    const goodStart2 = {
      api_mst_ship: [],
      api_mst_slotitem: [],
      api_mst_stype: [],
      api_mst_equip_ship: [],
      api_mst_equip_exslot_ship: {},
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('start2.json')) {
          start2Calls++
          // 第一次拉取返回损坏数据，第二次（重试）恢复正常
          return { json: async () => (start2Calls === 1 ? {} : goodStart2), text: async () => '[]' }
        }
        return { json: async () => ({}), text: async () => '[]' }
      }),
    )
    const store = useStart2Store()

    await expect(store.initializeData()).rejects.toThrow()
    expect(start2Calls).toBe(1)

    // 如果失败没有清空 inflight，这里会拿到同一个已 reject 的缓存 promise：
    // 依旧 reject、且 start2Calls 不会增长到 2（没有发生新的 fetch）。
    await expect(store.initializeData()).resolves.toEqual({ success: true, error: null })
    expect(start2Calls).toBe(2)
  })
})
