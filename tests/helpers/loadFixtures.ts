import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPools, type DevelopmentPoolClass } from '@/core/developmentPool'
import { computeSameShipList, resolveShipIDs } from '@/core/sameShipList'
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

  // 同型舰链与按舰名反查，都直接 import 生产代码用的那一份
  // （src/core/sameShipList.ts）。
  //
  // 此前这里手抄了一份、生产那边另有一份，于是「753 组对拍全绿」实际只
  // 约束了**手抄的这一份** —— 生产那份写错了也测不出来。这不是假设：
  // 生产曾把 api_aftershipid（数据里是字符串）直接当数字用，改造链断裂、
  // 23 个开发池的 舰ID 与参考实现不同，而对拍依然全绿，正是因为这里的
  // 手抄件恰好做了字符串转换。共用同一份实现由结构消除这类漏检。
  //
  // ⚠️ 不要为了「让夹具独立」再抄一份回来。夹具与生产共用实现是有意的：
  // 对拍要验证的是生产会跑的那段代码。
  const chainShips: Record<number, { id: number; name: string; afterid: number }> = {}
  for (const s of start2.api_mst_ship)
    chainShips[s.api_id] = {
      id: s.api_id, name: s.api_name, afterid: Number(s.api_aftershipid ?? 0),
    }
  const { allSameShipList } = computeSameShipList(chainShips)
  const getIDs = (names: string[]): number[] =>
    resolveShipIDs(names, chainShips, allSameShipList)

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
