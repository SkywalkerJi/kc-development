import { ref, shallowRef, computed } from 'vue'
import { EMPTY_NAME_TABLES, type Locale, type MsgKey, type NameTables } from './types'
import { MESSAGES } from './messages'
import { detectLocale, isLocale } from './detect'
import { loadNameTables } from './names/load'
import { POOL_NAMES } from './names/poolNames'
import { STYPE_NAMES, JA_STYPE_OVERRIDES } from './names/stypeNames'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { ShipType } from '@/core/types'

const STORAGE_KEY = 'kc-development.locale'

const localeRef = ref<Locale>('zh-Hans')
// shallowRef：名称表是加载后只读、整体替换的大对象（约 900 个键），
// 套深层代理只会让每次查表多过一层 Proxy 陷阱。整体替换照样触发更新。
const tables = shallowRef<NameTables>(EMPTY_NAME_TABLES)
const pending = ref(false)
/**
 * `localeRef` 的初值 'zh-Hans' 和"当前语言的名称表已经加载过"是两件不同的
 * 事——冷启动那一刻前者天然成立、后者天然不成立。早期实现只看前者（
 * `setLocale` 的短路条件是 `next === localeRef.value`），后果是浏览器语言
 * 恰好探测成 zh-Hans（包括探测不出、兜底成 zh-Hans 的情况）的用户，
 * `initLocale` 里 `want === localeRef.value` 恒成立，`setLocale` 从未被
 * 真正调用过，`tables` 停留在 `EMPTY_NAME_TABLES` 一整个会话——即便
 * `public/data/i18n/zh-Hans/items.json` 就在磁盘上，装备名也会全部显示成
 * 日文原名。`loaded` 单独记录这件事，`setLocale` 的短路必须同时看两者。
 */
const loaded = ref(false)
/**
 * 进行中的切换请求：记录目标语言，以及那次真正执行加载的 promise。解决的
 * 是并发调用 setLocale 时"返回值必须诚实"这件事：
 * 1. 同目标的并发调用（比如语言选择器被手快点了两下）应该等同一次加载、
 *    拿到同一个结果，而不是后来者因为撞见 `pending` 就直接返回 false——
 *    那样会出现"其实切换成功了，界面却提示切换失败"的假报告（Task 4 的
 *    switcher 直接用返回值取反当失败标志）。
 * 2. 不同目标的并发调用：不支持"切换途中改主意"，后来者直接判失败，
 *    保证任意时刻至多一次真正在跑的加载，不产生"两次加载谁先回来谁生效"
 *    的竞态。
 */
let inflight: { target: Locale; promise: Promise<boolean> } | null = null

export const currentLocale = computed(() => localeRef.value)
export const localePending = computed(() => pending.value)

/** UI 文案。key 是字面量联合类型，拼错编译期就报错。 */
export function t(key: MsgKey): string {
  return MESSAGES[localeRef.value][key]
}

/*
 * 下面几个名称查询函数在函数体内调 useXxxStore()，而不是在模块顶层 —— 模块
 * 加载时 pinia 还没创建。渲染期读 tables/localeRef 这两个响应式源，所以模板里
 * 直接调用即可获得响应性，语言一换依赖它们的渲染会自动重跑。
 *
 * 回退一律到**日文原名**，不回退其他语言、不显示 key 占位符：一个没翻译的
 * 装备显示成日文原名是可用的，显示成空白或 `items.123` 不是。
 */

export function equipName(id: number): string {
  return tables.value.items[id] ?? useStart2Store().equipList[id]?.name ?? ''
}

export function shipName(id: number): string {
  return tables.value.ships[id] ?? useStart2Store().shipList[id]?.name ?? ''
}

/**
 * 舰级名。**这里不适用上面"回退日文原名"那条通用规则**：equipList/shipList
 * 的每条记录自带 `.name`（游戏原始日文名），有现成的日文源可以兜底；但
 * ctypeMap／加载进来的 ctype 表只是"舰级 ID → 译名"的映射，运行时不存在
 * 与之配对的日文舰级名来源可查。sync-i18n 生成 ctype 表时，查不到译名的
 * 条目已经直接填成了日文原文（见 scripts/sync-i18n.mjs），所以 zh-Hant/en
 * 两张表本身是自洽、已经"兜过底"的——这里的 `?? ''` 只会在 ID 连 KC3 数据
 * 里都不存在时才触发。
 *
 * zh-Hans 走既有的 ctypeMap（public/data/ctype.json 本身就是简体舰级名表），
 * 其余语言走加载进来的 ctype 表 —— 分叉的理由见设计稿 §4.2.1，核心是不为
 * 同一份数据造第二个真值源。
 *
 * 查不到（ID 在 KC3 数据里根本不存在）时返回空串，调用方跳过不显示，与
 * DevelopmentPoolClass.init() 原有的 `if (ctypeMap[...])` 行为一致。
 */
export function ctypeName(id: number): string {
  if (localeRef.value === 'zh-Hans') return useDevelopmentStore().ctypeMap[String(id)] ?? ''
  return tables.value.ctype[id] ?? ''
}

/**
 * 开发池名。入参是中文原名（身份键）。
 *
 * 未命中（POOL_NAMES 里没有这个键）时回退的是**入参本身**（zh-Hans 原名），
 * 不是上面那条"回退日文原名"的通用规则——这里刻意不同：POOL_NAMES 是
 * 46 条封闭集合，由 poolNames.spec.ts 钉住"键与 zh-Hans 一列恒等、四语言
 * 全部命中"，未命中在正常运行下不会发生，回退值选什么都不影响真实用户，
 * 选身份键本身只是让这种理论上不该发生的情况仍然显示点有意义的文字。
 */
export function poolName(zhHansName: string): string {
  return POOL_NAMES[zhHansName]?.[localeRef.value] ?? zhHansName
}

/**
 * 舰种名。入参是 DevelopmentPool.json 里的代码（'DD'/'CL'…）。
 * ja 不查手写表，从 api_mst_stype 取：ShipType 枚举的序数就是游戏的 stype 值，
 * 拿它去 api_mst_stype 里找同 id 的记录，api_name 即日文舰种名——但先查
 * JA_STYPE_OVERRIDES：FBB 是唯一的例外，游戏数据本身把 stype 8（FBB）和
 * 9（BB）都记成「戦艦」，直接派生会让 ja 是四语言里唯一分不清两者的一个
 * （详见 names/stypeNames.ts 里 JA_STYPE_OVERRIDES 的注释）。这条覆盖必须
 * 在 api_mst_stype 查找**之前**做：FBB 在数据里本来就查得到「戦艦」，放在
 * 查找之后覆盖永远不会被走到。
 *
 * 未命中（代码不在 STYPE_NAMES/ja 分支两处都查不到，或 ja 分支下
 * api_mst_stype 还没加载）时回退的同样是**入参本身**（原始代码，如
 * 'DD'），不是"回退日文原名"那条通用规则——STYPE_NAMES 是 20 个代码的
 * 封闭集合，由 DevelopmentPool.json 里出现的舰种代码钉死，未命中在正常
 * 运行下同样不该发生，回退成原始代码只是让这种情况仍然可读、可定位到是
 * 哪个代码出了问题，而不是显示空白。
 */
export function stypeName(code: string): string {
  if (localeRef.value === 'ja') {
    const override = JA_STYPE_OVERRIDES[code]
    if (override) return override
    const stype = ShipType[code as keyof typeof ShipType]
    if (typeof stype === 'number') {
      const hit = useStart2Store().api_mst_stype.find((s) => s.api_id === stype)
      if (hit?.api_name) return hit.api_name
    }
    return code
  }
  return STYPE_NAMES[code]?.[localeRef.value] ?? code
}

/**
 * 实际执行一次切换：加载、原子发布（`tables` 必须先于 `localeRef` 写，见
 * `setLocale` 顶部注释）、写 `<html lang>`、写 `document.title`、按需写
 * localStorage。从 `setLocale` 拆出来是因为并发控制（见上面 `inflight` 的
 * 注释）需要在"要不要发起一次新加载"和"加载本身"之间插一层：`setLocale`
 * 只负责判断前者，判断完之后就把剩下的活全部委托给这个函数，自己不重复
 * 实现一遍。
 *
 * `document.title` 跟 `<html lang>` 写在同一处、同一时机：两者都是"语言
 * 变了就要跟着变"的**文档级**副作用，没有模板负责渲染它们，与其为一行赋值
 * 单起一个 watch(currentLocale) 增加一条响应式依赖链，不如直接放在这个已经
 * 是"语言切换成功"这个事件的唯一出口里——`localeRef.value = next` 已经在
 * 上一行执行，`t()` 读到的就是切换后的语言。
 *
 * `persist` 控制要不要写 localStorage：见 `setLocale` 与 `initLocale` 对它
 * 的说明——冷启动的探测结果不写，只有用户真正做出的选择才写。
 */
async function doSwitch(next: Locale, persist: boolean): Promise<boolean> {
  try {
    const loadedTables = await loadNameTables(next)
    tables.value = loadedTables
    localeRef.value = next
    loaded.value = true
    document.documentElement.lang = next
    document.title = t('title.app')
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 隐私模式下 setItem 会抛，不该因此切换失败 */ }
    }
    return true
  } catch (e) {
    console.error('切换语言失败，保持当前语言:', e)
    return false
  }
}

/**
 * 切换语言。**原子发布**：名称表三份（按语言可能少于三份）全部取到之后，才
 * 一起写状态；任何一份失败就整体不切换，返回 false，界面停在当前语言。
 *
 * 半成品状态在这里是可观测的用户可见错误 —— 「装备名换成了英文、舰名还是
 * 日文」比「切换失败」更糟。同 start2Store.readStart2() 的原子发布思路。
 *
 * 两层短路，顺序不能换：
 * 1. 有同目标的请求正在跑 —— 复用它的结果，不重复发请求，也不让并发调用
 *    互相踩返回值（见上面 `inflight` 的注释）。目标不同的并发请求直接判
 *    失败，不支持"切换途中改主意"。
 * 2. 目标语言与当前语言相同、且它的名称表**已经**加载过 —— 这才是真正的
 *    空操作。只看"语言相同"不看"表加载过没有"，会漏掉冷启动这一刻——
 *    `localeRef` 的初值本来就是 zh-Hans，但那一刻从未真正加载过任何表
 *    （见上面 `loaded` 的注释）。
 *
 * `persist` 默认 true：调用方绝大多数是用户在 LocaleSwitcher 里做出的真实
 * 选择，理应记住。唯一传 false 的调用方是 `initLocale`——见它的注释：
 * 冷启动时"探测/沿用上次选择"不等于"用户现在选择了这个语言"，不该把探测
 * 结果重新写回 localStorage。
 */
export async function setLocale(next: Locale, persist = true): Promise<boolean> {
  if (inflight) return inflight.target === next ? inflight.promise : false
  if (next === localeRef.value && loaded.value) return true

  pending.value = true
  const promise = doSwitch(next, persist).finally(() => {
    inflight = null
    pending.value = false
  })
  inflight = { target: next, promise }
  return promise
}

/**
 * 应用启动时调用一次：localStorage 优先，否则按浏览器语言探测。
 *
 * 这里调用 `setLocale` 时传 `persist: false`——不管 `want` 是读到的存量
 * localStorage 值还是探测出来的新值，这次调用都不是"用户刚刚做出的选择"，
 * 不该触发写入：
 * - `want` 来自 localStorage：值本来就在那，重写一遍是空操作，但没有理由
 *   让"启动时读一次配置"这件事看起来像"这次写了一次配置"。
 * - `want` 来自探测：这才是真正要避免的情况——反过来看，若这里保持
 *   `persist: true`（旧行为），一个从未手动选过语言、浏览器语言是
 *   `ja` 的首次访问用户，会在什么都没点的情况下把 `kc-development.locale
 *   = ja` 写进 localStorage；此后即便他把浏览器语言改回别的语言，
 *   `initLocale` 读到的 localStorage 优先于探测，应用会一直卡在 `ja`，
 *   探测结果从此再也不会生效。localStorage 应该记的是"用户选过什么"，
 *   不是"上次探测到什么"——见设计稿 §6 开头那句"用户可在运行时切换并被
 *   记住"，记的主语是"切换"，不是"探测"。
 */
export async function initLocale(): Promise<void> {
  let stored: string | null = null
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* 同上 */ }
  // isLocale 守卫：localStorage 是用户可手改的，非法值不能直接当 Locale 用
  const want = isLocale(stored) ? stored : detectLocale(navigator.languages ?? [navigator.language])
  // <html lang> "切换成功之后才写"这条规则由 setLocale 统一负责（见其
  // 注释、以及 doSwitch 只在成功分支写 lang 这件事）；这里不能提前把它写成
  // want —— 万一下面这次加载失败，会出现 lang 已经指向新语言、
  // localeRef/tables 还停在旧语言的半切换态，正是 setLocale 要避免的那种
  // 问题，只是这里发生在冷启动而不是用户手动切换。需要在首次加载完成前
  // 给 lang 一个值时，只能写当前（此刻仍是默认值）的 localeRef，不能写
  // 目标 want。
  document.documentElement.lang = localeRef.value
  // 冷启动时 tables 必然是空的（loaded 为 false）。哪怕 want 恰好等于默认
  // 的 zh-Hans，也必须真正跑一次 setLocale 才能把名称表加载进来——"locale
  // 没变"不能当"已经加载过"的证据。该不该真的发请求由 setLocale 内部的
  // loaded 短路处理，这里无条件调用即可，不用再判断一次 want !== localeRef。
  // persist: false —— 见本函数顶部的说明，冷启动不写 localStorage。
  await setLocale(want, false)
}

/** 仅供测试重置模块级状态。生产代码不要调用。 */
export function __resetI18nForTest(): void {
  localeRef.value = 'zh-Hans'
  tables.value = EMPTY_NAME_TABLES
  pending.value = false
  loaded.value = false
  inflight = null
}
