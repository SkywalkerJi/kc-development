/** 装备在结果面板里的分组 */
export type EquipGroup = 'replaced' | 'insufficient' | 'target' | 'other'

/**
 * 装备分组。
 * 刻意复刻参考实现的判断顺序：总出货率为 0 优先于一切，
 * 其次是资源是否足够，最后才看是不是目标装备。
 */
export function classifyEquip(total: number, affordable: boolean, isTarget: boolean): EquipGroup {
  if (total === 0) return 'replaced'
  if (!affordable) return 'insufficient'
  return isTarget ? 'target' : 'other'
}

/** 按 types[2] → types[3] → id 排序，与参考实现的装备列表顺序一致。 */
export function sortEquipIds(
  ids: number[],
  equipList: Record<number, { types: number[] }>,
): number[] {
  return [...ids].sort((a, b) => {
    const ea = equipList[a]
    const eb = equipList[b]
    if (!ea && !eb) return a - b
    if (!ea) return 1
    if (!eb) return -1
    if (ea.types[2] !== eb.types[2]) return ea.types[2] - eb.types[2]
    if (ea.types[3] !== eb.types[3]) return ea.types[3] - eb.types[3]
    return a - b
  })
}

/**
 * 格式化出货率明细，如 [6, -2] → "6%-2%"。
 * 刻意复刻参考实现：按原始顺序逐项输出，首项与非正项不加 "+"，
 * **不跳过 0、不重排正负**。
 */
export function formatRateDetail(rates: number[], suffix: string): string {
  let out = ''
  for (let i = 0; i < rates.length; i++) {
    out += i <= 0 || rates[i] <= 0 ? `${rates[i]}${suffix}` : `+${rates[i]}${suffix}`
  }
  return out
}

/** 四项资源是否都达到该装备的开发门槛（broken × 10）。 */
export function isAffordable(resources: readonly number[], broken: number[]): boolean {
  for (let i = 0; i < 4; i++) if (resources[i] < broken[i] * 10) return false
  return true
}

/** 一组装备 id 的出货率之和；id 不在 rateMap 中按 0 处理。 */
export function sumGroupRate(ids: number[], rateMap: Record<number, number>): number {
  return ids.reduce((sum, id) => sum + (rateMap[id] ?? 0), 0)
}

/** 分组结果，附带各组是否应显示（供模板直接读取，避免重复遍历/重复求和）。 */
export interface GroupedEquipments<T> {
  target: T[]
  other: T[]
  insufficient: T[]
  replaced: T[]
  targetTotal: number
  otherTotal: number
  insufficientTotal: number
  showTarget: boolean
  showOther: boolean
  showInsufficient: boolean
  showReplaced: boolean
}

/**
 * 对装备分组，并按参考实现的显示规则算出四组是否应显示：
 * 前三组（目标/其它/资源不足）按「组总出货率 > 0」判定；
 * 「全部被替换」组按数量判定，不能和前三组统一成总率——
 * 该组每个成员的 total 都恒为 0（见 classifyEquip），组总率恒为 0，
 * 用总率判断会让这一组永远不显示，这与参考实现按数量判定的做法不符。
 *
 * ⚠️ 「总率恒为 0」只对**组头**成立，不要外推到成员行的出货率列：
 * 该列展示的是逐池明细（formatRateDetail 的输出），本组的典型形态是
 * 2%-2%、4%-2%-2% 这种正负相抵的叠加过程，不是 0%。参考实现在分组之前
 * 就为每一件装备算好了这个串，本组的行同样带着它。
 */
export function groupEquipmentsWithVisibility<T extends { id: number; broken: number[] }>(
  ids: number[],
  equipList: Record<number, T>,
  rateMap: Record<number, number>,
  resources: readonly number[],
  targetIds: ReadonlySet<number>,
): GroupedEquipments<T> {
  const groups = { replaced: [] as T[], insufficient: [] as T[], target: [] as T[], other: [] as T[] }
  for (const id of ids) {
    const equip = equipList[id]
    if (!equip) continue
    const g = classifyEquip(rateMap[id] ?? 0, isAffordable(resources, equip.broken), targetIds.has(id))
    groups[g].push(equip)
  }

  const targetTotal = sumGroupRate(groups.target.map((e) => e.id), rateMap)
  const otherTotal = sumGroupRate(groups.other.map((e) => e.id), rateMap)
  const insufficientTotal = sumGroupRate(groups.insufficient.map((e) => e.id), rateMap)

  return {
    ...groups,
    targetTotal, otherTotal, insufficientTotal,
    showTarget: targetTotal > 0,
    showOther: otherTotal > 0,
    showInsufficient: insufficientTotal > 0,
    showReplaced: groups.replaced.length > 0,
  }
}
