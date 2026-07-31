import { describe, it, expect } from 'vitest'
import { formatPoolDescriptor, type PoolDescriptor } from '@/core/poolDescriptor'

// 注入式的名称查询：让这份测试完全不依赖 i18n 的模块级状态与 pinia
const ctx = {
  t: (k: string) => ({
    'desc.exclude': '不包含', 'desc.invalid': '过滤条件有点问题',
    'desc.minFuel': '最低油', 'desc.minAmmo': '最低弹',
    'desc.minSteel': '最低钢', 'desc.minBauxite': '最低铝',
  } as Record<string, string>)[k] ?? k,
  shipName: (id: number) => ({ 1: '睦月', 2: '如月' } as Record<number, string>)[id] ?? '',
  ctypeName: (id: number) => ({ 6: '金刚型' } as Record<number, string>)[id] ?? '',
  stypeName: (code: string) => ({ DD: '驱逐舰' } as Record<string, string>)[code] ?? code,
} as const

const empty: PoolDescriptor = {
  stypes: [], ctypes: [], shipNames: [], excludeShipIds: [], shipIds: [],
}

describe('formatPoolDescriptor', () => {
  it('各段以逗号连接，顺序为 舰种 → 舰级 → 舰名 → 不包含 → 舰ID → 最低资源', () => {
    const d: PoolDescriptor = {
      stypes: ['DD'], ctypes: [6], shipNames: ['天津風'],
      excludeShipIds: [2], shipIds: [1], minResources: [30, 0, 0, 10],
    }
    expect(formatPoolDescriptor(d, ctx)).toBe(
      '驱逐舰,金刚型,天津風,不包含如月(2),睦月(1),最低油30,最低铝10',
    )
  })

  it('全空时回退到 desc.invalid', () => {
    expect(formatPoolDescriptor(empty, ctx)).toBe('过滤条件有点问题')
  })

  it('查不到的舰ID整项跳过，与 init() 原有的 if (shipList[id]) 行为一致', () => {
    expect(formatPoolDescriptor({ ...empty, shipIds: [1, 999] }, ctx)).toBe('睦月(1)')
  })

  it('查不到的舰级整项跳过，与 init() 原有的 if (ctypeMap[...]) 行为一致', () => {
    expect(formatPoolDescriptor({ ...empty, ctypes: [6, 999] }, ctx)).toBe('金刚型')
  })

  it('非数字的 舰型 原样输出（该分支今日数据用不到，但保留）', () => {
    expect(formatPoolDescriptor({ ...empty, ctypes: ['自定义型'] }, ctx)).toBe('自定义型')
  })

  it('最低资源只输出大于 0 的项', () => {
    expect(formatPoolDescriptor({ ...empty, minResources: [0, 0, 0, 10] }, ctx)).toBe('最低铝10')
  })

  // 上一条与顶部第一条用例都只在下标 0（油）和 3（铝）填了非零值，下标 1
  // （弹）、2（钢）从未被真正跑到过——desc.minAmmo/desc.minSteel 或者
  // labels[1]/labels[2] 的键错位（比如把「弹」「钢」写反）不会让任何既有
  // 用例变红。这里把四个下标全填非零值，且用四个互不相同的数字，断言
  // 完整拼接结果，讲清楚每个下标对应哪个标签、顺序是否正确。
  it('最低资源四项全部非零时，按 油/弹/钢/铝 的下标顺序逐项输出，标签不错位', () => {
    expect(formatPoolDescriptor({ ...empty, minResources: [30, 20, 10, 5] }, ctx)).toBe(
      '最低油30,最低弹20,最低钢10,最低铝5',
    )
  })

  // 刻意的行为分歧，不是遗漏：改造前的 text 构建阶段里，「不包含」的前缀
  // 是在查 shipList 之前就无条件写入的（`this.text += '不包含'`），即使
  // 后面一个 id 都没在 shipList 里查到，那个孤零零的「不包含」也会直接
  // 粘在下一段文字前面，中间没有逗号分隔——是原实现的一个格式瑕疵。这里
  // 换成先算出 named 数组、`if (named.length)` 才 push 整段，查不到任何
  // 一个 id 时把这一段整体跳过，不留半截前缀。真实数据里的两个用到
  // 不包含舰ID 的池（大和级、水雷系-其它）都能查到对应舰名，没有触发过
  // 这条分支，所以这处分歧目前没有已知的真实影响，但既然是唯一一处「新旧
  // 行为故意不同」的地方，必须有测试钉住它，防止将来被误当 bug 改回去。
  it('不包含舰ID 全部查不到时，整段跳过（不像 init() 旧实现那样留下裸的「不包含」前缀）——刻意的行为分歧', () => {
    expect(formatPoolDescriptor({ ...empty, excludeShipIds: [999] }, ctx)).toBe('过滤条件有点问题')
  })
})
