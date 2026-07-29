import { describe, it, expect, vi } from 'vitest'
import { ref, watch, nextTick } from 'vue'
import { validateResourceValue, applyResourceChange } from '@/core/resourceValidation'

describe('validateResourceValue — F1 失焦校验', () => {
  it('整数落在 [10,300] 内原样返回', () => {
    expect(validateResourceValue(50, 10)).toBe(50)
  })

  it('小数解析失败，回退到上一个合法值', () => {
    expect(validateResourceValue(10.5, 20)).toBe(20)
  })

  it('NaN 回退到上一个合法值', () => {
    expect(validateResourceValue(NaN, 20)).toBe(20)
  })

  // v-model.number 用的是 looseToNumber：转换失败时会把原始字符串（如空输入 ""）
  // 直接留在数组里，运行时类型可能不是 number。Number.isInteger 对非 number
  // 类型一律返回 false，因此这里也会走回退分支——这是刻意要覆盖的边界。
  it('空字符串等非 number 运行时值也回退到上一个合法值', () => {
    expect(validateResourceValue('' as unknown as number, 20)).toBe(20)
  })

  it('小于 10 的整数夹到 10', () => {
    expect(validateResourceValue(5, 50)).toBe(10)
  })

  it('大于 300 的整数夹到 300', () => {
    expect(validateResourceValue(500, 50)).toBe(300)
  })

  it('边界值 10 与 300 原样返回，不被误夹', () => {
    expect(validateResourceValue(10, 50)).toBe(10)
    expect(validateResourceValue(300, 50)).toBe(300)
  })
})

describe('applyResourceChange — F1 watcher 前置整数判断', () => {
  it('全部是整数时不回退，推进 lastValid 并允许重算', () => {
    const result = applyResourceChange([10, 10, 10, 10], [10, 10, 10, 10])
    expect(result).toEqual({
      revertedResources: null,
      lastValid: [10, 10, 10, 10],
      recompute: true,
    })
  })

  it('复现：[10,10,10,10.5] 回退第 4 项、本轮不重算、lastValid 不推进', () => {
    const result = applyResourceChange([10, 10, 10, 10.5], [10, 10, 10, 10])
    expect(result.revertedResources).toEqual([10, 10, 10, 10])
    expect(result.recompute).toBe(false)
    // 未确认的小数不应污染 lastValid 基准
    expect(result.lastValid).toEqual([10, 10, 10, 10])
  })

  it('非整数项定位到正确的下标，其余整数项不受影响', () => {
    const result = applyResourceChange([10.2, 20, 30, 40], [10, 10, 10, 10])
    expect(result.revertedResources).toEqual([10, 20, 30, 40])
  })

  it('多项同时非整数，逐项各自回退到对应下标的 lastValid', () => {
    const result = applyResourceChange([1.1, 20, 2.2, 40], [10, 99, 10, 99])
    expect(result.revertedResources).toEqual([10, 20, 10, 40])
  })
})

describe('F1 watcher 陷阱：deep watch(resources) 不能在整数校验前直接进算法', () => {
  // 用真实的 Vue ref/watch 复刻 DevelopmentView.vue 里的接线方式（调用
  // applyResourceChange 决定是否重算），验证小数在被纠正之前，"重算" 从未
  // 拿到过一份含小数的 resources。这是本条发现要求的实测，不是靠读代码推断。
  it('[10,10,10,10.5]：recompute 从未见过含小数的数组，最终收敛回 [10,10,10,10]', async () => {
    const resources = ref<number[]>([10, 10, 10, 10])
    const lastValid = ref<number[]>([10, 10, 10, 10])
    const recompute = vi.fn()

    watch(resources, () => {
      const result = applyResourceChange(resources.value, lastValid.value)
      lastValid.value = result.lastValid
      if (result.revertedResources) {
        resources.value = result.revertedResources
        return
      }
      recompute([...resources.value])
    }, { deep: true })

    // 模拟 v-model.number 把铝资源打成小数（复现 [10,10,10,10.5]）
    resources.value[3] = 10.5
    await nextTick()
    await nextTick() // 回退触发的第二轮 watch

    for (const call of recompute.mock.calls) {
      expect(call[0].every((v: number) => Number.isInteger(v))).toBe(true)
    }
    expect(recompute).toHaveBeenCalledWith([10, 10, 10, 10])
    expect(resources.value).toEqual([10, 10, 10, 10])
  })
})

describe('F1：越界（但合法）值经小数回退后仍会被失焦夹紧，不会永久滞留', () => {
  // lastValid 只在“非整数回退”这一条路径上使用，每次按键只要还是整数就会
  // 推进它，哪怕越界（比如刚打完 "500" 还没失焦）。这里验证：这种越界、未夹紧
  // 的 lastValid 不会导致失焦后仍然越界——validateResourceValue 的夹紧分支
  // 不依赖 lastValid，失焦永远会重新夹一遍。
  function makeHarness() {
    const resources = ref<number[]>([10, 10, 10, 10])
    const lastValid = ref<number[]>([10, 10, 10, 10])

    watch(resources, () => {
      const result = applyResourceChange(resources.value, lastValid.value)
      lastValid.value = result.lastValid
      if (result.revertedResources) {
        resources.value = result.revertedResources
      }
    }, { deep: true })

    function blur(index: number) {
      const validated = validateResourceValue(resources.value[index], lastValid.value[index])
      resources.value[index] = validated
      lastValid.value[index] = validated
    }

    return { resources, lastValid, blur }
  }

  it('连续打完 "500"（不失焦）→ lastValid 越界；再打成 "500.5" → 回退到未夹紧的 500；失焦 → 300', async () => {
    const { resources, lastValid, blur } = makeHarness()

    resources.value[3] = 5
    await nextTick()
    resources.value[3] = 50
    await nextTick()
    resources.value[3] = 500
    await nextTick()
    expect(lastValid.value[3]).toBe(500) // 越界，尚未失焦夹紧

    resources.value[3] = 500.5
    await nextTick()
    await nextTick()
    expect(resources.value[3]).toBe(500) // 回退到上一个合法整数，而不是被悄悄夹紧

    blur(3)
    expect(resources.value[3]).toBe(300)
    expect(lastValid.value[3]).toBe(300)
  })

  it('打成 "5"（低于下限，不失焦）→ 打成 "5.5" → 回退到 5；失焦 → 10', async () => {
    const { resources, blur } = makeHarness()

    resources.value[0] = 5
    await nextTick()

    resources.value[0] = 5.5
    await nextTick()
    await nextTick()
    expect(resources.value[0]).toBe(5)

    blur(0)
    expect(resources.value[0]).toBe(10)
  })
})
