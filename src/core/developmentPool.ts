import type { DevelopmentPoolData } from './types'
import { ShipType } from './types'

interface ShipLike { name: string; stype: number; ctype: number }
type GetIDs = (names: string[], exact: boolean) => number[]

export class DevelopmentPoolClass implements DevelopmentPoolData {
  开发池名称 = ''
  开发池ID = 0
  舰种?: string[]
  舰型?: string[]
  舰名?: string[]
  舰ID: number[] = []
  不包含舰ID?: number[]
  最低资源?: number[]
  出货率: Record<string, number> = {}
  /**
   * 舰ID 的集合形式，只用于超集判定（findCompatiblePools）。
   *
   * 为什么要缓存：池匹配每次调用都要为**每个**候选池判断「候选 ⊇ 基准」，
   * 原来每次都现场 new Set(p.舰ID)；一次反推要往集合里插入十几万个元素。
   * 舰ID 在 init() 之后不再变化，所以完全可以只建一次。
   *
   * ⚠️ 它**不能**替代 舰ID 本身：舰ID 里刻意保留了重复项（见下面 init()
   * 里的说明），而池排序与「取最窄池」用的是含重复项的 舰ID.length。
   * 集合去重后 size 会不同，那两处必须继续读数组。
   *
   * 维护点只有两处：createPools（池未经 init 直接使用时）与 init() 末尾。
   * 任何新增的 舰ID 写入点都必须同步重建它。
   */
  舰ID集: Set<number> = new Set()
  private text = ''

  init(ctypeMap: Record<string, string>, getIDs: GetIDs, shipList: Record<number, ShipLike>): void {
    this.text = ''

    if (this.舰种) for (const s of this.舰种) this.text += s + ','

    if (this.舰型)
      for (const t of this.舰型) {
        const n = Number(t)
        if (!Number.isNaN(n)) {
          if (ctypeMap[String(n)]) this.text += ctypeMap[String(n)] + ','
        } else {
          this.text += t + ','
        }
      }

    if (this.舰名) for (const n of this.舰名) this.text += n + ','

    if (this.不包含舰ID) {
      this.text += '不包含'
      for (const id of this.不包含舰ID)
        if (shipList[id]) this.text += `${shipList[id].name}(${id}),`
    }

    if (this.舰ID) for (const id of this.舰ID) if (shipList[id]) this.text += `${shipList[id].name}(${id}),`

    if (this.最低资源) {
      const labels = ['最低油', '最低弹', '最低钢', '最低铝']
      for (let i = 0; i < 4; i++)
        if (this.最低资源[i] > 0) this.text += labels[i] + this.最低资源[i] + ','
    }

    this.text = this.text.length > 0 ? this.text.slice(0, -1) : '过滤条件有点问题'

    if (!this.舰ID) this.舰ID = []

    // 刻意复刻参考实现：以下三段一律 push 追加，不去重。
    // 舰ID.length 参与池排序与「取最窄池」判断，去重会改变这两处结果。
    if (this.舰种) {
      const wanted: number[] = []
      for (const name of this.舰种) {
        const v = ShipType[name as keyof typeof ShipType]
        if (typeof v === 'number') wanted.push(v)
      }
      for (const [k, ship] of Object.entries(shipList)) {
        const id = Number(k)
        if (id < 1500 && wanted.includes(ship.stype)) this.舰ID.push(id)
      }
    }

    if (this.舰型) {
      const wanted: number[] = []
      for (const t of this.舰型) {
        const n = Number(t)
        if (!Number.isNaN(n)) { wanted.push(n); continue }
        for (const [k, v] of Object.entries(ctypeMap))
          if (v === t) { wanted.push(Number(k)); break }
      }
      for (const [k, ship] of Object.entries(shipList)) {
        const id = Number(k)
        if (id < 1500 && wanted.includes(ship.ctype)) this.舰ID.push(id)
      }
    }

    if (this.舰名) this.舰ID.push(...getIDs(this.舰名, false))

    // 刻意复刻参考实现：List.Remove 只移除首个匹配项，不是 filter
    if (this.不包含舰ID)
      for (const id of this.不包含舰ID) {
        const idx = this.舰ID.indexOf(id)
        if (idx !== -1) this.舰ID.splice(idx, 1)
      }

    // 舰ID 到这里就定型了，建一次集合供超集判定复用（见字段处的说明）
    this.舰ID集 = new Set(this.舰ID)
  }

  toString(): string {
    return `${this.开发池名称}(${this.text})`
  }
}

export function createPools(data: DevelopmentPoolData[]): DevelopmentPoolClass[] {
  return data.map((d) => {
    const 舰ID = [...(d.舰ID ?? [])]
    // 这里也建一次集合：池不一定会被 init()（例如直接给定 舰ID 的场景），
    // 那种情况下 舰ID 就是这份原始值，集合与它保持一致。init() 末尾会用
    // 展开后的 舰ID 重建。
    return Object.assign(new DevelopmentPoolClass(), d, { 舰ID, 舰ID集: new Set(舰ID) })
  })
}
