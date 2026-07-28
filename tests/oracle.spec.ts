import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFixtures } from './helpers/loadFixtures'
import { findCompatiblePools, mergeDropRates, mergeDropRateDetails, poolAdmits } from '@/core/poolMatching'
import { selectPoolType, deriveRecipes, evaluateRecipe, canonicalSortResults } from '@/core/recipe'
import type { DevelopResult, PoolType, Resources } from '@/core/types'

interface Vectors {
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

function derive(targets: number[]): DevelopResult[] {
  const out: DevelopResult[] = []
  for (const name of fx.existPool) {
    for (let t = 1 as PoolType; t <= 3; t = (t + 1) as PoolType) {
      const base = fx.pools.find((p) => p.开发池名称 === name && p.开发池ID === t)
      if (!base) continue
      const compatible = findCompatiblePools(fx.pools, base, t)
      const rates = mergeDropRates(compatible, targets.includes(168))
      if (!poolAdmits(rates, targets)) continue
      for (const r of deriveRecipes(t, targets, fx.equipList))
        out.push(evaluateRecipe(name, t, r, rates, targets, fx.equipList))
    }
  }
  return canonicalSortResults(out)
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
      expect(selectPoolType(res)).toBe(v.poolType)

      const base = fx.pools.find((p) => p.开发池名称 === v.pool && p.开发池ID >= 0)
      expect(base).toBeDefined()

      const compatible = findCompatiblePools(fx.pools, base!, v.poolType as PoolType, res)
      compatible.sort((a, b) =>
        a.舰ID.length === b.舰ID.length
          ? Object.keys(b.出货率 ?? {}).length - Object.keys(a.出货率 ?? {}).length
          : b.舰ID.length - a.舰ID.length,
      )

      const mine: Record<string, number[]> = {}
      for (const [id, list] of mergeDropRateDetails(compatible)) mine[String(id)] = list

      const sortKeys = (o: Record<string, number[]>) =>
        Object.keys(o).map(Number).sort((a, b) => a - b).map(String)
      expect(sortKeys(mine)).toEqual(sortKeys(v.rates))
      for (const k of sortKeys(mine)) expect(mine[k]).toEqual(v.rates[k])
    },
  )
})
