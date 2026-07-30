import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { loadFixtures } from './helpers/loadFixtures'
import { computePoolRates, computeRecipes } from '@/core/orchestration'
import { isPoolSelectable } from '@/core/developmentPool'
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
  poolShipIds?: { name: string; poolId: number; shipIds: number[] }[]
}

const vectors: Vectors = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'vectors.json'), 'utf8'),
)
const fx = loadFixtures()
const DATA_DIR = join(__dirname, '..', 'public', 'data')

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

// 上面两个 describe 的 it.each 都是遍历 vectors.derive / vectors.change 的
// **当前长度**生成用例的——删掉向量文件里的任意一组，it.each 生成的用例数
// 会跟着减少，测试本身仍然全绿，没有任何一条断言会失败。meta.dataHashes
// 的哈希校验也只证明「public/data/ 与生成向量时读取的数据一致」，不证明
// 「vectors.json 里的 753 组内容完整、没有被增删」——这两件事互相独立。
//
// 这里补三类断言，把「向量集合完整」也变成可验证、会报警的东西：
//   1. 数量：derive.length / change.length / 总数，直接锁死「有多少组」；
//   2. 内容哈希：对 derive / change 结构整体分别做 SHA-256，锁死「组的
//      内容」——即使总数不变，只要任意一组的内容被替换/篡改，数量断言
//      测不出来，这里的哈希断言能测出来。哈希只覆盖 derive/change 本身，
//      刻意不含 meta（meta.generatedAt 每次生成都会变，纳入哈希会导致
//      重新生成向量后这条断言逢生成必红，那样这条断言就失去了意义）。
//   3. 数据基线数量：开发池 / ctype（舰型） / 池引用装备的原始条目数，
//      锁死「生成向量时依据的数据规模」，与下面的组合推导相互印证。
//
// 设计意图：这些数字不应该被自动接受。数据正常增删（比如开发池上新、
// 装备表增删）会让这里的断言变红，这是有意的——需要维护者显式把这些
// 数字改成新值，相当于人工确认「向量确实是照最新数据重新生成的，而
// 不是数据变了但忘记重新跑 oracle」。修改任何一个基线数字前，必须先用
// oracle（其 README 说明了运行方式，与本仓库并列存放）重新生成 vectors.json，
// 确认新的总数组对拍仍然全绿，再把这里的数字和向量文件一起提交。
//
// 数量推导（对应 oracle/Program.cs 的组合生成规则，行为不在本仓库内，
// 只在这里记录推导过程，方便下次核对新数字是否合理）：
//   derive = 102（单装备：池引用装备总数）
//          + 101（双装备且含 168，即 102 - 1，排除 168 与自己组合）
//          + 190（双装备两两组合：前 20 个池引用装备取 C(20,2)）
//          = 393
//   change = 45（existPool：可选中的开发池数，最低资源为空且 ID>=0）
//          × 8（oracle 固定的资源组合数）
//          = 360
//   poolShipIds = 99（DevelopmentPool.json 的池总数，逐池一条）
//   组合推导的总数 = 393 + 360 = 753；poolShipIds 是另一类向量（逐池 舰ID
//   的参考真值），不参与这个总数，单独按池数锁定。
describe('对拍：向量完整性（数量与内容锁定）', () => {
  it('derive 固定 393 组，change 固定 360 组，poolShipIds 固定 99 组', () => {
    expect(vectors.derive.length).toBe(393)
    expect(vectors.change.length).toBe(360)
    expect(vectors.poolShipIds?.length).toBe(99)
    expect(vectors.derive.length + vectors.change.length).toBe(753)
  })

  // 与上面的数量断言互补：数量不变但内容被替换/篡改时，只有这里会报警。
  // 三段都要锁 —— poolShipIds 是逐池 舰ID 的参考真值，如果只锁数量，
  // 一份「照着某个错误实现改过」的 poolShipIds 照样能全绿。
  it('derive / change / poolShipIds 的内容哈希与固化基线一致', () => {
    const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
    expect(hash(vectors.derive)).toBe(
      '98af4190c0c09da9065cb9050b7cef15fe9aa89674f680400c354d32e3aa31b7',
    )
    expect(hash(vectors.change)).toBe(
      '0425eb1f4247c7bd2f1917cd71aa824a43cb26d162f4f3e85730723fd540a710',
    )
    expect(hash(vectors.poolShipIds)).toBe(
      '152cbd073ba38ab329e8a5f378644e7c04f2e5d88684ba18cb54366a6b075cb5',
    )
  })

  it('数据基线：开发池 99 / 舰型（ctype） 136 / 池引用装备 102', () => {
    const pools: { 开发池名称: string; 开发池ID: number; 最低资源?: number[]
                    出货率?: Record<string, number> }[] =
      JSON.parse(readFileSync(join(DATA_DIR, 'DevelopmentPool.json'), 'utf8'))
    const ctypeMap: Record<string, string> = JSON.parse(
      readFileSync(join(DATA_DIR, 'ctype.json'), 'utf8'),
    )
    expect(pools.length).toBe(99)
    expect(Object.keys(ctypeMap).length).toBe(136)

    // 复刻 oracle/Program.cs 里 equipIds 的推导：所有池「出货率」引用的装备
    // ID 去重后，只保留能在 equipList（start2.json 的 api_mst_slotitem）里
    // 查到的那些——这批 ID 的数量正是 derive 的 393 里「单装备覆盖」那一段
    // （102）与「双装备两两组合」取样范围（前 20 个）的来源。
    const equipRefs = new Set<number>()
    for (const p of pools) for (const k of Object.keys(p.出货率 ?? {})) equipRefs.add(Number(k))
    const referencedEquipCount = [...equipRefs].filter((id) => id in fx.equipList).length
    expect(referencedEquipCount).toBe(102)

    // existPool（可选中开发池数）同样是 change 组数（360 = 45 × 8）的直接来源，
    // 一并锁定，避免只锁开发池总数、漏掉「可选中」这个过滤条件本身漂移的情况。
    const existPool = new Set<string>()
    for (const p of pools) if (p.开发池ID >= 0 && p.最低资源 == null) existPool.add(p.开发池名称)
    expect(existPool.size).toBe(45)
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
//
// 这个归一化是有意屏蔽展示顺序差异——只验证「结果集合内容一致」，不验证
// 「展示顺序一致」。展示顺序（sortResults）没有被这份对拍验证过：生成
// 向量的 oracle/Algorithm.cs 本身在产出结果后也没有执行参考实现的排序，
// 向量记录的顺序不是参考实现真实的展示顺序，没法拿来当展示顺序的 oracle。
// 曾诊断过 393 组 derive 向量：web 用 sortResults 得到的原始顺序与向量
// 记录的原始顺序，306 组不同——这不是「web 排序错」的证据，而是「当前
// 向量不能证明展示顺序对不对」的证据。sortResults 的比较器本身违反
// 传递性（见 src/core/recipe.ts 头部注释），即使两侧用相同比较器也不能
// 据此保证最终排列一致。
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

      // 谓词必须与生产挑基准池时完全一致 —— 少了「无最低资源门槛」这个条件，
      // 同名池里带门槛的那个排在前面时，这里会去对拍一个用户根本选不到的池。
      // 走 core 的共享谓词，不在这里重写条件。
      const base = fx.pools.find((p) => p.开发池名称 === v.pool && isPoolSelectable(p))
      expect(base).toBeDefined()

      // 正向侧对拍现在调用的是 computePoolRates——DevelopmentView.vue 的
      // refreshCurrentPool 用的是同一个函数，不再在测试里重新编排一遍算法。
      // 同上，这只保证「函数体本身算对」，不保证 View 传给它的实参是对的
      // （对拍不经过 refreshCurrentPool 那几行代码）。
      const { details: mine, totals } = computePoolRates(fx.pools, base!, res)

      const sortKeys = (o: Record<string, number[]>) =>
        Object.keys(o).map(Number).sort((a, b) => a - b).map(String)
      expect(sortKeys(mine)).toEqual(sortKeys(v.rates))
      // totals 的键集合也要与 details 完全相同 —— 只逐个校 details 里有的键，
      // totals 多出来的键不会失败。
      expect(Object.keys(totals).map(Number).sort((a, b) => a - b))
        .toEqual(sortKeys(mine).map(Number))
      for (const k of sortKeys(mine)) {
        expect(mine[Number(k)]).toEqual(v.rates[k])
        // totals 也直接对着向量明细求和校一遍。
        //
        // 曾经这里只比 details，文档据此记着一条「totals 未经对拍验证」的
        // 已知边界。那条边界的事实前提其实不成立：totals 就是 details 的
        // 求和（参考实现那边也是同一串值累加出来的），details 相等即蕴含
        // totals 相等。但**光靠这条推理不足以只改文档就收工**——把
        // computePoolRates 里的求和改成 `list.filter(v => v > 0)`，details
        // 仍逐元素相等、这一整块仍全绿，而 totals 会静默变错。
        // 所以把推理落成这行可重跑的断言，而不是留在注释里。
        expect(totals[Number(k)]).toBe(v.rates[k].reduce((a, b) => a + b, 0))
      }
    },
  )
})

// 逐池 舰ID 的直接对拍。
//
// 这一段是补给「同型舰改造链 / 舰名展开」这条路径的**直接**参考真值。此前
// 向量里没有它，改造链只能通过 舰ID → 池兼容判定 → 出货率/公式 这条间接
// 路径被间接约束，而实测表明这条路径极不敏感：曾经 23/99 个池的 舰ID 与
// 参考实现不同（生产把 api_aftershipid 这个字符串字段直接当数字用，导致
// 改造链断裂），而 753 组对拍依然全绿 —— 因为丢掉的都是改造形态，而作为
// 其父集的按舰种/舰型筛选的池本来就包含它们，超集关系没被打破。
//
// 比较是**逐元素、含重复项、含顺序**的：舰ID 里刻意保留了重复项，它参与
// 池排序（舰ID.length）与「取最窄池」的判断，去重会改变那两处的结果。
describe('对拍：逐池 舰ID', () => {
  it('向量记录了 poolShipIds，且与实际池数一一对应', () => {
    expect(vectors.poolShipIds).toBeDefined()
    expect(vectors.poolShipIds!.length).toBe(99)
    // 下面的 it.each 只遍历向量条目 —— 若实际池比向量多，多出来的尾部池
    // 不会被任何用例检查。这里把两侧数量钉在一起。
    expect(fx.pools.length).toBe(vectors.poolShipIds!.length)
  })

  it.each((vectors.poolShipIds ?? []).map((v, i) => [i, v] as const))(
    '第 %i 个池 %j',
    (i, v) => {
      const mine = fx.pools[i]
      // 顺序必须与 DevelopmentPool.json 一致 —— 先确认在比同一个池
      expect(mine.开发池名称).toBe(v.name)
      expect(mine.开发池ID).toBe(v.poolId)
      expect(mine.舰ID).toEqual(v.shipIds)
    },
  )
})
