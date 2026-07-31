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
    // 语法校验，不是语义（真实语言）校验：只要求「2-3 个 ASCII 字母，后面
    // 跟 '-' 或结束」这个 BCP 47 主语言子标签的形状，不检查它是否在某张
    // 语言名单里。
    //
    // 这里原先是 `... && KNOWN_PREFIXES.has(tag.slice(0, 2))`——一份仅 15
    // 个前缀的白名单，凡是不在表内的标签（哪怕是完全合法、常见的语言，如
    // ar-SA、hi-IN、he-IL、sv-SE、cs-CZ，以及三字母的 fil-PH——`tag.slice(0,
    // 2)` 对三字母代码取的还是错的两位）都会跌出循环、落到最后 `return
    // 'zh-Hans'` 这行，把说这些语言的用户全部错判成简体中文用户。设计稿
    // §6 的规则是「其他任何标签 → 英文」——「任何」，不是「白名单里的那几
    // 个」；zh-Hans 只该是空列表 / 全部不合法时的最后兜底，不该是「合法但
    // 没被本仓库特意列出来」的默认去处。
    //
    // 语法合法但查无此语言（如 'xx'、'qqq' 这类不存在的代码）也会被这条
    // 判成「识别到了」归入英文，而不是继续找下一个标签——这同样是有意的：
    // 本函数的职责是「像不像一个语言标签」，不是对着 ISO 639 表逐条核实，
    // 后者需要联网或打包一份语言注册表，成本与收益不成比例；对着不存在的
    // 语言码归成英文，后果远比把 ar-SA/hi-IN 这类真实语言误判成简体中文轻。
    if (/^[a-z]{2,3}(-|$)/.test(tag)) return 'en'
  }
  return 'zh-Hans'
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}
