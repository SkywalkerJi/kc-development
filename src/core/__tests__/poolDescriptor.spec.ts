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
})
