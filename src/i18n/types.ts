import type { zhHans } from './messages/zh-Hans'

export const LOCALES = ['zh-Hans', 'zh-Hant', 'ja', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * UI 文案的 key 集合。以 zh-Hans 那一份为真值源：其余三份用
 * `Record<MsgKey, string>` 约束，漏一条编译期就报错。
 *
 * 这里用 `import type` 引 zhHans 再取 keyof typeof —— 类型位置的引用在编译后
 * 完全擦除，不会与 messages/en.ts 反过来 import 本文件形成运行时循环依赖。
 */
export type MsgKey = keyof typeof zhHans

/** 按语言加载的游戏数据名称表，键一律是数值 ID */
export interface NameTables {
  items: Record<number, string>
  ships: Record<number, string>
  ctype: Record<number, string>
}

export const EMPTY_NAME_TABLES: NameTables = { items: {}, ships: {}, ctype: {} }
