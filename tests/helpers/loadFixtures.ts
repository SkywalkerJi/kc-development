import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPools, type DevelopmentPoolClass } from '@/core/developmentPool'
import type { DevelopmentPoolData } from '@/core/types'

const ROOT = join(__dirname, '..', '..')
const DATA = join(ROOT, 'public', 'data')

const read = (f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8'))

export interface Fixtures {
  pools: DevelopmentPoolClass[]
  existPool: string[]
  equipList: Record<number, { id: number; broken: number[]; types: number[] }>
  shipList: Record<number, { name: string; stype: number; ctype: number }>
}

export function loadFixtures(): Fixtures {
  const start2 = read('start2.json')
  const ctypeMap: Record<string, string> = read('ctype.json')

  const shipList: Fixtures['shipList'] = {}
  for (const s of start2.api_mst_ship)
    shipList[s.api_id] = { name: s.api_name, stype: s.api_stype, ctype: s.api_ctype }

  const equipList: Fixtures['equipList'] = {}
  for (const e of start2.api_mst_slotitem)
    equipList[e.api_id] = { id: e.api_id, broken: [...e.api_broken], types: [...e.api_type] }

  // 同型舰链。**必须照抄 start2Store.ts:161-225 的增量合并算法**，
  // 不要自己写「沿 afterid 走到底」的朴素版本 —— 数据里存在改造环
  // （宗谷 645 → 650 → 699 → 645），朴素版本对环的展开结果与生产代码不同。
  // 该算法已实测与参考实现产出相同的表（800 舰覆盖一致，33 个开发池舰名逐个一致）。
  interface Chain { ids: number[]; next: number }
  const tmp: Record<number, Chain> = {}
  const sortedShips = [...start2.api_mst_ship].sort(
    (a: { api_id: number }, b: { api_id: number }) => a.api_id - b.api_id,
  )
  for (const s of sortedShips) {
    const id: number = s.api_id
    if (id > 1500) continue    // 照抄生产代码：是 > 1500 不是 >= 1500
    const afterid = Number(s.api_aftershipid ?? 0)
    let found = false
    for (const ev of Object.values(tmp)) {
      if (ev.next !== id) continue
      ev.ids.push(id)
      ev.next = afterid
      found = true
      const nx = tmp[afterid]
      if (nx && nx !== ev) {
        ev.ids.push(...nx.ids)
        ev.next = nx.next
        delete tmp[afterid]
      }
      break
    }
    if (!found) {
      const fresh: Chain = { ids: [id], next: afterid }
      tmp[id] = fresh
      const nx = tmp[afterid]
      if (nx && nx !== fresh) {
        fresh.ids.push(...nx.ids)
        fresh.next = nx.next
        delete tmp[afterid]
      }
    }
  }
  const chainOf: Record<number, number[]> = {}
  for (const c of Object.values(tmp))
    for (const id of c.ids) if (!chainOf[id]) chainOf[id] = c.ids

  // 取「从命中舰开始到链尾」，不含它之前的形态
  const getIDs = (names: string[]): number[] => {
    const out: number[] = []
    for (const n of names) {
      const hit = start2.api_mst_ship.find((s: { api_name: string }) => s.api_name === n)
      if (!hit) return out
      const chain = chainOf[hit.api_id]
      if (!chain) continue
      let started = false
      for (const x of chain) {
        if (x === hit.api_id) { out.push(x); started = true }
        else if (started) out.push(x)
      }
    }
    return out
  }

  const raw: DevelopmentPoolData[] = read('DevelopmentPool.json')
  const pools = createPools(raw)
  const existPool: string[] = []
  for (const p of pools) {
    p.init(ctypeMap, getIDs, shipList)
    if (!existPool.includes(p.开发池名称) && p.开发池ID >= 0 && !p.最低资源)
      existPool.push(p.开发池名称)
  }

  return { pools, existPool, equipList, shipList }
}
