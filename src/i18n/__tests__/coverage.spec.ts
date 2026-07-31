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

  // 上面几条只断言"有值、数量对"，不断言"值真的是译文"。sync-i18n 的 ctype
  // 分支在查不到译名时会**按设计**直接回填日文原文（scripts/sync-i18n.mjs
  // 里 `deriveCtypeName(...) ?? jaName` 那一行）——如果它因为回归而对
  // items.json 也这么干，或者同步脚本忘了真的调用翻译源、把日文名原样抄进
  // 译名表，上面那几条覆盖率断言会照样全绿：数量、键集合都没变，只是值
  // 变成了日文，"一个等于原文的译名证明不了任何东西"这个陷阱在名称表这一
  // 层同样成立。这里钉一个"至少这么多条必须和日文原名不同"的下限：
  //
  // 实测 en/items.json 对 start2.json 的 703 条 api_mst_slotitem，647 条与
  // 日文 api_name 不同，56 条相同——相同的全部是本来就该相同的拉丁名
  // （如 `OS2U`、`PBY-5A Catalina`、`3.7cm FlaK M42`，这些装备在游戏里
  // 本来就没有汉字名）。500 留了约 150 条的余量：上游 KC3 译名库正常增补/
  // 改字不会让相同条目从 56 跳到 200+，但只要有人把整份翻译源换成
  // 日文原文（或者忘了接翻译源、直接抄 items.json 里的日文名），647 会
  // 直接掉到接近 0，必定跌破这个下限。
  it('en/items.json 的译名与日文原名有实质差异（不是整份照抄日文原名）', () => {
    const start2 = read('start2.json')
    const items = read('i18n', 'en', 'items.json') as Record<string, string>
    const slotItems = start2.api_mst_slotitem as { api_id: number; api_name: string }[]
    const diffCount = slotItems.filter((it) => items[it.api_id] !== it.api_name).length
    expect(diffCount).toBeGreaterThanOrEqual(500)
  })
})
