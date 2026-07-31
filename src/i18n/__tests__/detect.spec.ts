import { describe, it, expect } from 'vitest'
import { detectLocale } from '@/i18n/detect'

describe('detectLocale', () => {
  it.each([
    [['zh-CN'], 'zh-Hans'], [['zh-SG'], 'zh-Hans'], [['zh-Hans-CN'], 'zh-Hans'], [['zh'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hant'], [['zh-HK'], 'zh-Hant'], [['zh-MO'], 'zh-Hant'], [['zh-Hant-TW'], 'zh-Hant'],
    [['ja'], 'ja'], [['ja-JP'], 'ja'],
    [['en-US'], 'en'], [['fr-FR'], 'en'], [['ko-KR'], 'en'],
    // Fix A 回归：这几个此前被 KNOWN_PREFIXES 白名单挡在外面，全部误判成了
    // zh-Hans。三字母的 fil-PH 额外验证了旧代码 `tag.slice(0, 2)` 那个
    // 「三字母代码取错两位」的子 bug——即便白名单里真的收了 'fil'，旧写法
    // 查的也是 'fi'。
    [['ar-SA'], 'en'], [['hi-IN'], 'en'], [['he-IL'], 'en'], [['sv-SE'], 'en'], [['cs-CZ'], 'en'],
    [['fil-PH'], 'en'],
    // 回归：主语言子标签解析要先做，不能用 startsWith 前缀匹配整条标签。
    // 'jam'（Jamaican Creole）、'zha'（壮语）都是真实的 ISO 639-3 三字母
    // 代码，恰好以 'ja'/'zh' 开头——旧写法会把它们分别误判成日文/简体中文。
    // 'zha' 经 Intl.Locale 规范化后会变成它的首选代码 'za'（ISO 639-3 的
    // 弃用别名规范化到首选值，Intl.Locale 内置这张表），language 依然既不是
    // 'zh' 也不是 'ja'，落到「其他」分支，判定结果不变。
    [['jam'], 'en'], [['zha'], 'en'],
    // 回归（本轮 Fix 5）：上一版正则里的 `.*` 不挑字符，这三个语法本不合法
    // 的标签都曾被当成"合法"处理——'en-US-' 结尾多一个尾随连字符、
    // 'en-a@' 子标签里混进 BCP 47 不允许的 '@'、'zh-Hant!' 结尾混进 '!'
    // （且因为 `startsWith('zh-hant')` 命中被误判成繁体）。改用
    // Intl.Locale 后三者构造时都抛 RangeError，被当成"识别不出"跳过，
    // 单独一条时经过 zh-Hans 这个兜底不足以证明"被跳过"而不是"被判对了"，
    // 靠下面 truncation 那条用例（后面还有一个合法标签）来证明。
    [['en-US-'], 'zh-Hans'], [['en-a@'], 'zh-Hans'], [['zh-Hant!'], 'zh-Hans'],
  ])('%j → %s', (tags, expected) => {
    expect(detectLocale(tags)).toBe(expected)
  })

  it('尾随连字符的残标签（如 en-）不合法，不会截断扫描——继续找到后面合法的 ja-JP', () => {
    expect(detectLocale(['en-', 'ja-JP'])).toBe('ja')
  })

  it.each([
    ['en-US-', 'ja-JP'], ['en-a@', 'ja-JP'], ['zh-Hant!', 'ja-JP'],
  ])('语法不合法的标签（%s）不会截断扫描——继续找到后面合法的 %s', (bad, good) => {
    expect(detectLocale([bad, good])).toBe('ja')
  })

  it('取第一个能识别的标签，而不是第一个标签', () => {
    // 'x-testing' 是 BCP 47 的 private-use 单例子标签（单个字母 'x' 打头，
    // 不是一个语言子标签），Intl.Locale 构造时对它抛 RangeError，识别不出，
    // 验证「继续往后找」。
    // （不能用 'xx-YY'：'xx' 是形状合法的语言子标签，Intl.Locale 能正常
    // 解析出 language: 'xx'，会被当成「识别到了」直接归英文，不再具备
    // 「继续往后找」的演示效果。）
    expect(detectLocale(['x-testing', 'ja-JP'])).toBe('ja')
  })

  it('空数组回退 zh-Hans', () => {
    expect(detectLocale([])).toBe('zh-Hans')
  })

  it('大小写不敏感', () => {
    expect(detectLocale(['ZH-TW'])).toBe('zh-Hant')
  })
})
