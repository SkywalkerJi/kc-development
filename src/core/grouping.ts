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
