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
// 先解析出 BCP 47 主语言子标签（2-3 个 ASCII 字母，后面必须紧跟结束，或
// 紧跟 '-' + 至少一个字母/数字开头的后续内容——单独一个尾随连字符，如
// 'en-'，不构成"后面还有子标签"，不能算合法），再基于这个解析结果分支，
// 不能反过来对整条标签做 `startsWith` 前缀匹配：'ja'/'zh' 只是很多合法
// 三字母语言码的前缀而已——'jam'（Jamaican Creole）会被 `startsWith('ja')`
// 命中误判成日文，'zha'（壮语）会被 `startsWith('zh')` 命中误判成简体中文，
// 两者都是真实存在的 ISO 639-3 代码，不是构造出来的边界情况。
//
// 只做语法校验，不做语义（真实语言注册表）校验：不检查解析出的主语言子
// 标签是否在某张语言名单里。语法合法但查无此语言（如 'xx'、'qqq' 这类
// 不存在的代码）会被判成「识别到了」归入英文，而不是继续找下一个标签——
// 这是有意的：本函数的职责是「像不像一个语言标签」，不是对着 ISO 639 表
// 逐条核实，后者需要联网或打包一份语言注册表，成本与收益不成比例；对着
// 不存在的语言码归成英文，后果远比把 ar-SA/hi-IN 这类真实语言误判成简体
// 中文轻。
const PRIMARY_SUBTAG = /^([a-z]{2,3})(?:-[a-z0-9].*)?$/

export function detectLocale(tags: readonly string[]): Locale {
  for (const raw of tags) {
    const tag = raw.toLowerCase()
    const m = PRIMARY_SUBTAG.exec(tag)
    if (!m) continue // 语法不合法（形状不对，或像 'en-' 这样缺了尾随子标签的残标签）：跳过，继续找下一个
    const primary = m[1]
    if (primary === 'zh') {
      if (/^zh-(tw|hk|mo)\b/.test(tag) || tag.startsWith('zh-hant')) return 'zh-Hant'
      return 'zh-Hans'
    }
    if (primary === 'ja') return 'ja'
    return 'en'
  }
  return 'zh-Hans'
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}
