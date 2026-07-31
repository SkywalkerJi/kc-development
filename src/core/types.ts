import type { MsgKey } from '@/i18n/types'

/** 资源四元组：油、弹、钢、铝 */
export type Resources = readonly [number, number, number, number]

/** 开发池类型：1=铝池 2=弹池 3=油钢池 */
export type PoolType = 1 | 2 | 3

/** 开发池的原始 JSON 形状 */
export interface DevelopmentPoolData {
  开发池名称: string
  开发池ID: number
  舰种?: string[]
  舰型?: string[]
  舰名?: string[]
  舰ID?: number[]
  不包含舰ID?: number[]
  最低资源?: number[]
  出货率?: Record<string, number>
}

/** 一条配方结果 */
export interface DevelopResult {
  池名: string
  池ID: PoolType
  公式: number[]
  总资源: number
  出货率: number
  失败率: number
}

/**
 * 舰种枚举。
 * 刻意复刻参考实现：序数即游戏的 stype 值，不是标准舰种表 ——
 * 第 12 位是「超弩級戦艦」、第 15 位是「敌AO」，是按 stype 序号硬对齐的。
 * 禁止按字母或直觉重新编号。
 */
export enum ShipType {
  NULL = 0, DE = 1, DD = 2, CL = 3, CLT = 4, CA = 5, CAV = 6, CVL = 7,
  FBB = 8, BB = 9, BBV = 10, CV = 11, 超弩級戦艦 = 12, SS = 13, SSV = 14,
  敌AO = 15, AV = 16, LHA = 17, CVB = 18, AR = 19, AS = 20, CT = 21, AO = 22,
}

/**
 * 池类型对应的消息 key。参考实现里越界会抛异常，此处保持同样严格。
 *
 * 返回 key 而不是文字：core 层不该产出面向用户的文案，翻译由展示层做。
 *
 * ⚠️ 它同时是「可用公式」表「池类型」列的**排序取值**（见 DevelopmentView 的
 * RESULT_COLUMNS）。改成 key 之后，那一列必须按**翻译后的文字**排序而不是按
 * key 排 —— 否则英文界面下会按 poolType.ammo / poolType.bauxite 这种内部
 * 标识符的字母序排，与用户看到的文字对不上。排序结果因此随语言变化，这是
 * 正确行为，不是 bug。
 */
export function poolTypeLabel(id: PoolType): MsgKey {
  switch (id) {
    case 1: return 'poolType.bauxite'
    case 2: return 'poolType.ammo'
    case 3: return 'poolType.fuelSteel'
    default: throw new Error(`无效的池ID: ${id}`)
  }
}
