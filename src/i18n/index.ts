import { ref, shallowRef, computed } from 'vue'
import { EMPTY_NAME_TABLES, type Locale, type MsgKey, type NameTables } from './types'
import { MESSAGES } from './messages'
import { detectLocale, isLocale } from './detect'
import { loadNameTables } from './names/load'
import { POOL_NAMES } from './names/poolNames'
import { STYPE_NAMES } from './names/stypeNames'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { ShipType } from '@/core/types'

const STORAGE_KEY = 'kc-development.locale'

const localeRef = ref<Locale>('zh-Hans')
// shallowRef：名称表是加载后只读、整体替换的大对象（约 900 个键），
// 套深层代理只会让每次查表多过一层 Proxy 陷阱。整体替换照样触发更新。
const tables = shallowRef<NameTables>(EMPTY_NAME_TABLES)
const pending = ref(false)

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
 * 舰级名。zh-Hans 走既有的 ctypeMap（public/data/ctype.json 本身就是简体
 * 舰级名表），其余语言走加载进来的 ctype 表 —— 分叉的理由见设计稿 §4.2.1，
 * 核心是不为同一份数据造第二个真值源。查不到返回空串，调用方跳过不显示，
 * 与 DevelopmentPoolClass.init() 原有的 `if (ctypeMap[...])` 行为一致。
 */
export function ctypeName(id: number): string {
  if (localeRef.value === 'zh-Hans') return useDevelopmentStore().ctypeMap[String(id)] ?? ''
  return tables.value.ctype[id] ?? ''
}

/** 开发池名。入参是中文原名（身份键）。 */
export function poolName(zhHansName: string): string {
  return POOL_NAMES[zhHansName]?.[localeRef.value] ?? zhHansName
}

/**
 * 舰种名。入参是 DevelopmentPool.json 里的代码（'DD'/'CL'…）。
 * ja 不查手写表，从 api_mst_stype 取：ShipType 枚举的序数就是游戏的 stype 值，
 * 拿它去 api_mst_stype 里找同 id 的记录，api_name 即日文舰种名。
 */
export function stypeName(code: string): string {
  if (localeRef.value === 'ja') {
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
 * 切换语言。**原子发布**：名称表三份（按语言可能少于三份）全部取到之后，才
 * 一起写状态；任何一份失败就整体不切换，返回 false，界面停在当前语言。
 *
 * 半成品状态在这里是可观测的用户可见错误 —— 「装备名换成了英文、舰名还是
 * 日文」比「切换失败」更糟。同 start2Store.readStart2() 的原子发布思路。
 */
export async function setLocale(next: Locale): Promise<boolean> {
  if (next === localeRef.value || pending.value) return next === localeRef.value
  pending.value = true
  try {
    const loaded = await loadNameTables(next)
    tables.value = loaded
    localeRef.value = next
    document.documentElement.lang = next
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 隐私模式下 setItem 会抛，不该因此切换失败 */ }
    return true
  } catch (e) {
    console.error('切换语言失败，保持当前语言:', e)
    return false
  } finally {
    pending.value = false
  }
}

/** 应用启动时调用一次：localStorage 优先，否则按浏览器语言探测。 */
export async function initLocale(): Promise<void> {
  let stored: string | null = null
  try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* 同上 */ }
  // isLocale 守卫：localStorage 是用户可手改的，非法值不能直接当 Locale 用
  const want = isLocale(stored) ? stored : detectLocale(navigator.languages ?? [navigator.language])
  document.documentElement.lang = want
  if (want !== localeRef.value) await setLocale(want)
}

/** 仅供测试重置模块级状态。生产代码不要调用。 */
export function __resetI18nForTest(): void {
  localeRef.value = 'zh-Hans'
  tables.value = EMPTY_NAME_TABLES
  pending.value = false
}
