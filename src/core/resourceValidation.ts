/**
 * 参考实现用 int.TryParse 解析资源输入：非整数（含小数、空值）一律解析失败，
 * 此时既不更新缓存值、也不触发重算，字段保留上一个合法值。这里复刻同样的语义。
 */

/**
 * 失焦时的单项资源校验：非整数回退到上一个合法值；整数夹到 [10, 300] 区间。
 */
export function validateResourceValue(value: number, lastValid: number): number {
  if (!Number.isInteger(value)) return lastValid
  if (value < 10) return 10
  if (value > 300) return 300
  return value
}

export interface ResourceChangeResult {
  /**
   * 非 null 时表示本轮存在非整数项，需要把 resources 整体替换为此值（已回退）；
   * 调用方应只在此时重新赋值 resources，并直接返回、不重算。
   */
  revertedResources: number[] | null
  /** 校验通过时推进到当前值；发生回退时保持不变，避免用未确认的输入污染基准。 */
  lastValid: number[]
  /** 本轮是否应该继续跑重算。 */
  recompute: boolean
}

/**
 * `watch(resources, ...)` 是 deep 的、且直接进算法；而 v-model.number 每次按键
 * 都会把当前输入（哪怕是小数）写入 resources，早于 @blur 触发的整数校验。
 * 若不在重算之前先做整数判断，小数会在被 validateResourceValue 纠正之前，
 * 先触发一次用小数算出的错误重算（复现：[10,10,10,10.5] 会被判成铝池，
 * 而全部资源保持整数 10 时应停留在油钢池）。
 *
 * 因此把「这一轮该不该重算」做成显式返回值：只要有任意一项不是整数，
 * 就整体回退到上一个合法值、且本轮不重算——回退这一步本身会再触发一次
 * watch，用纠正后的整数值重算；全部合法时才推进 lastValid 并允许重算。
 */
export function applyResourceChange(
  current: readonly number[],
  lastValid: readonly number[],
): ResourceChangeResult {
  let changed = false
  const next = current.slice()
  for (let i = 0; i < next.length; i++) {
    if (!Number.isInteger(next[i])) {
      next[i] = lastValid[i]
      changed = true
    }
  }
  if (changed) {
    return { revertedResources: next, lastValid: lastValid.slice(), recompute: false }
  }
  return { revertedResources: null, lastValid: next.slice(), recompute: true }
}
