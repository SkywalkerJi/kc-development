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
// 上一版（Fix A）用一条自写的正则 `/^([a-z]{2,3})(?:-[a-z0-9].*)?$/` 解析
// 主语言子标签，再对解析结果分支——方向是对的（不再对整条标签做
// `startsWith` 前缀匹配），但正则本身的 `(?:-[a-z0-9].*)?` 这条"后续内容"
// 分支里那个 `.*` 不挑字符：只要求后续以一个字母/数字开头，开头之后随便
// 塞什么都能整条匹配到底——'en-US-'（结尾多一个尾随连字符）、'en-a@'
// （子标签里混进 BCP 47 不允许的 `@`）、'zh-Hant!'（结尾混进 `!`）都能让
// `.exec()` 成功且消费掉整条字符串，被当成"语法合法"处理，其中最后一个
// 还会让 `tag.startsWith('zh-hant')` 命中，把一个语法都不对的标签判成繁体。
// 手写正则要正确覆盖 BCP 47 的完整产生式（分隔子标签的字符类、每个子标签
// 的长度上限、单例子标签、私有子标签……）成本很高、还容易漏——这正是上面
// 挑的坑：只学了"先解析主语言子标签"这个方向，没有学到"正则本身必须精确
// 覆盖语法，`.*` 会悄悄吞掉本该判为非法的尾巴"。
//
// 这一版改用运行时自带的 `Intl.Locale`（ES2020 起标准内置，`tsconfig.app.json`
// 的 `lib: ["ES2020", ...]` 自动带上 `es2020.intl`，不需要额外引入类型包）
// 做语法校验：它是 BCP 47 的权威实现，比任何自写正则更准——构造函数对语法
// 不合法的输入（包括上面三个反例）一律抛 `RangeError`，不会把它们悄悄放过。
// 用它解析出的 `language`/`script`/`region` 三个字段分支，不再对标签字符串
// 本身做任何前缀匹配或子串判断，也就不再需要手写正则来兜住 BCP 47 的语法。
//
// 仍然只做语法校验，不做语义（真实语言注册表）校验：`Intl.Locale` 本身也
// 不核实 'xx'、'qqq' 这类语法合法但查无此语言的代码是否真的存在于 ISO 639——
// 它们会被正常解析、`language` 得到 'xx'/'qqq'，落进下面"其他任何可识别
// 标签 → 英文"的分支，这与上一版的既定行为一致，不是本轮修复要改变的范围。
export function detectLocale(tags: readonly string[]): Locale {
  for (const raw of tags) {
    let loc: Intl.Locale
    try {
      loc = new Intl.Locale(raw)
    } catch {
      continue // 语法不合法（Intl.Locale 构造时抛 RangeError）：跳过，继续找下一个
    }
    const { language, script, region } = loc
    if (language === 'zh') {
      if (script === 'Hant' || region === 'TW' || region === 'HK' || region === 'MO') return 'zh-Hant'
      return 'zh-Hans'
    }
    if (language === 'ja') return 'ja'
    return 'en'
  }
  return 'zh-Hans'
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v)
}
