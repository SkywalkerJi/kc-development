import type { Locale, MsgKey } from '../types'
import { zhHans } from './zh-Hans'
import { zhHant } from './zh-Hant'
import { ja } from './ja'
import { en } from './en'

export const MESSAGES: Record<Locale, Record<MsgKey, string>> = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  en,
}
