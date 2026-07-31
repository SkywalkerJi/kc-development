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

// 下面这组覆盖「与参考实现的可观测差异」这一类修复。它们都必须挂载真实
// SFC 才测得到——被修的东西全在模板与 refresh* 的接线里，core 层的单元测试
// 看不见。
describe('DevelopmentView — 与参考实现对齐的展示与按钮状态', () => {
  let pinia: Pinia
  let app: App | null = null
  let container: HTMLElement | null = null

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const developmentStore = useDevelopmentStore()
    const start2Store = useStart2Store()

    start2Store.equipList = {
      100: { id: 100, name: '装备甲', types: [0, 0, 1, 1], broken: [1, 1, 1, 1] },
      200: { id: 200, name: '装备乙', types: [0, 0, 1, 1], broken: [1, 1, 1, 1] },
    } as never

    // 两个池：正池给装备甲 +2%，负池把它减回 0%。于是装备甲的逐池明细是
    // [2, -2]、合计 0 —— 正好落进「全部被替换」组，用来锁定该组成员行的
    // 出货率列展示的是明细串而不是写死的 "0%"。
    // 装备乙只在正池里，保证「其它装备」组非空、页面结构完整。
    developmentStore.developmentPools = createPools([
      { 开发池名称: '测试池', 开发池ID: 3, 舰ID: [], 出货率: { '100': 2, '200': 5 } },
      { 开发池名称: '测试池扣减', 开发池ID: -3, 舰ID: [], 出货率: { '100': -2 } },
    ])
    developmentStore.existPool = ['测试池']
    developmentStore.filterButtonList = {
      100: { equipInfo: start2Store.equipList[100], select: false, enabled: true },
      200: { equipInfo: start2Store.equipList[200], select: false, enabled: true },
    } as never

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
    app = createApp(DevelopmentView)
    app.use(pinia)
    app.mount(container as HTMLElement)
  }

  it('「全部被替换」组的成员行展示逐池明细串，不是写死的 0%', async () => {
    mount()
    await flush()

    const rows = container!.querySelectorAll('.replaced-equipment')
    expect(rows.length).toBe(1)
    const cells = rows[0].querySelectorAll('td')
    expect(cells[1].textContent).toBe('装备甲')
    // 参考实现在分组之前就算好了明细串，本组的行同样带着它。
    // 这里是 +2% 之后又被 -2%，展示为 "2%-2%"，不是 "0%"。
    expect(cells[2].textContent).toBe('2%-2%')
  })

  it('组头仍是固定的 0% —— 不要把组头和成员行「统一」掉', async () => {
    mount()
    await flush()
    const headers = [...container!.querySelectorAll('.group-header')]
    const replacedHeader = headers.find((h) => h.textContent?.includes('全部被替换'))
    expect(replacedHeader).toBeDefined()
    expect(replacedHeader!.querySelectorAll('td')[2].textContent).toBe('0%')
  })

  it('已选中的装备按钮不会被置灰，哪怕当前组合下启用集合为空', async () => {
    const developmentStore = useDevelopmentStore()

    // 这条测试要的是「启用集合为空」的状态，需要另一套池：
    // 装备甲**只出现在负 ID 池里**。反推路径下负池不做减法，只把没见过的
    // 装备登记为 0（减法只发生在正向路径），于是装备甲的合并出货率恒为 0，
    // 过不了「出货率 > 0」的准入判断 —— 没有任何池准入，启用集合是空集。
    // 这正是参考实现里「已选按钮保持高亮、其余全部置灰」的那个状态。
    developmentStore.developmentPools = createPools([
      { 开发池名称: '测试池', 开发池ID: 3, 舰ID: [], 出货率: { '200': 5 } },
      { 开发池名称: '扣减池', 开发池ID: -3, 舰ID: [], 出货率: { '100': -2 } },
    ])

    mount()
    await flush()

    const buttons = container!.querySelectorAll<HTMLButtonElement>('.equipment-buttons button')
    expect(buttons.length).toBe(2)

    buttons[0].click()
    await flush()

    expect(developmentStore.filterButtonList[100].select).toBe(true)
    // 已选的那个：enabled 保持 true，不带 disabled 样式，仍然可点（可取消）
    expect(developmentStore.filterButtonList[100].enabled).toBe(true)
    expect(buttons[0].classList.contains('selected')).toBe(true)
    expect(buttons[0].classList.contains('disabled')).toBe(false)
    expect(buttons[0].disabled).toBe(false)
    // 未选的那个：不在启用集合里，置灰
    expect(developmentStore.filterButtonList[200].enabled).toBe(false)
    expect(buttons[1].classList.contains('disabled')).toBe(true)

    // 取消选择后全部恢复可用
    buttons[0].click()
    await flush()
    expect(developmentStore.filterButtonList[100].enabled).toBe(true)
    expect(developmentStore.filterButtonList[200].enabled).toBe(true)
  })

  it('资源变化只重算正向路径，不重算公式列表与按钮状态', async () => {
    mount()
    await flush()

    const developmentStore = useDevelopmentStore()
    // 记下按钮状态对象的引用与内容，用来观察它有没有被重写
    const before = { ...developmentStore.filterButtonList[200] }

    // 把按钮状态改成一个「只要 refreshEnabled 跑过就会被覆盖」的值。
    // 资源变化不该触碰它 —— 参考实现在资源变化时只重算正向路径。
    developmentStore.filterButtonList[200].enabled = false

    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    fireInput(fuelInput, '30')
    await flush()

    // 正向路径确实重算了（资源被提交）
    expect(fuelInput.value).toBe('30')
    // 按钮状态没有被顺带重算回 true
    expect(developmentStore.filterButtonList[200].enabled).toBe(false)
    expect(before.enabled).toBe(true) // 说明初值确实是 true，上面那句不是恒真
  })

  it('清空输入框是合法的编辑中间态：不回填、不重算，失焦才还原', async () => {
    mount()
    await flush()

    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    fireInput(fuelInput, '30')
    await flush()
    expect(fuelInput.value).toBe('30')

    // 逐字符退到空。参考实现允许文本框在失焦前处于空状态，期间不重算。
    fireInput(fuelInput, '3')
    await flush()
    expect(fuelInput.value).toBe('3')   // 3 < 10，越界不提交，但显示保留

    fireInput(fuelInput, '')
    await flush()
    // 关键：空框保持空，不会「自己跳回 30」
    expect(fuelInput.value).toBe('')

    // 关键：清空之后发生一次与输入框无关的重渲染，空框必须保持空。
    // 编辑中的文本若只存在 DOM 上，这一步会把它回填成旧数字 ——
    // Vue 对 value 这个 prop 每次重渲染都重新 patch，且比较的是 DOM 当前值。
    const developmentStore = useDevelopmentStore()
    developmentStore.filterButtonList[100].enabled = false
    await flush()
    expect(fuelInput.value).toBe('')

    // 失焦：还原成上一个合法值
    fireBlur(fuelInput)
    await flush()
    expect(fuelInput.value).toBe('30')
  })
})

describe('DevelopmentView — 「可用公式」的选中语义', () => {
  let pinia: Pinia
  let app: App | null = null
  let container: HTMLElement | null = null

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const developmentStore = useDevelopmentStore()
    const start2Store = useStart2Store()

    // broken=[1,3,1,3] → 反推基线 [10,30,10,30]，油与钢都不占优，
    // 油钢池因此产出**两条**候选公式（一条抬油、一条抬钢），正好用来测
    // 「换行」与「同一行不重复触发」。
    start2Store.equipList = {
      300: { id: 300, name: '双候选装备', types: [0, 0, 1, 1], broken: [1, 3, 1, 3] },
    } as never
    developmentStore.developmentPools = createPools([
      { 开发池名称: '测试池', 开发池ID: 3, 舰ID: [], 出货率: { '300': 5 } },
    ])
    developmentStore.existPool = ['测试池']
    developmentStore.filterButtonList = {
      300: { equipInfo: start2Store.equipList[300], select: false, enabled: true },
    } as never

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
    app = createApp(DevelopmentView)
    app.use(pinia)
    app.mount(container as HTMLElement)
  }

  /** 选中那件装备，让公式表出现两行；返回这两行。 */
  async function showTwoResults() {
    mount()
    await flush()
    container!.querySelector<HTMLButtonElement>('.equipment-buttons button')!.click()
    await flush()
    const rows = container!.querySelectorAll<HTMLTableRowElement>('.development-results tbody tr')
    expect(rows.length).toBe(2)
    return rows
  }

  it('自动应用第一条公式后，第一行处于选中态', async () => {
    const rows = await showTwoResults()
    expect(rows[0].classList.contains('result-selected')).toBe(true)
    expect(rows[1].classList.contains('result-selected')).toBe(false)
    // 抬油那条：[30,30,10,30]
    expect(container!.querySelector<HTMLInputElement>('#fuel')!.value).toBe('30')

    // 「池类型」列（RESULT_COLUMNS 第 7 个，index 6）渲染的是
    // t(poolTypeLabel(r.池ID)) 这个组合的结果，不是 poolTypeLabel 单独返回的
    // key。beforeEach 里的池是 开发池ID: 3（油钢池），两条候选配方都来自它，
    // 所以两行都应该渲染成 zh-Hans 下的原词「油钢」。只测 poolTypeLabel 返回
    // 的 key 对不对（smoke.spec.ts）测不到这一层组合——把 key 传错、或者漏包
    // 一层 t()，这里才会红。
    expect(rows[0].querySelectorAll('td')[6].textContent).toBe('油钢')
    expect(rows[1].querySelectorAll('td')[6].textContent).toBe('油钢')
  })

  it('再次点击已选中的行不会覆盖用户手工输入的资源值', async () => {
    const rows = await showTwoResults()
    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    expect(fuelInput.value).toBe('30')

    // 用户手工把油改成 200 并失焦
    fireInput(fuelInput, '200')
    fireBlur(fuelInput)
    await flush()
    expect(fuelInput.value).toBe('200')

    // 再点同一行：参考实现的选中项没有变化，事件不触发，油应保持 200
    rows[0].click()
    await flush()
    expect(fuelInput.value).toBe('200')
  })

  it('点击另一行才会应用那一行的公式', async () => {
    const rows = await showTwoResults()
    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    expect(fuelInput.value).toBe('30')

    rows[1].click()   // 抬钢那条：[10,30,30,30]
    await flush()
    expect(fuelInput.value).toBe('10')
    expect(container!.querySelector<HTMLInputElement>('#steel')!.value).toBe('30')
    expect(rows[1].classList.contains('result-selected')).toBe(true)
  })

  it('点表头按该列排序，同列再点切换升降序', async () => {
    const rows = await showTwoResults()
    const cells = (r: HTMLTableRowElement) => [...r.querySelectorAll('td')].map((c) => c.textContent)
    // 默认顺序：抬油 [30,30,10,30] 在前，抬钢 [10,30,30,30] 在后
    expect(cells(rows[0])[1]).toBe('30')
    expect(cells(rows[1])[1]).toBe('10')

    const headers = container!.querySelectorAll<HTMLTableCellElement>('.development-results th')
    const fuelHeader = [...headers].find((h) => h.textContent?.startsWith('油'))!
    fuelHeader.click()
    await flush()

    let now = container!.querySelectorAll<HTMLTableRowElement>('.development-results tbody tr')
    expect(cells(now[0])[1]).toBe('10')   // 升序
    expect(cells(now[1])[1]).toBe('30')
    expect(fuelHeader.getAttribute('aria-sort')).toBe('ascending')

    fuelHeader.click()
    await flush()
    now = container!.querySelectorAll<HTMLTableRowElement>('.development-results tbody tr')
    expect(cells(now[0])[1]).toBe('30')   // 降序
    expect(fuelHeader.getAttribute('aria-sort')).toBe('descending')
  })

  it('数值列按数值排，不是按字符串排（刻意不复刻参考实现的这处缺陷）', async () => {
    const developmentStore = useDevelopmentStore()
    // 再加一个铝池，让总资源出现「两位数 + 三位数」的混合：
    // 铝池 → [10,30,10,31] 合计 81；油钢池 → 两条各 100。
    // 字符串升序是 "100","100","81"，数值升序才是 81,100,100 —— 两者不同，
    // 这条测试才真的能判别按哪种方式排的。
    developmentStore.developmentPools = createPools([
      { 开发池名称: '铝池', 开发池ID: 1, 舰ID: [], 出货率: { '300': 5 } },
      { 开发池名称: '测试池', 开发池ID: 3, 舰ID: [], 出货率: { '300': 5 } },
    ])
    developmentStore.existPool = ['铝池', '测试池']

    mount()
    await flush()
    container!.querySelector<HTMLButtonElement>('.equipment-buttons button')!.click()
    await flush()

    const readTotals = () =>
      [...container!.querySelectorAll('.development-results tbody tr')]
        .map((r) => r.querySelectorAll('td')[5].textContent!)
    expect(new Set(readTotals())).toEqual(new Set(['81', '100']))

    const totalHeader = [...container!.querySelectorAll<HTMLTableCellElement>(
      '.development-results th',
    )].find((h) => h.textContent?.startsWith('总资源'))!
    totalHeader.click()
    await flush()

    // 数值升序。若按字符串排会得到 ['100','100','81']。
    expect(readTotals()).toEqual(['81', '100', '100'])
  })

  it('改选装备会把排序状态复位回默认顺序', async () => {
    const rows = await showTwoResults()
    const fuelHeader = [...container!.querySelectorAll<HTMLTableCellElement>(
      '.development-results th',
    )].find((h) => h.textContent?.startsWith('油'))!
    fuelHeader.click()
    await flush()
    expect(fuelHeader.getAttribute('aria-sort')).toBe('ascending')

    // 取消选择再重新选中 —— 参考实现在改选装备时会清掉排序器
    const button = container!.querySelector<HTMLButtonElement>('.equipment-buttons button')!
    button.click()
    await flush()
    button.click()
    await flush()

    const headers = [...container!.querySelectorAll<HTMLTableCellElement>(
      '.development-results th',
    )]
    expect(headers.every((h) => h.getAttribute('aria-sort') === 'none')).toBe(true)
    const now = container!.querySelectorAll<HTMLTableRowElement>('.development-results tbody tr')
    expect(now[0].querySelectorAll('td')[1].textContent).toBe('30')  // 回到默认顺序
    expect(rows.length).toBe(2)
  })

  it('排序后再点同一逻辑配方不会重新应用 —— 选中态跟着结果对象走，不是显示位置', async () => {
    const rows = await showTwoResults()
    const fuel = container!.querySelector<HTMLInputElement>('#fuel')!
    const signature = (r: Element) =>
      [...r.querySelectorAll('td')].map((c) => c.textContent).join('|')
    const selected = signature(rows[0])

    // 用户手改油并失焦
    fireInput(fuel, '200')
    fireBlur(fuel)
    await flush()
    expect(fuel.value).toBe('200')

    // 点表头排序 —— 显示位置变了，选中的还是同一条结果
    const th = [...container!.querySelectorAll<HTMLTableCellElement>(
      '.development-results th',
    )].find((h) => h.textContent?.startsWith('铝'))!
    th.click()
    await flush()

    const after = [...container!.querySelectorAll<HTMLTableRowElement>(
      '.development-results tbody tr',
    )]
    const same = after.find((r) => signature(r) === selected)!
    expect(same.classList.contains('result-selected')).toBe(true)

    // 再点它：选中项没有变化 → 不触发 → 手改的 200 保住
    same.click()
    await flush()
    expect(fuel.value).toBe('200')

    // 点另一条才会应用
    const other = after.find((r) => signature(r) !== selected)!
    other.click()
    await flush()
    expect(fuel.value).not.toBe('200')
  })

  it('方向键与点击走同一条应用路径', async () => {
    const rows = await showTwoResults()
    const fuelInput = container!.querySelector<HTMLInputElement>('#fuel')!
    expect(fuelInput.value).toBe('30')

    rows[0].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    )
    await flush()
    expect(fuelInput.value).toBe('10')          // 已切到第二行的公式
    expect(rows[1].classList.contains('result-selected')).toBe(true)

    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await flush()
    expect(fuelInput.value).toBe('30')
    expect(rows[0].classList.contains('result-selected')).toBe(true)
  })
})
