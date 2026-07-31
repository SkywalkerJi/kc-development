import type { MsgKey } from '@/i18n/types'

/**
 * formatPoolDescriptor 会用到的消息 key 子集。
 *
 * 只列 core/poolDescriptor.ts 内部硬编码用到的那几个字面量，不是完整的
 * MsgKey——收窄到这个子集，DescriptorCtx.t 才能在编译期拒绝拼错的 key
 * （比如 'desc.minFule'），而不是像 `(key: string) => string` 那样，
 * 任何字符串都能通过类型检查、拼错的 key 到运行时才现形成 undefined。
 *
 * 用 `import type` 引 @/i18n/types 而不是运行时 import：core 层因此仍不
 * 依赖 i18n 模块本身（类型位置的引用编译后完全擦除），只是共享了字面量
 * 联合类型的定义处，参见 src/core/types.ts 里 MsgKey 的同一处理方式。
 */
type DescMsgKey = Extract<
  MsgKey,
  'desc.exclude' | 'desc.minFuel' | 'desc.minAmmo' | 'desc.minSteel' | 'desc.minBauxite' | 'desc.invalid'
>

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
  /**
   * 日文舰名，身份键原样保留——不能被*改写*，也不能被删掉：它是
   * shipNameIds 查不到对应 ID 时唯一的展示兜底（模糊匹配都可能找不到，
   * 见 shipNameIds 的说明），也是 shipNameIds 与 formatPoolDescriptor
   * 一一对应的位置索引来源。
   */
  shipNames: string[]
  /**
   * shipNames 逐项对应的展示用舰 ID，查不到时该项为 null。
   *
   * 【这条字段解决的问题】formatPoolDescriptor 曾经原样拼 shipNames 里的
   * 日文舰名，4 语言下全部渲染日文，是 UI 违反 i18n 规范的一处缺陷（英文
   * 界面里混着「Hiei Kai Ni(比叡改二丙,比叡改二)」这样的日文）。
   *
   * 【为什么在 init() 里查、不在展示层查】展示层（formatPoolDescriptor）
   * 是纯函数，没有 shipList 可查；要反查 舰名 → 舰ID 必须在有 shipList 的
   * init() 里做。
   *
   * 【为什何是精确匹配、不是舰ID 展开用的那条模糊匹配】developmentPool.ts
   * 里 `this.舰ID.push(...getIDs(this.舰名, false))`（exact=false）这条是
   * 舰ID 展开逻辑的一部分，语义是"这个名字所在的整条同型舰链"，返回值是
   * 一串 ID、不是"这个名字具体是哪一艘"，没法拿来做名字→译名的一一映射,
   * 而且改它就动了 tests/fixtures/vectors.json 钉住的 舰ID 计算——这两条
   * 是分开的两个问题，不能共用同一次调用的结果。这里逐个名字单独调用
   * `getIDs([name], true)`（exact=true，start2Store.ts 里精确匹配那条
   * 分支）：一次只问一个名字，命中就是这个名字的 ID，不会因为同批次里
   * 另一个名字命中而张冠李戴；是一次**额外**的调用，不修改上面那条
   * exact=false 的调用本身。
   *
   * 【为什么还可能是 null】这份 JSON 数据不保证 45 个池里每一条 舰名 都能在
   * 当前 start2.json 里精确匹配到（游戏更新、改名、数据源不同步都可能让
   * 某条查不到）——formatPoolDescriptor 在这种情况下回退渲染 shipNames
   * 原文，不是遗漏而是刻意的兜底，见该函数实现。
   *
   * 【已知限制：同名多舰只取第一个】exact=true 命中多个 ID 时，
   * developmentPool.ts 里只取 `getIDs([name], true)[0]`，不保证是"语义上
   * 更对"的那个（取决于 shipList 的迭代顺序）。真实数据里存在同名例子——
   * 「宗谷」在 start2.json 里对应三个不同 ID（645/650/699，harness 实测
   * 的 ja secretaryOptions 里能看到这三条都是独立池，用的是 舰ID 直接
   * 指定、不是 舰名 筛选）。今天没有任何池用 `舰名: ["宗谷"]` 触发这个
   * 分支，所以不是一个已确认会产出错误结果的 bug，但如果将来出现这种池，
   * 这里会静默选中三者之一，不会报错。
   */
  shipNameIds: (number | null)[]
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
  t: (key: DescMsgKey) => string
  shipName: (id: number) => string
  ctypeName: (id: number) => string
  stypeName: (code: string) => string
  /**
   * 「标签 + 值」粘接时要不要插空格：中日韩语言词间无空格是正确排版
   * （'不包含大和改二重' 正确，'不包含 大和改二重' 反而错），拉丁语言
   * 必须有空格分隔单词（'excluding Yamato' 不能写成 'excludingYamato'）。
   * 取值由调用方按当前语言注入（CJK 语言传 `() => ''`，en 传
   * `() => ' '`），core 层因此不需要认识"这是第几种语言"，只需要认识
   * "这个语言要不要空格"。
   *
   * 是函数不是字符串：这个 ctx 对象在视图层通常只构造一次（其余四个字段
   * 也都是函数引用，见调用方 DevelopmentView.vue 的 descriptorCtx），若
   * 这里存的是求值一次的字符串，语言切换后不会跟着变——同一类"求值一次
   * 就存起来"的缺陷本分支已经在别处踩过两次（RESULT_COLUMNS、
   * loadingSteps），这里用函数保持"调用时才读当前语言"。
   */
  wordSep: () => string
}

/**
 * 把结构化描述拼成显示用的一行。
 *
 * 逐段与改造前 init() 里的拼接**一一对应**（顺序、逗号分隔、`名字(ID)` 的
 * 形态、以及「查不到就整项跳过」的行为都照旧），只是把写死的中文换成了
 * 查表。全空时回退 desc.invalid，对应原来那句「过滤条件有点问题」。
 *
 * 列表分隔符统一用 `,` + wordSep()：CJK 下 wordSep() 是空串，退化成原来
 * 逐字节不变的 `,`；en 下是 `', '`，列表项之间补上英文排版要求的空格。
 */
export function formatPoolDescriptor(d: PoolDescriptor, ctx: DescriptorCtx): string {
  const parts: string[] = []
  const sep = ctx.wordSep()
  const listSep = ',' + sep

  for (const code of d.stypes) parts.push(ctx.stypeName(code))

  for (const c of d.ctypes) {
    if (typeof c === 'number') {
      const name = ctx.ctypeName(c)
      if (name) parts.push(name)
    } else {
      parts.push(c)
    }
  }

  // 逐项优先用 shipNameIds[i] 查到的译名，查不到（null，或该 ID 在名称表
  // 里也没有对应译名）就回退原始日文舰名——shipNames 与 shipNameIds 长度
  // 一一对应，由 developmentPool.ts 的 init() 保证（见 shipNameIds 字段
  // 自己的说明）。
  for (let i = 0; i < d.shipNames.length; i++) {
    const id = d.shipNameIds[i]
    const translated = id !== null ? ctx.shipName(id) : ''
    parts.push(translated || d.shipNames[i])
  }

  if (d.excludeShipIds.length) {
    const named = d.excludeShipIds
      .map((id) => ({ id, name: ctx.shipName(id) }))
      .filter((x) => x.name)
    if (named.length) parts.push(ctx.t('desc.exclude') + sep + named.map((x) => `${x.name}(${x.id})`).join(listSep))
  }

  for (const id of d.shipIds) {
    const name = ctx.shipName(id)
    if (name) parts.push(`${name}(${id})`)
  }

  if (d.minResources) {
    const keys = ['desc.minFuel', 'desc.minAmmo', 'desc.minSteel', 'desc.minBauxite'] as const
    for (let i = 0; i < 4; i++) {
      if (d.minResources[i] > 0) parts.push(ctx.t(keys[i]) + sep + d.minResources[i])
    }
  }

  return parts.length ? parts.join(listSep) : ctx.t('desc.invalid')
}
