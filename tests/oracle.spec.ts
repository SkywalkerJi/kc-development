import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { loadFixtures } from './helpers/loadFixtures'
import { computePoolRates, computeRecipes } from '@/core/orchestration'
import { selectPoolType, canonicalSortResults } from '@/core/recipe'
import type { DevelopResult, PoolType, Resources } from '@/core/types'

interface Vectors {
  meta?: { generatedAt: string; dataHashes: Record<string, string> }
  derive: { targets: number[]; results: {
    poolName: string; poolId: number; recipe: number[]
    total: number; hitRate: number; failRate: number
  }[] }[]
  change: { pool: string; resources: number[]; poolType: number
            rates: Record<string, number[]> }[]
}

const vectors: Vectors = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'vectors.json'), 'utf8'),
)
const fx = loadFixtures()

// 向量文件本身不带数据哈希时，没法区分「753 组对拍全绿」到底是因为实现真的一致，
// 还是因为有人更新了 public/data/ 却忘了重新生成基准向量。meta.dataHashes 记录了
// 生成向量时读到的三份数据文件的 SHA-256，这里逐一重算 public/data/ 下的实际哈希
// 做比对——任何一个对不上，说明基准已经过期（发生了数据漂移），753 组「全绿」
// 不再是有效证据。
//
// 如实说明这条检查的边界：它只能证明「public/data/ 与生成向量时用的数据一致」，
// 不能证明「向量可以凭本仓库内容重新生成」——生成向量的工具不在本仓库内，
// 它自身的加载完整性校验也无法从这里验证（该工具目前只检查几张关键表非空，
// 并不足以证明加载过程中没有发生别的异常）。发现漂移后，必须在能访问那个
// 工具的环境里重新生成 vectors.json，再提交进来；仅靠这个仓库本身做不到。
describe('对拍：向量新鲜度（数据哈希）', () => {
  const DATA_DIR = join(__dirname, '..', 'public', 'data')

  it('vectors.json 记录了 meta.dataHashes', () => {
    expect(vectors.meta).toBeDefined()
    expect(vectors.meta?.dataHashes).toBeDefined()
  })

  const files = ['DevelopmentPool.json', 'ctype.json', 'start2.json']
  it.each(files)('%s 的实际哈希与向量记录一致', (file) => {
    const recorded = vectors.meta?.dataHashes[file]
    expect(recorded, `meta.dataHashes 里缺少 ${file} 的记录`).toBeTruthy()
    const actual = createHash('sha256')
      .update(readFileSync(join(DATA_DIR, file)))
      .digest('hex')
    expect(actual).toBe(recorded)
  })
})

// 反推侧对拍现在调用的是 computeRecipes——DevelopmentView.vue 的 refreshResults
// 用的是同一个函数，不再在测试里重新编排一遍算法。准确的说法是「对拍与生产
// 共用同一对编排函数」，而不是「对拍经过了生产入口」：本文件用 loadFixtures()
// 自建数据直接调用 computeRecipes，从不经过 DevelopmentView.vue 里
// refreshResults 那几行「取值 → 调用 → 写回 ref」的代码本身——View 把什么
// 实参传给这个函数，对拍看不到（详见 src/core/orchestration.ts 顶部的说明）。
// canonicalSortResults 只用来把两侧都归一化到确定全序以便逐条比较，
// 不影响 computeRecipes 内部已经产出的（sortResults）展示顺序。
function derive(targets: number[]): DevelopResult[] {
  return canonicalSortResults(computeRecipes(fx.pools, fx.existPool, targets, fx.equipList))
}

describe('对拍：配方反推', () => {
  it.each(vectors.derive.map((v, i) => [i, v] as const))(
    '第 %i 组 targets=%j',
    (_i, v) => {
      const mine = derive(v.targets).map((r) => ({
        poolName: r.池名, poolId: r.池ID, recipe: r.公式,
        total: r.总资源, hitRate: r.出货率, failRate: r.失败率,
      }))
      const theirs = canonicalSortResults(
        v.results.map((r) => ({
          池名: r.poolName, 池ID: r.poolId as PoolType, 公式: r.recipe,
          总资源: r.total, 出货率: r.hitRate, 失败率: r.failRate,
        })),
      ).map((r) => ({
        poolName: r.池名, poolId: r.池ID, recipe: r.公式,
        total: r.总资源, hitRate: r.出货率, failRate: r.失败率,
      }))
      expect(mine).toEqual(theirs)
    },
  )
})

describe('对拍：正向出货率', () => {
  it.each(vectors.change.map((v, i) => [i, v] as const))(
    '第 %i 组 pool=%j',
    (_i, v) => {
      const res = v.resources as unknown as Resources
      // selectPoolType 是 computePoolRates 内部用来选池类型的同一个叶函数，
      // 这里单独断言一次，确认向量记录的 poolType 与它的产出一致。
      expect(selectPoolType(res)).toBe(v.poolType)

      const base = fx.pools.find((p) => p.开发池名称 === v.pool && p.开发池ID >= 0)
      expect(base).toBeDefined()

      // 正向侧对拍现在调用的是 computePoolRates——DevelopmentView.vue 的
      // refreshCurrentPool 用的是同一个函数，不再在测试里重新编排一遍算法。
      // 同上，这只保证「函数体本身算对」，不保证 View 传给它的实参是对的
      // （对拍不经过 refreshCurrentPool 那几行代码）。
      const { details: mine } = computePoolRates(fx.pools, base!, res)

      const sortKeys = (o: Record<string, number[]>) =>
        Object.keys(o).map(Number).sort((a, b) => a - b).map(String)
      expect(sortKeys(mine)).toEqual(sortKeys(v.rates))
      for (const k of sortKeys(mine)) expect(mine[Number(k)]).toEqual(v.rates[k])
    },
  )
})
