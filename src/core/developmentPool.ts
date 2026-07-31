import type { DevelopmentPoolData } from './types'
import { ShipType } from './types'
import { type PoolDescriptor } from './poolDescriptor'

interface ShipLike { name: string; stype: number; ctype: number }
type GetIDs = (names: string[], exact: boolean) => number[]

export class DevelopmentPoolClass implements DevelopmentPoolData {
  开发池名称 = ''
  开发池ID = 0
  舰种?: string[]
  舰型?: string[]
  舰名?: string[]
  舰ID: number[] = []
  不包含舰ID?: number[]
  最低资源?: number[]
  出货率: Record<string, number> = {}
  /**
   * 舰ID 的集合形式，只用于超集判定（findCompatiblePools）。
   *
   * 为什么要缓存：池匹配每次调用都要为**每个**候选池判断「候选 ⊇ 基准」，
   * 原来每次都现场 new Set(p.舰ID)；一次反推要往集合里插入十几万个元素。
   * 舰ID 在 init() 之后不再变化，所以完全可以只建一次。
   *
   * ⚠️ 它**不能**替代 舰ID 本身：舰ID 里刻意保留了重复项（见下面 init()
   * 里的说明），而池排序与「取最窄池」用的是含重复项的 舰ID.length。
   * 集合去重后 size 会不同，那两处必须继续读数组。
   *
   * 维护点只有两处：createPools（池未经 init 直接使用时）与 init() 末尾。
   * 任何新增的 舰ID 写入点都必须同步重建它。
   */
  舰ID集: Set<number> = new Set()
  /**
   * 筛选条件的结构化描述，供展示层格式化（见 core/poolDescriptor.ts）。
   *
   * 这里原本是 `private text: string`，在 init() 里就拼成一整句中文 ——
   * 在数据加载那一刻就烤死成一种语言，没法多语言化。
   *
   * `shipIds` 存的是**未展开**的 舰ID（JSON 原文，或 createPools 给的空数组
   * 默认值），不是下面四段逻辑展开后的 this.舰ID。这是刻意的：改造前的
   * text 构建那一段在四段展开逻辑**之前**就跑完了，读到的正是原始值 ——
   * 拿展开后的 舰ID 会让 ~60 个用 舰种/舰型/舰名 筛选的池在描述里把每一艘
   * 展开出来的舰都列出来，那不是原有行为。
   *
   * 顺带解掉一个类型问题：private 字段会让 Pinia 的 UnwrapRef 在映射时把它
   * 丢掉，暴露出来的元素类型结构上不再是 DevelopmentPoolClass。改造前 View
   * 与 store 里一共有三处 `as unknown as DevelopmentPoolClass` 断言应付这个问题
   * ——DevelopmentView.vue 的 pools()、developmentStore.ts 的 setFlagship、
   * DevelopmentView.vue 的 availablePools（selectablePools 的包装）。改成
   * 公开字段后三处全部确认不再需要，已经删掉，`pnpm type-check` 通过。
   */
  descriptor: PoolDescriptor = {
    stypes: [], ctypes: [], shipNames: [], shipNameIds: [], excludeShipIds: [], shipIds: [],
  }

  init(ctypeMap: Record<string, string>, getIDs: GetIDs, shipList: Record<number, ShipLike>): void {
    // 描述结构：只收集「有哪些条件」，不决定怎么显示。shipIds 在这里就要
    // 定型（原样快照 this.舰ID），不能等下面四段展开跑完再取，见字段处的
    // 说明。
    this.descriptor = {
      stypes: [...(this.舰种 ?? [])],
      ctypes: (this.舰型 ?? []).map((t) => {
        const n = Number(t)
        return Number.isNaN(n) ? t : n
      }),
      shipNames: [...(this.舰名 ?? [])],
      // 逐个舰名单独精确查一次（exact=true）：与下面「舰ID 展开」那一段的
      // exact=false 模糊调用是**两次不同目的的调用**，不能合并、也不能
      // 互相替代——那一段返回的是整条同型舰链，答不出"这个名字具体是哪
      // 一艘"；这里要的正是这件事，只服务展示层的名字→译名映射，不影响
      // 下面 舰ID 的任何计算。查不到就是 null，由 formatPoolDescriptor
      // 回退渲染原始日文舰名（详见 PoolDescriptor.shipNameIds 的说明）。
      shipNameIds: (this.舰名 ?? []).map((name) => getIDs([name], true)[0] ?? null),
      excludeShipIds: [...(this.不包含舰ID ?? [])],
      shipIds: [...(this.舰ID ?? [])],
      minResources: this.最低资源 ? [...this.最低资源] : undefined,
    }

    if (!this.舰ID) this.舰ID = []

    // 刻意复刻参考实现：以下三段一律 push 追加，不去重。
    // 舰ID.length 参与池排序与「取最窄池」判断，去重会改变这两处结果。
    if (this.舰种) {
      const wanted: number[] = []
      for (const name of this.舰种) {
        const v = ShipType[name as keyof typeof ShipType]
        if (typeof v === 'number') wanted.push(v)
      }
      for (const [k, ship] of Object.entries(shipList)) {
        const id = Number(k)
        if (id < 1500 && wanted.includes(ship.stype)) this.舰ID.push(id)
      }
    }

    if (this.舰型) {
      const wanted: number[] = []
      for (const t of this.舰型) {
        const n = Number(t)
        if (!Number.isNaN(n)) { wanted.push(n); continue }
        for (const [k, v] of Object.entries(ctypeMap))
          if (v === t) { wanted.push(Number(k)); break }
      }
      for (const [k, ship] of Object.entries(shipList)) {
        const id = Number(k)
        if (id < 1500 && wanted.includes(ship.ctype)) this.舰ID.push(id)
      }
    }

    if (this.舰名) this.舰ID.push(...getIDs(this.舰名, false))

    // 刻意复刻参考实现：List.Remove 只移除首个匹配项，不是 filter
    if (this.不包含舰ID)
      for (const id of this.不包含舰ID) {
        const idx = this.舰ID.indexOf(id)
        if (idx !== -1) this.舰ID.splice(idx, 1)
      }

    // 舰ID 到这里就定型了，建一次集合供超集判定复用（见字段处的说明）
    this.舰ID集 = new Set(this.舰ID)
  }

  /**
   * 只返回池名，**不再拼描述**，仅用于日志/调试这类不面向用户的场合。
   *
   * 描述的唯一产出点是 core/poolDescriptor.ts 的 formatPoolDescriptor()。
   * 这里若也拼一份，两者会各拼各的、慢慢分叉 —— 正是这次重构要消除的东西。
   *
   * 「秘书舰类型」下拉框（DevelopmentView.vue）不再调用这个方法：它现在
   * 直接用 poolName(pool.开发池名称) 取译名、describePool(pool)（内部调
   * formatPoolDescriptor(pool.descriptor, ...)）取筛选条件描述，两者各自
   * 可多语言化，拼起来即是改造前 `名称(描述)` 的完整形态。
   */
  toString(): string {
    return this.开发池名称
  }
}

/**
 * 下拉框（秘书舰类型）候选池的准入谓词：非负 ID 且没有最低资源门槛。
 *
 * **这是这条规则的唯一定义。** 生产的 existPool/selectablePools、对拍夹具
 * 的 existPool、以及对拍里挑基准池的地方都必须走它 —— 三处各写一遍的话，
 * 只要有一处漏掉某个条件，对拍就会去验证一个用户根本选不到的池。
 * 名称去重不在这里，由调用方按池的先后顺序保证（取同名池中的第一个）。
 */
export function isPoolSelectable(pool: {
  开发池ID: number
  最低资源?: number[]
}): boolean {
  return pool.开发池ID >= 0 && !pool.最低资源
}

export function createPools(data: DevelopmentPoolData[]): DevelopmentPoolClass[] {
  return data.map((d) => {
    const 舰ID = [...(d.舰ID ?? [])]
    // 这里也建一次集合：池不一定会被 init()（例如直接给定 舰ID 的场景），
    // 那种情况下 舰ID 就是这份原始值，集合与它保持一致。init() 末尾会用
    // 展开后的 舰ID 重建。
    return Object.assign(new DevelopmentPoolClass(), d, { 舰ID, 舰ID集: new Set(舰ID) })
  })
}
