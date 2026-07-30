// @vitest-environment jsdom
//
// 第三轮审查 H1（P1-1）：真实 SFC 挂载测试，复现审查提供的场景——输入越界
// 资源值（如铝=5）且不失焦，断言分组结果不受影响。
//
// 为什么不需要 @vue/test-utils（第二轮已确认的结论，这里重申一次）：
// - SFC 编译：vitest 底层就是 vite，vitest.config.ts 里已经加了
//   @vitejs/plugin-vue（原本就是 vite.config.ts 生产构建用的同一个依赖，
//   这里复用，不是新增），.vue 文件可以像生产代码一样被编译后 import。
// - DOM：Node 环境没有 document/window，真挂载真发 input/blur 事件必须要有
//   DOM 实现——这是 jsdom（新增的唯一依赖）补的，跟"要不要用 test-utils
//   这层封装"是两件事。
// - 挂载/卸载/事件派发：vue 本身导出的 createApp()/app.mount() 就是完整的
//   运行时 API，不需要 test-utils 包一层 mount() 助手；事件用原生
//   dispatchEvent 触发，断言直接读 DOM（textContent/value/querySelectorAll），
//   不需要 test-utils 的包装断言 API。
//
// 这份测试挂载的是 DevelopmentView.vue 本身（不是复制出来的一份接线），
// 所以下面的"变异确认"改真实生产代码也能让它变红——见文件底部报告引用的
// 变异步骤。
//
// 覆盖边界：为了不依赖真实的 fetch(start2.json)（1.9MB）等大数据文件，这里
// 直接 spy developmentStore.initializeData() 跳过真实网络请求，只保留
// DevelopmentView.vue 里资源状态（rawResources/committedResources）到
// groupedEquipments/refreshCurrentPool 这条接线本身。initFailed 分支、
// fetch 失败路径不在这份测试范围内（同文件 DevelopmentView.vue:416 附近
// 注释里如实记录的边界）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import type { App } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { vi } from 'vitest'
import DevelopmentView from '../DevelopmentView.vue'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { useStart2Store } from '@/stores/start2Store'
import { createPools } from '@/core/developmentPool'

// 等待 onMounted 里 `await developmentStore.initializeData()`（已 mock，
// 立即 resolve）的续体跑完，并让 Vue 把由此产生的状态变化（selectedPool/
// currentPoolEquipments/...）刷进 DOM。setTimeout(0) 先清空微任务队列
// （含 mockResolvedValue 产生的 promise 结算与 async 函数续体的同步部分），
// 随后两次 nextTick() 确保 Vue 的渲染调度队列也走完。
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  await nextTick()
}

function fireInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function fireBlur(input: HTMLInputElement) {
  input.dispatchEvent(new Event('blur'))
}

describe('DevelopmentView — H1 rawResources/committedResources 拆分', () => {
  let pinia: Pinia
  let app: App | null = null
  let container: HTMLElement | null = null

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    const developmentStore = useDevelopmentStore()
    const start2Store = useStart2Store()

    // 两件装备，broken 门槛特意错开，让「铝」单独越界时能观察到分组变化：
    // A 的四项门槛都是 10（[10,10,10,10] 基线下刚好够，属于「其它可出货」）；
    // B 的油门槛是 30（基线下不够，属于「资源不足」），铝门槛与 A 相同都是 10。
    start2Store.equipList = {
      100: { id: 100, name: '测试装备A', types: [0, 0, 0, 0], broken: [1, 1, 1, 1] },
      200: { id: 200, name: '测试装备B', types: [0, 0, 0, 0], broken: [3, 1, 1, 1] },
    } as never

    developmentStore.developmentPools = createPools([
      { 开发池名称: '测试池', 开发池ID: 3, 舰ID: [], 出货率: { '100': 6, '200': 4 } },
    ])
    developmentStore.existPool = ['测试池']
    developmentStore.filterButtonList = {}

    // 绕开真实 fetch：onMounted 只需要拿到 { success: true }，developmentPools/
    // existPool/filterButtonList 已经在上面手动播种好了，不需要真的打
    // ctype.json/DevelopmentPool.json/start2.json。
    vi.spyOn(developmentStore, 'initializeData').mockResolvedValue({ success: true, error: null })

    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    app?.unmount()
    container?.remove()
    app = null
    container = null
    vi.restoreAllMocks()
  })

  function mount() {
    // 同一个 pinia 实例：先 setActivePinia 供上面播种状态时 useXStore() 使用，
    // 这里 app.use(同一个 pinia) 而不是 app.use(createPinia())——否则组件内部
    // useDevelopmentStore()/useStart2Store() 拿到的是另一个空实例，播种的数据
    // 全部读不到，测试会在"看起来正常但实际啥都没测到"的状态下通过。
    app = createApp(DevelopmentView)
    app.use(pinia)
    app.mount(container as HTMLElement)
  }

  it('基线 [10,10,10,10]：装备B（油门槛30）在资源不足分组，装备A在其它分组', async () => {
    mount()
    await flush()

    const insufficientRows = container!.querySelectorAll('.insufficient-equipment')
    expect(insufficientRows.length).toBe(1)
    expect(insufficientRows[0].textContent).toContain('测试装备B')
  })

  it('正向对照：油改到 30（合法整数、落在[10,300]内）不失焦也应立即提交并重算——装备B变为可出货', async () => {
    mount()
    await flush()
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(1)

    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    fireInput(fuelInput, '30')
    await flush()

    // 合法整数、在范围内：committedResources 立即推进，B 的油门槛 30 被满足。
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(0)
    expect(fuelInput.value).toBe('30')
  })

  it('复现审查场景：铝改到 5（越界）且不失焦——分组必须保持不变，只有输入框显示变化', async () => {
    mount()
    await flush()

    // 先把油推到 30，让两件装备都进入「资源不足=0」的已知状态，
    // 这样下面铝=5 造成的变化（如果发生）能被观察到，不会被基线的
    // 装备B插入干扰判断。
    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    fireInput(fuelInput, '30')
    await flush()
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(0)

    const bauxiteInput = container!.querySelector<HTMLInputElement>('#bauxite')!
    fireInput(bauxiteInput, '5')
    await flush()

    // 核心断言：铝=5 越界、未失焦——committedResources 不应该被这次输入改变，
    // 分组因此必须保持不变（仍是 0 条资源不足）。
    // 用户依然能看到自己打出来的 "5"（rawResources 驱动显示，不回退）。
    expect(bauxiteInput.value).toBe('5')
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(0)
  })

  it('失焦：无条件提交——即使被 blur 的字段本身没变化，其它字段当前持有的越界值也要一并被提交', async () => {
    mount()
    await flush()
    // 基线：只有装备B资源不足（1 条）。
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(1)

    // 铝打成越界的 "5"，不失焦——不提交，装备A（铝门槛10）暂时不受影响，
    // 分组应保持不变（仍只有 B 一条，这一步先确认"未提交不影响分组"）。
    const bauxiteInput = container!.querySelector<HTMLInputElement>('#bauxite')!
    fireInput(bauxiteInput, '5')
    await flush()
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(1)

    // 关键步骤：失焦一个**没有变化**的字段（油，原地还是默认的 10——
    // validateResourceValue(10, 10) 钳位结果与当前值相同，rawResources[0]
    // 不会真的发生赋值变化，watch(rawResources, ...) 也就不会被这次赋值
    // 触发）。如果 normalizeResource 只是"顺带"依赖 watch 的自动提交
    // （比如被精简成只调用 validateResource + refresh*，指望 watch 自己
    // 把值提交上去），这次失焦会因为没有任何 rawResources 变化而完全
    // 静默——committedResources 不会被更新，铝的越界值 "5" 就不会被提交，
    // 分组会停留在 1 条不变。
    //
    // 但参考实现的失焦是"无条件"的：不管被 blur 的是不是这个字段、这个
    // 字段本身变没变，Leave 都要把当前四个字段的原始值整体提交一次。
    // 所以正确实现下，铝的 "5" 会随着这次失焦被提交，装备A（铝门槛10）
    // 也因此掉进资源不足——分组必须从 1 条变成 2 条。这条断言只有
    // "normalizeResource 自己无条件写 committedResources"才能满足，
    // 不会被 watch 的自动提交路径顺带覆盖到。
    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    fireBlur(fuelInput)
    await flush()

    expect(fuelInput.value).toBe('10')
    expect(bauxiteInput.value).toBe('5')
    expect(container!.querySelectorAll('.insufficient-equipment').length).toBe(2)
  })
})
