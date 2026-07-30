import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeSameShipList, resolveShipIDs } from '../sameShipList'

/**
 * 这份测试直接吃 public/data/start2.json 的真实数据，锁定的是
 * 「同型舰改造链的展开结果与参考实现一致」。
 *
 * 为什么要单独锁：改造链只通过开发池的 `舰ID` **间接**影响出货率与公式，
 * 而实测表明这条间接路径对链的变化极不敏感 —— 曾经出现过改造链整体断裂
 * （链数 310 → 666）、23 个开发池的 `舰ID` 与参考实现不同，而 753 组对拍
 * 依然全绿的情况。所以链本身必须有自己的、直接的断言，不能指望对拍兜住。
 *
 * 下面的期望值来自参考实现在同一份数据上的产出。
 */

const START2 = join(__dirname, '..', '..', '..', 'public', 'data', 'start2.json')

interface RawShip { api_id: number; api_name: string; api_aftershipid?: number | string }

function loadChainShips(): Record<number, { id: number; name: string; afterid: number }> {
  const json = JSON.parse(readFileSync(START2, 'utf8')) as { api_mst_ship: RawShip[] }
  const out: Record<number, { id: number; name: string; afterid: number }> = {}
  for (const s of json.api_mst_ship)
    out[s.api_id] = {
      id: s.api_id, name: s.api_name, afterid: Number(s.api_aftershipid ?? 0),
    }
  return out
}

describe('同型舰改造链', () => {
  const ships = loadChainShips()
  const { sameShipList, allSameShipList } = computeSameShipList(ships)

  it('数据里的 api_aftershipid 确实是字符串 —— 这条断言是上面那个 bug 的成因锁', () => {
    const json = JSON.parse(readFileSync(START2, 'utf8')) as { api_mst_ship: RawShip[] }
    const withField = json.api_mst_ship.filter((s) => s.api_aftershipid !== undefined)
    expect(withField.length).toBe(800)
    // 全部是字符串。若哪天数据换成数字，这条会红 —— 那是好事，说明可以
    // 考虑简化解析；但在那之前，任何直接把它当数字用的代码都是错的。
    expect(withField.every((s) => typeof s.api_aftershipid === 'string')).toBe(true)
  })

  it('链数与覆盖舰数与参考实现一致', () => {
    expect(sameShipList.length).toBe(310)
    expect(Object.keys(allSameShipList).length).toBe(800)
  })

  it('链长分布与参考实现一致（没有退化成大量单舰链）', () => {
    const dist: Record<number, number> = {}
    for (const c of sameShipList) dist[c.ids.length] = (dist[c.ids.length] ?? 0) + 1
    expect(dist).toEqual({ 2: 173, 3: 102, 4: 29, 5: 4, 6: 2 })
    // 长度为 1 的链一个都不该有：每艘玩家舰至少有一次改造。
    // 链断裂时这里会冒出 500 多条单舰链。
    expect(dist[1]).toBeUndefined()
  })

  it('普通改造链：睦月(1) → 睦月改(254) → 睦月改二(434)', () => {
    expect(allSameShipList[1].ids).toEqual([1, 254, 434])
    expect(allSameShipList[254].ids).toBe(allSameShipList[1].ids) // 同链共享同一数组
  })

  it('改造环从环内最大 id 起展开 —— 这一条区分了两种链算法', () => {
    // 数据里存在一个三舰环：645 → 650 → 699 → 645（三者都叫「宗谷」）。
    // 参考实现取环内最大 id（699）作为起点；按 id 升序增量合并的写法会得到
    // [645,650,699]，与参考实现不同。
    const cycle = allSameShipList[645]
    expect(cycle.ids).toEqual([699, 645, 650])
    expect(allSameShipList[650].ids).toBe(cycle.ids)
    expect(allSameShipList[699].ids).toBe(cycle.ids)
  })

  it('resolveShipIDs 取「从命中舰到链尾」，不含它之前的形态', () => {
    expect(resolveShipIDs(['睦月'], ships, allSameShipList)).toEqual([1, 254, 434])
    expect(resolveShipIDs(['睦月改'], ships, allSameShipList)).toEqual([254, 434])
    expect(resolveShipIDs(['睦月改二'], ships, allSameShipList)).toEqual([434])
    // 环内舰同理：命中 645，链是 [699,645,650]，故只取 645 之后的一段
    expect(resolveShipIDs(['宗谷'], ships, allSameShipList)).toEqual([645, 650])
  })

  it('任意一个名字查不到就立即返回已收集的部分结果', () => {
    const onMissing: string[] = []
    const got = resolveShipIDs(
      ['睦月', '并不存在的舰', '如月'], ships, allSameShipList, (n) => onMissing.push(n),
    )
    expect(got).toEqual([1, 254, 434]) // 「如月」没有被收集
    expect(onMissing).toEqual(['并不存在的舰'])
  })

  it('开发池实际引用的舰名，展开结果与参考实现一致', () => {
    // 抽取几个此前因链断裂而算错的池所引用的舰名，锁定它们的展开结果。
    expect(resolveShipIDs(['Littorio'], ships, allSameShipList)).toEqual([441, 446])
    expect(resolveShipIDs(['Roma'], ships, allSameShipList)).toEqual([442, 447])
    expect(resolveShipIDs(['Zara'], ships, allSameShipList)).toEqual([448, 358, 496])
    expect(resolveShipIDs(['蒼龍'], ships, allSameShipList)).toEqual([90, 279, 197])
    expect(resolveShipIDs(['飛龍'], ships, allSameShipList)).toEqual([91, 280, 196])
  })
})
