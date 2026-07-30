import { describe, it, expect } from 'vitest'
import { MESSAGES } from '@/i18n/messages'
import { LOCALES } from '@/i18n/types'

describe('UI 文案字典', () => {
  it('四种语言的 key 集合完全相同', () => {
    const base = Object.keys(MESSAGES['zh-Hans']).sort()
    for (const loc of LOCALES) {
      expect(Object.keys(MESSAGES[loc]).sort(), `${loc} 的 key 集合与 zh-Hans 不一致`).toEqual(base)
    }
  })

  it('没有空字符串值（漏译会表现为空白界面元素，比报错更难发现）', () => {
    for (const loc of LOCALES) {
      for (const [k, v] of Object.entries(MESSAGES[loc])) {
        expect(v.length, `${loc} 的 ${k} 是空串`).toBeGreaterThan(0)
      }
    }
  })

  it('zh-Hans 的这几条与现有硬编码逐字一致（现有 DOM 断言依赖它们）', () => {
    const m = MESSAGES['zh-Hans']
    expect(m['label.fuel']).toBe('油')
    expect(m['label.totalResource']).toBe('总资源')
    expect(m['group.replaced']).toBe('全部被替换')
    expect(m['group.insufficient']).toBe('资源不足导致失败')
    expect(m['title.development']).toBe('装备开发')
  })
})
