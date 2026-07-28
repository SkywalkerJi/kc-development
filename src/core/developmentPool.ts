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
  }

  toString(): string {
    return `${this.开发池名称}(${this.text})`
  }
}

export function createPools(data: DevelopmentPoolData[]): DevelopmentPoolClass[] {
  return data.map((d) => Object.assign(new DevelopmentPoolClass(), d, { 舰ID: [...(d.舰ID ?? [])] }))
}
