/**
 * 参考实现用 int.TryParse 解析资源输入：非整数（含小数、空值）一律解析失败，
 * 此时既不更新缓存值、也不触发重算，字段保留上一个合法值。这里复刻同样的语义。
 *
 * `Number.isInteger` 不能是唯一防线：它检查的是「拿到手的值是不是整数」，而
 * `v-model.number` 早在这之前就已经用 `parseFloat` 把原始输入转换过一遍——
 * `"100.0"`、`"1e2"` 会被转成整数 100（isInteger 通过，但用户输入的原本不是
 * 整数形式）；`"0x64"` 被转成 0；`"100abc"` 被静默截断成 100。这一层完全看不到
 * 原始字符串，自然拦不住这些形式。因此非法形式必须在**输入阶段**（拿到原始
 * 字符串的那一刻）就被吃掉，见下面的 `sanitizeResourceInput`；`Number.isInteger`
 * 只作为这之后的第二层防御（防的是绕过输入框直接写 resources 的情况）。
 */

/**
 * 从源头限制资源输入为纯数字：剥离所有非数字字符（`\D`：小数点、`e`、十六进制的
 * `x`、字母、正负号、全角数字等等，只要不是 ASCII 0-9 一律吃掉）。
 *
 * 用在文本输入框的 `@input` 上，配合 `type="text" inputmode="numeric"`（放弃
 * `type="number"` + `v-model.number`，那条链路的转换发生在拿到值之前，已经
 * 来不及拦截）。这样非法形式在用户输入的当下就被剥离，不会以任何形态进入
 * 后续的 resources 数组——不是「解析失败回退」，而是「根本打不出这些字符」。
 *
 * 边界：这是纯字符级过滤，不做数值语义判断。超长数字串（比如粘贴 20 位数字）
 * 会被完整保留、转换为一个精度可能失真的超大整数——失焦时的 `validateResourceValue`
 * 会把它夹回 [10,300]，但夹紧之前如果触发了一次重算，喂给算法的会是这个超大值。
 * 这与「资源合法上限是 300」这条业务约束的强制时机有关（现状：失焦才夹紧，
 * 输入过程中不夹紧，参见下面 `applyResourceChange` 的注释），本次改动不改变
 * 这个既有时机，只补「非数字字符」这一类缺口。
 */
export function sanitizeResourceInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * 把 `sanitizeResourceInput` 清洗后的字符串转换为送入算法的数值。
 * 空字符串（用户清空了整个输入框，或原始输入全是被剥离掉的非数字字符，
 * 比如纯空格）视为「暂无有效整数输入」，返回 NaN——交给 `applyResourceChange`
 * 走非整数回退分支，而不是静默当成 0。
 */
export function parseResourceInput(sanitized: string): number {
  return sanitized === '' ? NaN : Number(sanitized)
}

/**
 * 决定一次 `@input` 事件的原始文本，最终应该被当成「用户实际打出来的文本」
 * 来处理——同时驱动"该往输入框里显示什么"和"该往 resources 里写什么数值"
 * 这两件事，两者由同一次判断产出，不会互相脱节。
 *
 * `sanitizeResourceInput` 是**剥离**语义：逐字符输入时这没问题——非法字符
 * （比如 "."）在按下的当下就被吃掉，用户根本打不出来，剥离结果自然等于
 * "打这个字符之前"的文本。但如果一次 `@input` 事件里，原始文本（`raw`）本身
 * 就非空、且清洗后与原文本不同，说明这次输入是**一次性**混入了非法字符——
 * 典型场景是粘贴 / 拖拽 / 自动填充等一次性写入多个字符（比如粘贴 "10.5"）。
 * 这种情况不能接受剥离后的结果："10.5" 剥离成 "105" 是一个用户既没打算
 * 输入、也不会预期的"第三个数"。这里整体拒绝这次输入，返回上一个合法值——
 * 效果等价于这次输入完全没有发生（保持旧值），而不是从中提取出一个新数字。
 *
 * 空字符串（用户清空了整个输入框）不落进拒绝分支（要求 `raw` 非空）：
 * `sanitizeResourceInput('')` 本来就是 `''`，`raw === sanitized`，直接走
 * 下面的正常分支返回 `''`，交给调用方走既有的
 * `parseResourceInput('') → NaN → applyResourceChange 非整数回退`这条路径，
 * 不受这里新增的拒绝逻辑影响。
 */
export function resolveResourceInputText(raw: string, lastValidText: string): string {
  const sanitized = sanitizeResourceInput(raw)
  if (raw !== '' && raw !== sanitized) return lastValidText
  return sanitized
}

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
 * `watch(resources, ...)` 是 deep 的、且直接进算法。输入框现在先经过
 * `sanitizeResourceInput` + `parseResourceInput` 才写进 resources，正常
 * 输入路径下这里几乎不会再拿到非整数——但空输入会转成 NaN 写进来，且这个
 * 函数本身不依赖「值一定来自输入框」（resources 也可能被别处直接整体替换，
 * 比如 `selectResult` 应用配方结果），所以这道整数判断作为第二层防御继续保留，
 * 不因为输入框已经做了字符级过滤就可以去掉。
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
