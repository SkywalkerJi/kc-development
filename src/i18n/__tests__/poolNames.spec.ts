import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { POOL_NAMES } from '@/i18n/names/poolNames'
import { LOCALES } from '@/i18n/types'

const pools: { 开发池名称: string }[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'public', 'data', 'DevelopmentPool.json'), 'utf8'),
)

describe('开发池名译名表', () => {
  it('覆盖 DevelopmentPool.json 里全部不重复池名', () => {
    const actual = [...new Set(pools.map((p) => p.开发池名称))]
    const missing = actual.filter((n) => !POOL_NAMES[n])
    expect(missing, '池名是身份键，漏一条界面上就会露出中文原名').toEqual([])
  })

  it('没有多余条目（拼写不符的键等于没翻译）', () => {
    const actual = new Set(pools.map((p) => p.开发池名称))
    expect(Object.keys(POOL_NAMES).filter((k) => !actual.has(k))).toEqual([])
  })

  it('每条都有四种语言且非空', () => {
    for (const [name, row] of Object.entries(POOL_NAMES)) {
      for (const loc of LOCALES) {
        expect(row[loc]?.length, `${name} 缺 ${loc}`).toBeGreaterThan(0)
      }
    }
  })

  it('zh-Hans 一列就是原名本身（它是身份键，不该被改写）', () => {
    for (const [name, row] of Object.entries(POOL_NAMES)) {
      expect(row['zh-Hans']).toBe(name)
    }
  })
})
