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
  ])('%j → %s', (tags, expected) => {
    expect(detectLocale(tags)).toBe(expected)
  })

  it('取第一个能识别的标签，而不是第一个标签', () => {
    // 'x-testing' 是 BCP 47 的 private-use 单例子标签，主语言部分只有一个
    // 字母 'x'，不满足「2-3 个字母」的形状，识别不出，验证「继续往后找」。
    // （不能再用旧版这里的 'xx-YY'：Fix A 之后 'xx' 满足形状要求，会被当成
    // 「识别到了」直接归英文，不再具备「继续往后找」的演示效果。）
    expect(detectLocale(['x-testing', 'ja-JP'])).toBe('ja')
  })

  it('空数组回退 zh-Hans', () => {
    expect(detectLocale([])).toBe('zh-Hans')
  })

  it('大小写不敏感', () => {
    expect(detectLocale(['ZH-TW'])).toBe('zh-Hant')
  })
})
