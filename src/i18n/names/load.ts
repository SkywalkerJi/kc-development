import type { Locale, NameTables } from '../types'
import { fetchJson } from '@/stores/fetchJson'

/**
 * 拉取某种语言的名称表。**只负责取数与组装，不碰任何状态** —— 原子发布由
 * 调用方（setLocale）在三份都成功之后统一完成，与 start2Store.readStart2()
 * 同一套写法。
 *
 * 请求集合按语言裁剪（见设计稿 §4.2 / §4.2.1）：
 * - ja：items/ships 的产出是空对象，没必要发这两个请求；日文名回退 start2。
 * - zh-Hans：不请求 ctype，简体舰级名读 developmentStore 已加载的 ctypeMap。
 */
export async function loadNameTables(locale: Locale): Promise<NameTables> {
  const base = `${import.meta.env.BASE_URL}data/i18n/${locale}/`
  const wantItems = locale !== 'ja'
  const wantCtype = locale !== 'zh-Hans'

  const [items, ships, ctype] = await Promise.all([
    wantItems ? (fetchJson(base + 'items.json') as Promise<Record<number, string>>) : Promise.resolve({}),
    wantItems ? (fetchJson(base + 'ships.json') as Promise<Record<number, string>>) : Promise.resolve({}),
    wantCtype ? (fetchJson(base + 'ctype.json') as Promise<Record<number, string>>) : Promise.resolve({}),
  ])
  return { items, ships, ctype }
}
