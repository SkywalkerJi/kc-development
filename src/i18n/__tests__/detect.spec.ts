import { describe, it, expect } from 'vitest'
import { detectLocale } from '@/i18n/detect'

describe('detectLocale', () => {
  it.each([
    [['zh-CN'], 'zh-Hans'], [['zh-SG'], 'zh-Hans'], [['zh-Hans-CN'], 'zh-Hans'], [['zh'], 'zh-Hans'],
    [['zh-TW'], 'zh-Hant'], [['zh-HK'], 'zh-Hant'], [['zh-MO'], 'zh-Hant'], [['zh-Hant-TW'], 'zh-Hant'],
    [['ja'], 'ja'], [['ja-JP'], 'ja'],
    [['en-US'], 'en'], [['fr-FR'], 'en'], [['ko-KR'], 'en'],
  ])('%j → %s', (tags, expected) => {
    expect(detectLocale(tags)).toBe(expected)
  })

  it('取第一个能识别的标签，而不是第一个标签', () => {
    // 裸 zh 能识别，所以这里第一个就命中；换成不可识别的形态验证「继续往后找」
    expect(detectLocale(['xx-YY', 'ja-JP'])).toBe('ja')
  })

  it('空数组回退 zh-Hans', () => {
    expect(detectLocale([])).toBe('zh-Hans')
  })

  it('大小写不敏感', () => {
    expect(detectLocale(['ZH-TW'])).toBe('zh-Hant')
  })
})
