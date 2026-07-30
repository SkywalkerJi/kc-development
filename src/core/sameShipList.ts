/**
 * 同型舰（改造链）分类。
 *
 * 这是**参考实现同名算法的忠实移植**，不是等价重写。此前 web 侧用的是一套
 * 思路完全不同的「按 id 升序增量合并」算法，虽然在当前数据的 800 艘舰里有
 * 797 艘产出相同的链，但改造环（数据里真实存在一个三舰环）的展开起点不同，
 * 且这种「两套不同算法碰巧一致」的等价关系没有任何结构性保证 —— 数据一变
 * 就可能分岔，而分岔点很难被现有测试察觉（改造链只通过 `舰ID` 间接影响
 * 输出，见 tests/oracle.spec.ts 顶部关于覆盖边界的说明）。
 *
 * 现在改成直接照搬参考实现的两段式做法：
 *   1. 先从「入度为 0」的舰（不是任何舰的 `afterid`）出发，沿 `afterid` 走链；
 *   2. 剩下的必然落在环里，对每个环取**环内最大 id** 作为起点展开。
 *
 * 生产（stores/start2Store.ts）与对拍夹具（tests/helpers/loadFixtures.ts）
 * 共用这一份 —— 此前两边各有一份手抄件，导致「对拍全绿」实际只约束了夹具
 * 那一份，生产那份写错了也测不出来（已经真的发生过一次）。
 */

/** 一条改造链。`ids` 的顺序有意义：`getIDs` 取「从命中舰到链尾」这一段。 */
export interface SameShipChain {
  /** 链头舰名。参考实现不设置这个字段，此处填上只为便于调试，不参与任何计算。 */
  name: string
  ids: number[]
  /**
   * 参考实现的 `SameShip` 带这个字段，但在本算法里没有语义（它是另一套
   * 增量合并算法的中间状态）。保留是为了兼容既有类型，恒为 0。
   */
  next: number
}

/** 本算法只需要这三个字段；`afterid` 必须已经是数字（见 start2Store 的解析注释）。 */
interface ShipLike {
  id: number
  name: string
  afterid: number
}

export interface SameShipTables {
  sameShipList: SameShipChain[]
  /** 舰 id → 它所属的那条链。同一条链被链内每个 id 共享（同一个数组引用）。 */
  allSameShipList: Record<number, SameShipChain>
}

/** 深海舰的分界：参考实现只对 id 小于该值的玩家舰做同型舰分类。 */
const PLAYER_SHIP_ID_LIMIT = 1500

export function computeSameShipList(shipList: Record<number, ShipLike>): SameShipTables {
  // 参考实现按舰船表的原始录入顺序遍历，而该表是按 id 升序录入的；这里显式
  // 排序，让「顺序依赖」变成本函数自己的契约，不依赖调用方怎么构造这个对象。
  const listA = new Map<number, ShipLike>()
  for (const id of Object.keys(shipList).map(Number).sort((a, b) => a - b))
    if (id < PLAYER_SHIP_ID_LIMIT) listA.set(id, shipList[id])

  const processed = new Set<number>()
  const chains: SameShipChain[] = []

  // 被别的舰指向的 id ——「入度非 0」，因此不能作为链头。
  const successors = new Set<number>()
  for (const ship of listA.values()) if (ship.afterid !== 0) successors.add(ship.afterid)

  const newChain = (headId: number): SameShipChain => ({
    name: listA.get(headId)?.name ?? '',
    ids: [],
    next: 0,
  })

  // 沿 afterid 走链，遇到已处理过的舰就停（链最长 6 环，递归深度无风险）。
  const walk = (current: number, chain: SameShipChain, visited: Set<number>): void => {
    if (visited.has(current) || processed.has(current)) return
    chain.ids.push(current)
    visited.add(current)
    processed.add(current)
    const ship = listA.get(current)
    if (ship && ship.afterid !== 0 && listA.has(ship.afterid))
      walk(ship.afterid, chain, visited)
  }

  // 第一段：从入度为 0 的舰出发
  for (const id of listA.keys()) {
    if (successors.has(id) || processed.has(id)) continue
    const chain = newChain(id)
    walk(id, chain, new Set())
    chains.push(chain)
  }

  // 第二段：剩下的必然在环里（有向图出度恒为 1，未被链头覆盖 ⟹ 在环上）
  const findCycle = (start: number): number[] => {
    const seen: number[] = []
    const seenSet = new Set<number>()
    let current = start
    while (current !== 0 && listA.has(current)) {
      if (seenSet.has(current)) return seen
      seen.push(current)
      seenSet.add(current)
      current = listA.get(current)!.afterid
    }
    return []
  }

  // 只走环内节点，从环内最大 id 起 —— 这一条决定了环的展开顺序，
  // 进而决定 getIDs 对环内舰返回哪一段，必须与参考实现一致。
  const walkCycle = (
    current: number, chain: SameShipChain, visited: Set<number>, cycleNodes: Set<number>,
  ): void => {
    if (visited.has(current) || !cycleNodes.has(current)) return
    chain.ids.push(current)
    visited.add(current)
    processed.add(current)
    const ship = listA.get(current)
    if (ship && ship.afterid !== 0 && listA.has(ship.afterid) && cycleNodes.has(ship.afterid))
      walkCycle(ship.afterid, chain, visited, cycleNodes)
  }

  let remaining = [...listA.keys()].filter((id) => !processed.has(id))
  while (remaining.length > 0) {
    const cycle = findCycle(remaining[0])
    // 按上面的出度论证，remaining 里的舰一定在环上，findCycle 不会返回空。
    // 但这是对数据形状的推理，不是结构性保证：参考实现在这里会**死循环**
    // （remaining 不变、while 不退出）。浏览器里挂死比抛错糟糕得多，所以
    // 这一处刻意比参考实现更严格 —— 与其它「参考实现会崩/会挂、web 提前
    // 拦下」的地方同一处置原则。
    if (cycle.length === 0)
      throw new Error(`同型舰分类失败：舰 ${remaining[0]} 既不在任何链上、也不在任何环上`)

    const head = Math.max(...cycle)
    const chain = newChain(head)
    walkCycle(head, chain, new Set(), new Set(cycle))
    chains.push(chain)
    for (const id of cycle) processed.add(id)
    remaining = [...listA.keys()].filter((id) => !processed.has(id))
  }

  // 参考实现是「首次登记者胜出」。本算法里每个 id 只会进入一条链
  // （processed 保证），所以两种写法等价，这里取与参考实现相同的形式。
  const allSameShipList: Record<number, SameShipChain> = {}
  for (const chain of chains)
    for (const id of chain.ids)
      if (!(id in allSameShipList)) allSameShipList[id] = chain

  return { sameShipList: chains, allSameShipList }
}

/**
 * 按舰名反查舰 id 集合（非精确模式）：命中舰**及其之后的全部改造形态**，
 * 不含它之前的形态。开发池的 `舰名` 筛选条件走的就是这条路径。
 *
 * 与 computeSameShipList 一样，生产与对拍夹具共用这一份。
 *
 * 刻意复刻参考实现的两处细节：
 * - 任意一个名字查不到，**立即返回已经收集到的部分结果**，不是跳过继续；
 * - 同名舰取遍历顺序里的第一个（舰船表按 id 升序，故等价于取最小 id）。
 *
 * @param onMissing 名字查不到时的回调（生产用它打日志；夹具不传）
 */
export function resolveShipIDs(
  names: string[],
  shipList: Record<number, { name: string }>,
  allSameShipList: Record<number, SameShipChain>,
  onMissing?: (name: string) => void,
): number[] {
  const out: number[] = []
  const ids = Object.keys(shipList).map(Number).sort((a, b) => a - b)

  for (const name of names) {
    const hit = ids.find((id) => shipList[id].name === name)
    if (hit === undefined) {
      onMissing?.(name)
      return out
    }
    const chain = allSameShipList[hit]
    if (!chain) continue

    let started = false
    for (const id of chain.ids) {
      if (id === hit) {
        out.push(id)
        started = true
      } else if (started) {
        out.push(id)
      }
    }
  }
  return out
}
