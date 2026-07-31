import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA = join(__dirname, '..', '..', '..', 'public', 'data')
const read = (...p: string[]) => JSON.parse(readFileSync(join(DATA, ...p), 'utf8'))

const pools: { 出货率?: Record<string, number> }[] = read('DevelopmentPool.json')
const start2 = read('start2.json')
const refEquipIds = [...new Set(pools.flatMap((p) => Object.keys(p.出货率 ?? {}).map(Number)))]
const playerShipIds = start2.api_mst_ship
  .map((s: { api_id: number }) => s.api_id).filter((id: number) => id < 1500)

describe('名称表覆盖', () => {
  it.each(['zh-Hans', 'zh-Hant', 'en'])('%s 覆盖开发池引用的全部装备', (loc) => {
    const items = read('i18n', loc, 'items.json')
    expect(refEquipIds.filter((id) => !items[id])).toEqual([])
  })

  it.each(['zh-Hans', 'zh-Hant', 'en'])('%s 覆盖全部玩家舰', (loc) => {
    const ships = read('i18n', loc, 'ships.json')
    expect(playerShipIds.filter((id: number) => !ships[id])).toEqual([])
  })

  // 这条不是多余的：ja 的空表是**有意为之**（日文名的唯一真值源是 start2）。
  // 不显式断言的话，「同步脚本忘了产出」会与「故意为空」表现得一模一样。
  it('ja 的 items/ships 是空对象（日文名取自 start2，不复制第二份）', () => {
    expect(read('i18n', 'ja', 'items.json')).toEqual({})
    expect(read('i18n', 'ja', 'ships.json')).toEqual({})
  })

  it('ja/zh-Hant/en 都有 ctype.json，zh-Hans 没有（它读既有的 ctypeMap）', () => {
    for (const loc of ['ja', 'zh-Hant', 'en']) {
      expect(Object.keys(read('i18n', loc, 'ctype.json')).length).toBeGreaterThan(0)
    }
    expect(() => read('i18n', 'zh-Hans', 'ctype.json')).toThrow()
  })
})
