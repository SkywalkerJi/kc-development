/**
 * 开发池的筛选条件描述。
 *
 * 从 DevelopmentPoolClass 里拆出来的原因：那边原本在 init() 里就把描述拼成
 * 一整个字符串存进 private text，**在数据加载那一刻就烤死成一种语言**，
 * 而这份描述里混了舰种代码、舰级名、舰名、最低资源标签，每一项都要翻译。
 * 现在 init() 只产出结构（下面这个类型），拼句子交给展示层的纯函数。
 */
export interface PoolDescriptor {
  /** 舰种代码，如 ['DD','CL'] */
  stypes: string[]
  /** 数字 ctype ID，或非数字 舰型 的原始字符串 */
  ctypes: (number | string)[]
  /** 日文舰名，身份键原样保留 */
  shipNames: string[]
  excludeShipIds: number[]
  /**
   * 原始（未展开）的 舰ID —— 与改造前 init() 里 text 构建阶段读到的值相同：
   * 那段代码在**四段展开逻辑之前**就跑完了，读到的是 JSON 里的 舰ID 原文，
   * 不是舰种/舰型/舰名展开出来的全量列表（那份展开结果单独存在
   * DevelopmentPoolClass.舰ID 上，供池匹配使用，两者用途不同不要混淆）。
   */
  shipIds: number[]
  /** 长度 4：油弹钢铝 */
  minResources?: number[]
}

/** 名称查询以参数注入，而不是 import i18n —— core 层保持无状态、可直接单测。 */
export interface DescriptorCtx {
  t: (key: string) => string
  shipName: (id: number) => string
  ctypeName: (id: number) => string
  stypeName: (code: string) => string
}

/**
 * 把结构化描述拼成显示用的一行。
 *
 * 逐段与改造前 init() 里的拼接**一一对应**（顺序、逗号分隔、`名字(ID)` 的
 * 形态、以及「查不到就整项跳过」的行为都照旧），只是把写死的中文换成了
 * 查表。全空时回退 desc.invalid，对应原来那句「过滤条件有点问题」。
 */
export function formatPoolDescriptor(d: PoolDescriptor, ctx: DescriptorCtx): string {
  const parts: string[] = []

  for (const code of d.stypes) parts.push(ctx.stypeName(code))

  for (const c of d.ctypes) {
    if (typeof c === 'number') {
      const name = ctx.ctypeName(c)
      if (name) parts.push(name)
    } else {
      parts.push(c)
    }
  }

  for (const n of d.shipNames) parts.push(n)

  if (d.excludeShipIds.length) {
    const named = d.excludeShipIds
      .map((id) => ({ id, name: ctx.shipName(id) }))
      .filter((x) => x.name)
    if (named.length) parts.push(ctx.t('desc.exclude') + named.map((x) => `${x.name}(${x.id})`).join(','))
  }

  for (const id of d.shipIds) {
    const name = ctx.shipName(id)
    if (name) parts.push(`${name}(${id})`)
  }

  if (d.minResources) {
    const keys = ['desc.minFuel', 'desc.minAmmo', 'desc.minSteel', 'desc.minBauxite']
    for (let i = 0; i < 4; i++) {
      if (d.minResources[i] > 0) parts.push(ctx.t(keys[i]) + d.minResources[i])
    }
  }

  return parts.length ? parts.join(',') : ctx.t('desc.invalid')
}
