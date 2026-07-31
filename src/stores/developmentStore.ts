import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { Api_EquipInfo } from '@/types/equipTypes'
import type { DevelopmentPoolData } from '@/core/types'
import { DevelopmentPoolClass, createPools, isPoolSelectable } from '@/core/developmentPool'
import { validateCtypeMap, validateDevelopmentPools } from '@/core/dataSchema'
import { useStart2Store } from './start2Store'
import { fetchJson } from './fetchJson'

function describeValidationFailure(fileName: string, errors: string[]): string {
  return (
    `${fileName} 数据校验失败（共 ${errors.length} 项）：\n` +
    errors.slice(0, 20).join('\n') +
    (errors.length > 20 ? `\n...另有 ${errors.length - 20} 条` : '')
  )
}

export interface FilterButtonState {
  equipInfo: Api_EquipInfo
  select: boolean
  /** 当前已选组合下这件装备是否还可能出。false 时按钮置灰。 */
  enabled: boolean
}

export const useDevelopmentStore = defineStore('development', () => {
  const start2Store = useStart2Store()

  // shallowRef 而不是 ref：池在 readCtypeAndPools 末尾整体发布之后就是只读的
  // （下面没有任何一处改动单个池对象），但 deep ref 会给 99 个池对象和它们
  // 合计三千多项的 舰ID 数组都套上代理，池匹配里每次读元素都要过一次 Proxy
  // 陷阱。唯一的写是整体替换（developmentPools.value = pools），shallowRef
  // 对此照样触发更新。
  //
  // 若将来真的需要「就地改某个池」，不要简单改回 ref —— 那会把上面这层开销
  // 加回来；应该改成替换整个数组（保持不可变更新的写法）。
  const developmentPools = shallowRef<DevelopmentPoolClass[]>([])
  const ctypeMap = ref<Record<string, string>>({})
  const existPool = ref<string[]>([])
  /**
   * 下拉框可选的池对象。由 developmentPools 派生，不是另存一份状态 ——
   * 多一份需要手工保持同步的状态，比它想消除的那点重复更容易出错。
   */
  const selectablePools = computed(() => {
    const seen = new Set<string>()
    const out: DevelopmentPoolClass[] = []
    for (const pool of developmentPools.value) {
      if (!isPoolSelectable(pool) || seen.has(pool.开发池名称)) continue
      seen.add(pool.开发池名称)
      out.push(pool)
    }
    return out
  })
  const filterButtonList = ref<Record<number, FilterButtonState>>({})

  // ctype.json 与 DevelopmentPool.json 合并成一次原子发布：两者共同决定
  // developmentPools 的 text（描述）与 existPool（下拉框选项），分开发布的话
  // 会出现"pool 用的是这次的新 ctype，但 ctypeMap.value 还没来得及更新"或者
  // 反过来的窗口期；且如果 ctype 校验通过、pool 校验失败（或反之），旧代码
  // 会把先校验通过的那一半写进 store，就着"一份新、一份旧"的不一致组合继续
  // 运行。这里改成两者都通过各自的 schema 校验、pool 也全部 init() 成功后，
  // 才在同一个赋值块里一起发布；任何一步失败，ctypeMap/developmentPools/
  // existPool 都保持调用前的状态，不会出现新旧数据交叉污染。
  async function readCtypeAndPools() {
    // fetchJson 先检查 HTTP 状态码再解析 JSON，两个端点都用它。fetchJson
    // 返回 unknown，validateCtypeMap 校验通过后转回 Record<string, string>——
    // 校验器本身已经保证了这个形状（键是数字字符串、值是非空字符串）。
    const ctypeRaw = await fetchJson(`${import.meta.env.BASE_URL}data/ctype.json`)
    const ctypeValidation = validateCtypeMap(ctypeRaw)
    if (!ctypeValidation.ok) {
      throw new Error(describeValidationFailure('ctype.json', ctypeValidation.errors))
    }
    const ctypeJson = ctypeRaw as Record<string, string>

    const rawPools = await fetchJson(`${import.meta.env.BASE_URL}data/DevelopmentPool.json`)
    // 出货率 引用的装备 ID 必须真的存在于 start2——这个跨文件校验需要
    // start2Store.equipList，_initializeData 已经保证走到这里之前 start2
    // 一定就绪（isReady），equipList 可用。
    const validEquipIds = new Set(Object.keys(start2Store.equipList).map(Number))
    const poolValidation = validateDevelopmentPools(rawPools, validEquipIds)
    if (!poolValidation.ok) {
      throw new Error(describeValidationFailure('DevelopmentPool.json', poolValidation.errors))
    }

    // 先在局部变量里把所有池跑完 init()，全部成功后才一次性发布到
    // developmentPools/existPool 这两个响应式状态。不能像之前那样先把
    // developmentPools.value 赋成刚 createPools() 出来、还没 init() 的池数组
    // 再在循环里逐个 init()——如果某一个 pool.init() 抛错（比如 shipList 里
    // 某条记录字段缺失），developmentPools.value 已经被替换成了"一部分池
    // init 完、一部分还没 init"的半成品状态，且这个状态不会随本次调用失败
    // 而回滚，会一直留在 store 里，后续任何读它的地方都可能读到不一致的池。
    // 局部变量在这里只是普通对象，函数中途抛错时局部变量直接被丢弃，
    // developmentPools.value 依然是上一次成功时的值（或初始的空数组），
    // 不会被污染。
    const pools = createPools(rawPools as DevelopmentPoolData[])
    const nextExistPool: string[] = []

    for (const pool of pools) {
      pool.init(ctypeJson, start2Store.getIDs, start2Store.shipList)
      // 准入条件走 core 里那个唯一定义的 isPoolSelectable，这里只额外做名称去重
      if (!nextExistPool.includes(pool.开发池名称) && isPoolSelectable(pool))
        nextExistPool.push(pool.开发池名称)
    }

    // 原子发布：ctype 与 pool 一起提交，不出现只更新其中一个的中间状态。
    ctypeMap.value = ctypeJson
    developmentPools.value = pools
    existPool.value = nextExistPool
  }

  /**
   * 建立装备按钮表：收录**全部**开发池（含负 ID 池、含带最低资源门槛的池）
   * 出货率里引用过、且在 start2 装备表里查得到的装备。
   *
   * ⚠️ 这里**不**排序，是有意的。`filterButtonList` 是以装备 id 为键的普通
   * 对象，JS 对整数样键一律按数值升序枚举、与写入顺序无关 —— 在这里排序
   * 是纯粹的空操作，排完写进去、读出来还是按 id 升序。此前这里确实调了一次
   * sortEquipIds，看起来像是「顺序在 store 里定好了」，实际毫无作用，界面
   * 顺序全靠 DevelopmentView 的 equipmentGroups 又排了一遍才是对的。
   *
   * 顺序的产出点唯一地放在消费方（equipmentGroups），见那里的注释。
   */
  function initFilterButtonList() {
    const ids = new Set<number>()
    for (const pool of developmentPools.value)
      for (const k of Object.keys(pool.出货率 ?? {})) ids.add(Number(k))

    const next: Record<number, FilterButtonState> = {}
    for (const id of ids) {
      const equipInfo = start2Store.equipList[id]
      if (!equipInfo) continue
      next[id] = { equipInfo, select: false, enabled: true }
    }
    filterButtonList.value = next
  }

  function toggleEquipmentSelect(equipId: number) {
    const s = filterButtonList.value[equipId]
    if (s) s.select = !s.select
  }

  function getSelectedEquipIds(): number[] {
    return Object.keys(filterButtonList.value)
      .map(Number)
      .filter((id) => filterButtonList.value[id].select)
  }

  /**
   * 由舰船反查所属开发池，取「最窄」的那个（舰ID 数量最少）。
   * 仅用于提示，不参与任何计算。
   */
  function setFlagship(shipId: number): { pool: DevelopmentPoolClass; shipInfo: unknown } | null {
    const candidates = developmentPools.value.filter(
      (p) => p.开发池ID > 0 && p.舰ID集.has(shipId),
    )
    if (!candidates.length || !start2Store.shipList[shipId]) return null
    const pool = candidates.reduce((min, cur) => (cur.舰ID.length >= min.舰ID.length ? min : cur))
    return { pool, shipInfo: start2Store.shipList[shipId] }
  }

  // 内部实现：外部一律经 initializeData 的进行中缓存调用（同 start2Store 的模式）。
  async function _initializeData() {
    // 必须先确保 start2 就绪：pool.init() 要用 shipList 把筛选条件展开成 舰ID，
    // 拿到空表就会展不开，导致后续所有出货率计算失效。这里读的是 start2Store
    // 显式维护的 isReady 标志，不能用「shipList 非空」去推断——就绪与否只由
    // isReady 显式表达，不依赖 start2Store 内部的发布顺序这类实现细节。
    // start2Store 现在是先在局部变量里解析完、最后才一次性发布（原子发布），
    // 解析失败时根本不会留下非空的 shipList；但即便某次实现改动了发布顺序、
    // 又出现类似的残留状态，这里读 isReady 而不是反推 shipList 是否非空，
    // 也不会受影响——不应该把"当前实现细节导致的现象"当成判断依据。
    //
    // 这里的判断只是一层快路径（已就绪时省一次函数调用），真正防止重复拉取/
    // 重复重建 filterButtonList 的是下面 initializeData 自身的进行中缓存——
    // 这个判断单独存在时管不住，因为它只覆盖 start2Store.initializeData()
    // 这一次调用，本函数自己接下来的 readCtypeAndPools / initFilterButtonList
    // 完全不受它保护。
    if (!start2Store.isReady) {
      await start2Store.initializeData()
    }
    await readCtypeAndPools()
    initFilterButtonList()
  }

  // 进行中去重：App.vue 同时挂载 DataInitializer 与 DevelopmentView，两者的
  // onMounted 都并发调用 developmentStore.initializeData()。没有这层缓存的话，
  // 两次调用各自完整跑一遍 _initializeData()——两次 ctype 请求、两次
  // DevelopmentPool 请求，initFilterButtonList() 跑两遍，第二遍会整体替换
  // filterButtonList，静默清空用户刚做的装备选择。
  //
  // 缓存语义：并发调用、以及成功后的重复调用，只会真正执行 _initializeData()
  // 一次（inflight 常驻）。只有失败会清空 inflight——此时下一次调用会重新跑
  // 完整的一遍（含重建 filterButtonList），这是预期的重试行为，不是 bug。
  let inflight: ReturnType<typeof _initializeData> | null = null

  async function initializeData() {
    try {
      await (inflight ??= _initializeData().catch((e) => {
        // 失败必须清空，否则一次瞬时失败会被永久缓存成不可恢复状态。
        inflight = null
        throw e
      }))
      return { success: true, error: null }
    } catch (error) {
      console.error('开发池数据加载失败:', error)
      return { success: false, error }
    }
  }

  return {
    developmentPools,
    ctypeMap,
    existPool,
    selectablePools,
    filterButtonList,
    initializeData,
    toggleEquipmentSelect,
    getSelectedEquipIds,
    setFlagship,
  }
})
