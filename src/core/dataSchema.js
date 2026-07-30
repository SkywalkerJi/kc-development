/**
 * 三份正式数据（start2.json / ctype.json / DevelopmentPool.json）的结构校验器。
 *
 * 刻意写成纯 JS（配一份手写的 dataSchema.d.ts 提供类型）而不是 .ts：
 * `scripts/sync-data.mjs` 用 `node` 直接执行、不经过任何构建步骤，只有纯 JS
 * 能被它原样 import；同时 src/stores/*.ts 也需要同一份逻辑，靠旁边的
 * dataSchema.d.ts 提供类型信息，两边 import 的是同一个文件、同一套判断，
 * 不是两份各自维护、容易漂移的实现。
 *
 * 只做结构/类型校验，不做任何业务语义之外的加工：校验通过后返回
 * `{ ok: true, errors: [] }`，调用方仍然基于原始 json 自己解析/构造；
 * 不通过则返回 `{ ok: false, errors: string[] }`，errors 是可读的诊断信息，
 * 不截断（由调用方决定展示多少条）。
 *
 * 覆盖边界（写在这里，三个 validate* 函数各自的注释只补充各自的细节）：
 * - 结构性错误：顶层不是对象/数组、必需字段缺失、字段类型不对
 * - 记录级错误：ID 缺失/不是正整数/重复、必需字段缺失或类型不对、
 *   定长数组的长度或元素类型不对
 * - 不做的事：不校验数值的业务含义是否"合理"（比如舰船速度是否在游戏
 *   平衡范围内）、不做跨字段的语义校验（比如 afterid 指向的舰船是否存在）——
 *   这些不是"结构畸形输入"，属于另一类问题，超出这个校验器的职责。
 */

const NUMERIC_EQUIP_FIELDS = [
  'api_houg', 'api_souk', 'api_raig', 'api_baku', 'api_tyku', 'api_tais',
  'api_houm', 'api_houk', 'api_saku', 'api_leng', 'api_rare', 'api_luck',
]

const VALID_POOL_IDS = new Set([-2, -1, 1, 2, 3])

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPositiveInteger(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

function isNumericArrayOfLength(v, len) {
  return Array.isArray(v) && v.length === len && v.every(isFiniteNumber)
}

/**
 * 校验 start2.json 的整体结构。
 *
 * 覆盖的畸形输入类别：
 * 1. 顶层不是对象（null / 数组 / 字符串 / 数字等）
 * 2. 必需的顶层数组/对象字段缺失或类型不对：
 *    api_mst_ship、api_mst_slotitem（须为数组，且不能是空数组——
 *    字段存在但空数组会让后续处理悄悄产出空表，必须在这里拦下来，
 *    不能指望"处理后判断是否非空"这种事后检查）；api_mst_stype、
 *    api_mst_equip_ship（须为数组，允许为空——它们只是打孔装备计算的
 *    辅助数据，为空只是让打孔装备图标算不出来，不是致命错误）；
 *    api_mst_equip_exslot_ship（须为对象，允许为空）
 * 3. 舰船记录（api_mst_ship 的每一项）：
 *    - api_id 缺失、不是正整数、或与其他记录重复
 *    - api_name、api_yomi 缺失或不是字符串（api_yomi 允许空字符串——
 *      正式数据里大量舰船的 api_yomi 本来就是空串，不能当成错误）
 *    - api_stype、api_ctype、api_soku 缺失或不是有限数值
 *    - api_aftershipid：可选字段，缺失不算错误；如果存在，必须是
 *      非负整数或纯数字组成的字符串（正式数据里这个字段就是数字字符串，
 *      比如 "254"——按数字要求会把正式数据全部判为不合法，是 schema
 *      写过严了，这里如实按正式数据的实际形状放宽）
 *    - id < 1500（玩家舰）时，api_fuel_max、api_bull_max 必须是有限数值——
 *      这两个字段只对玩家舰船有意义，敌方舰船（id >= 1500）不要求
 * 4. 装备记录（api_mst_slotitem 的每一项）：
 *    - api_id 缺失、不是正整数、或重复
 *    - api_name 缺失或不是字符串
 *    - 12 个数值属性字段（火力/装甲/雷装/爆装/对空/对潜/命中/回避/索敌/
 *      射程/稀有度/运）缺失或不是有限数值
 *    - api_type 不是数组、长度不是 5、或含非数值元素
 *    - api_broken 不是数组、长度不是 4、或含非数值元素
 *    - api_distance、api_cost：可选，存在时必须是有限数值
 * 5. api_mst_stype 的每一项：api_id 缺失/不是数值，api_equip_type 缺失/不是对象
 * 6. api_mst_equip_ship 的每一项：api_ship_id 缺失/不是数值，
 *    api_equip_type 缺失/不是数组
 * 7. api_mst_equip_exslot_ship 的每个值：必须是对象且 api_req_level 是有限数值
 *
 * 边界：不做的事——不校验 stype/ctype 的取值是否在已知舰种范围内、
 * 不校验装备属性数值是否为非负数（有些参考实现里可能存在负值修正项，
 * 不应被这里当成畸形数据拒绝）。
 */
export function validateStart2Payload(json) {
  if (!isPlainObject(json)) {
    return { ok: false, errors: ['顶层数据不是对象'] }
  }

  const errors = []

  if (!Array.isArray(json.api_mst_ship)) errors.push('api_mst_ship 缺失或不是数组')
  if (!Array.isArray(json.api_mst_slotitem)) errors.push('api_mst_slotitem 缺失或不是数组')
  if (!Array.isArray(json.api_mst_stype)) errors.push('api_mst_stype 缺失或不是数组')
  if (!Array.isArray(json.api_mst_equip_ship)) errors.push('api_mst_equip_ship 缺失或不是数组')
  if (!isPlainObject(json.api_mst_equip_exslot_ship)) errors.push('api_mst_equip_exslot_ship 缺失或不是对象')

  // 顶层容器形状都不对时不再往下逐条校验记录——避免对着根本不是数组/对象
  // 的字段做 .forEach/Object.entries 抛出无关的二次错误，把真正的顶层
  // 结构错误淹没在一堆派生错误里。
  if (errors.length > 0) return { ok: false, errors }

  if (json.api_mst_ship.length === 0) errors.push('api_mst_ship 为空数组')
  if (json.api_mst_slotitem.length === 0) errors.push('api_mst_slotitem 为空数组')

  const seenShipIds = new Set()
  json.api_mst_ship.forEach((item, idx) => {
    const label = `api_mst_ship[${idx}]`
    if (!isPlainObject(item)) { errors.push(`${label} 不是对象`); return }

    const id = item.api_id
    if (!isPositiveInteger(id)) {
      errors.push(`${label} 缺少合法的 api_id（须为正整数，实际为 ${JSON.stringify(id)}）`)
    } else if (seenShipIds.has(id)) {
      errors.push(`${label} api_id=${id} 与其他记录重复`)
    } else {
      seenShipIds.add(id)
    }

    const tag = isPositiveInteger(id) ? `api_id=${id}` : label
    if (typeof item.api_name !== 'string') errors.push(`${tag} 缺少 api_name`)
    if (typeof item.api_yomi !== 'string') errors.push(`${tag} 缺少 api_yomi`)
    if (!isFiniteNumber(item.api_stype)) errors.push(`${tag} 缺少 api_stype`)
    if (!isFiniteNumber(item.api_ctype)) errors.push(`${tag} 缺少 api_ctype`)
    if (!isFiniteNumber(item.api_soku)) errors.push(`${tag} 缺少 api_soku`)

    // api_aftershipid：正式数据里玩家舰一律是**数字字符串**（如 "254"），
    // 深海舰（id >= 1500）根本没有这个字段。消费方会把它转成数字用作改造链的
    // 指针，所以这里要保证「转得出一个安全的整数」，而不只是「形状像数字」：
    //   - 玩家舰必须有这个字段。缺了会被静默转成 0，表现为改造链在那里断掉，
    //     而不是报错 —— 参考实现在这种输入上是直接失败的。
    //   - 数字串长度不限的话，400 位数字也能通过 /^\d+$/，转换后变成 Infinity。
    //     所以要把转换结果夹在 32 位有符号整数范围内（参考实现用的就是 int）。
    const a = item.api_aftershipid
    if (a === undefined) {
      if (isPositiveInteger(id) && id < 1500)
        errors.push(`${tag} 是玩家舰船但缺少 api_aftershipid`)
    } else {
      const shaped =
        (typeof a === 'number' && Number.isInteger(a)) ||
        (typeof a === 'string' && /^\d+$/.test(a))
      const n = shaped ? Number(a) : NaN
      if (!shaped || !Number.isInteger(n) || n < 0 || n > 2147483647)
        errors.push(
          `${tag} api_aftershipid 不合法（须为 0..2147483647 的整数，或其纯数字字符串形式）`,
        )
    }

    if (isPositiveInteger(id) && id < 1500) {
      if (!isFiniteNumber(item.api_fuel_max)) errors.push(`${tag} 是玩家舰船但缺少 api_fuel_max`)
      if (!isFiniteNumber(item.api_bull_max)) errors.push(`${tag} 是玩家舰船但缺少 api_bull_max`)
    }
  })

  const seenEquipIds = new Set()
  json.api_mst_slotitem.forEach((item, idx) => {
    const label = `api_mst_slotitem[${idx}]`
    if (!isPlainObject(item)) { errors.push(`${label} 不是对象`); return }

    const id = item.api_id
    if (!isPositiveInteger(id)) {
      errors.push(`${label} 缺少合法的 api_id（须为正整数，实际为 ${JSON.stringify(id)}）`)
    } else if (seenEquipIds.has(id)) {
      errors.push(`${label} api_id=${id} 与其他记录重复`)
    } else {
      seenEquipIds.add(id)
    }

    const tag = isPositiveInteger(id) ? `api_id=${id}` : label
    if (typeof item.api_name !== 'string') errors.push(`${tag} 缺少 api_name`)
    for (const f of NUMERIC_EQUIP_FIELDS) {
      if (!isFiniteNumber(item[f])) errors.push(`${tag} 缺少 ${f}`)
    }
    if (!isNumericArrayOfLength(item.api_type, 5)) errors.push(`${tag} api_type 必须是长度为 5 的数值数组`)
    if (!isNumericArrayOfLength(item.api_broken, 4)) errors.push(`${tag} api_broken 必须是长度为 4 的数值数组`)
    if (item.api_distance !== undefined && !isFiniteNumber(item.api_distance)) errors.push(`${tag} api_distance 类型不对`)
    if (item.api_cost !== undefined && !isFiniteNumber(item.api_cost)) errors.push(`${tag} api_cost 类型不对`)
  })

  json.api_mst_stype.forEach((item, idx) => {
    const label = `api_mst_stype[${idx}]`
    if (!isPlainObject(item)) { errors.push(`${label} 不是对象`); return }
    if (!isFiniteNumber(item.api_id)) errors.push(`${label} 缺少 api_id`)
    if (!isPlainObject(item.api_equip_type)) errors.push(`${label} 缺少 api_equip_type`)
  })

  json.api_mst_equip_ship.forEach((item, idx) => {
    const label = `api_mst_equip_ship[${idx}]`
    if (!isPlainObject(item)) { errors.push(`${label} 不是对象`); return }
    if (!isFiniteNumber(item.api_ship_id)) errors.push(`${label} 缺少 api_ship_id`)
    if (!Array.isArray(item.api_equip_type)) errors.push(`${label} api_equip_type 必须是数组`)
  })

  for (const [key, value] of Object.entries(json.api_mst_equip_exslot_ship)) {
    if (!isPlainObject(value) || !isFiniteNumber(value.api_req_level)) {
      errors.push(`api_mst_equip_exslot_ship["${key}"] 缺少合法的 api_req_level`)
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

/**
 * 校验 ctype.json：`{ "舰型ID字符串": "舰型中文名", ... }` 的扁平映射表。
 *
 * 覆盖的畸形输入类别：
 * - 顶层不是对象（null / 数组 / 原始类型）
 * - 顶层对象为空——空表会让所有 舰型 名称查找失效，且是 P1-3 实测复现的
 *   具体场景之一，必须拒绝，不能被当成"success"缓存下来
 * - 键不是纯数字组成的字符串
 * - 值缺失、不是字符串、或是空字符串
 *
 * 边界：不校验键是否覆盖了 start2 里出现的所有 舰型 ID——ctype 表允许比
 * 实际用到的舰型更全或更窄，这不是"畸形"，是两份数据各自维护节奏不同步
 * 的正常状态，不属于结构校验的职责。
 */
export function validateCtypeMap(json) {
  if (!isPlainObject(json)) {
    return { ok: false, errors: ['顶层数据不是对象'] }
  }

  const errors = []
  const entries = Object.entries(json)
  if (entries.length === 0) errors.push('ctype 数据为空对象')

  for (const [key, value] of entries) {
    if (!/^\d+$/.test(key)) errors.push(`键 "${key}" 不是纯数字组成的字符串`)
    if (typeof value !== 'string' || value === '') errors.push(`键 "${key}" 对应的值必须是非空字符串`)
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}

/**
 * 校验 DevelopmentPool.json：开发池定义的数组。
 *
 * `validEquipIds` 可选：传入 start2 里出现过的合法装备 ID 集合（`Set<number>`）
 * 时，会额外校验每个池子 出货率 里引用的装备 ID 是否真的存在于 start2；
 * 不传（`undefined`/`null`）时跳过这项跨文件校验——运行时的 developmentStore
 * 会传（此时 start2 已经就绪，equipList 可用），sync-data.mjs 在 start2 自身
 * 校验失败、拿不到可信的装备 ID 集合时会跳过这项检查，避免报出大量派生噪音
 * 掩盖 start2 本身的问题。
 *
 * 覆盖的畸形输入类别：
 * 1. 顶层不是数组，或是空数组——空池数组是 P1-3 实测复现的具体场景，
 *    会被旧代码当成"加载成功"并永久缓存一个空池表，必须拒绝
 * 2. 每条记录（`DevelopmentPool=[{}]` 这类"有记录但字段全空"是这里要拦的
 *    典型例子，不是唯一例子）：
 *    - 开发池名称 缺失、不是字符串、或是空字符串
 *    - 开发池ID 不在 {-2,-1,1,2,3} 这个已知取值集合内
 *    - (开发池名称, 开发池ID) 这个组合与另一条记录重复——正式数据里同名池
 *      在不同 开发池ID 下重复出现是常态（比如同一段描述对应铝池和弹池两条
 *      记录），不能按"名称重复"拒绝；但同一个 (名称, ID) 组合出现两次
 *      基本只可能是复制粘贴漏改的错误
 *    - 出货率 缺失、不是对象、或是空对象——空 出货率 会让这个池子在任何
 *      资源组合下都算不出任何配方，形同虚设
 *    - 出货率 的键不是纯数字字符串，或值不是有限数值
 *    - 传入 validEquipIds 时，出货率 引用的装备 ID 必须存在于该集合
 *    - 舰种/舰型/舰名：存在时必须是字符串数组
 *    - 舰ID/不包含舰ID：存在时必须是数值数组
 *    - 最低资源：存在时必须是长度为 4、且全部 >= 0 的数值数组
 *
 * 边界：不校验 出货率 数值的正负号业务含义（正式数据里存在负值，语义由
 * core 层的配方算法解释，不是这里的职责）；不校验 舰种/舰型/舰名 引用的
 * 名称是否真实存在——那需要跨 start2/ctype 才能确认，且现有 sync-data.mjs
 * 本来也不做这项检查，不在本次任务范围内新增。
 */
export function validateDevelopmentPools(pools, validEquipIds) {
  if (!Array.isArray(pools)) {
    return { ok: false, errors: ['开发池数据不是数组'] }
  }
  if (pools.length === 0) {
    return { ok: false, errors: ['开发池数据为空数组'] }
  }

  const errors = []
  const seenKeys = new Set()

  pools.forEach((p, idx) => {
    const label = `开发池[${idx}]`
    if (!isPlainObject(p)) { errors.push(`${label} 不是对象`); return }

    const name = p.开发池名称
    const hasValidName = typeof name === 'string' && name !== ''
    const tag = hasValidName ? name : label
    if (!hasValidName) errors.push(`${label} 缺少 开发池名称（或为空字符串）`)

    if (!VALID_POOL_IDS.has(p.开发池ID)) {
      errors.push(`${tag}: 开发池ID ${JSON.stringify(p.开发池ID)} 不在 {-2,-1,1,2,3} 内`)
    }

    const key = `${JSON.stringify(name)}#${JSON.stringify(p.开发池ID)}`
    if (seenKeys.has(key)) errors.push(`${tag}: 与另一条记录的 (开发池名称, 开发池ID) 组合重复`)
    seenKeys.add(key)

    if (!isPlainObject(p.出货率) || Object.keys(p.出货率).length === 0) {
      errors.push(`${tag}: 缺少 出货率 或 出货率 为空对象`)
    } else {
      for (const [k, v] of Object.entries(p.出货率)) {
        if (!/^\d+$/.test(k)) errors.push(`${tag}: 出货率 的键 "${k}" 不是纯数字字符串`)
        if (!isFiniteNumber(v)) errors.push(`${tag}: 出货率["${k}"] 不是有限数值`)
        if (validEquipIds && !validEquipIds.has(Number(k))) {
          errors.push(`${tag}: 装备 ${k} 不存在于 start2`)
        }
      }
    }

    for (const f of ['舰种', '舰型', '舰名']) {
      if (p[f] !== undefined && (!Array.isArray(p[f]) || p[f].some((v) => typeof v !== 'string'))) {
        errors.push(`${tag}: ${f} 必须是字符串数组`)
      }
    }
    for (const f of ['舰ID', '不包含舰ID']) {
      if (p[f] !== undefined && (!Array.isArray(p[f]) || p[f].some((v) => !isFiniteNumber(v)))) {
        errors.push(`${tag}: ${f} 必须是数值数组`)
      }
    }
    if (p.最低资源 !== undefined) {
      if (!isNumericArrayOfLength(p.最低资源, 4) || p.最低资源.some((v) => v < 0)) {
        errors.push(`${tag}: 最低资源 必须是长度为 4 的非负数值数组`)
      }
    }
  })

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors }
}
