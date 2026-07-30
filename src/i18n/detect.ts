import { LOCALES, type Locale } from './types'

/**
 * 由 BCP 47 语言标签列表推断使用哪种语言。
 *
 * 入参是 `readonly string[]` 而不是直接读 `navigator.languages`：这样它是个
 * 纯函数，测试不需要伪造 navigator，调用方（i18n/index.ts）负责取值。
 *
 * 判定规则：
 * - `zh-TW` / `zh-HK` / `zh-MO` / `zh-Hant*` → 繁体
 * - 其余 `zh*`（含 `zh-CN`、`zh-SG`、`zh-Hans*`，以及**不带地区的裸 `zh`**）→ 简体
 * - `ja*` → 日文
 * - 其他任何可识别标签 → 英文
 *
 * 裸 `zh` 归简体是有意的默认：不带地区的 `zh` 在现实中绝大多数来自简体环境。
 * 逐个标签往后找而不是只看第一个 —— 用户把英文排在母语前面是常见配置。
 */
export function detectLocale(tags: readonly string[]): Locale {
  for (const raw of tags) {
    const tag = raw.toLowerCase()
    if (tag.startsWith('zh')) {
      if (/^zh-(tw|hk|mo)\b/.test(tag) || tag.startsWith('zh-hant')) return 'zh-Hant'
      return 'zh-Hans'
    }
    if (tag.startsWith('ja')) return 'ja'
    // 只有形如 xx / xx-YY 的合法标签才算「识别到了」，避免 'xx-YY' 这类
    // 无意义标签抢先命中兜底分支、把后面真正可用的标签挡在外面
    if (/^[a-z]{2,3}(-|$)/.test(tag) && KNOWN_PREFIXES.has(tag.slice(0, 2))) return 'en'
  }
  return 'zh-Hans'
}

/** 明确当作「英文用户」处理的语言前缀。不在表内的标签继续往后找。 */
const KNOWN_PREFIXES = new Set([
  'en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'nl', 'ko', 'th', 'vi', 'id', 'pl', 'tr', 'uk',
])

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}
