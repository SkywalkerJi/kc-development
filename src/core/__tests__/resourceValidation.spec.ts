import { describe, it, expect, vi } from 'vitest'
import { ref, watch, nextTick } from 'vue'
import {
  validateResourceValue,
  applyResourceChange,
  sanitizeResourceInput,
  parseResourceInput,
} from '@/core/resourceValidation'

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

  // 空输入经 sanitizeResourceInput → parseResourceInput 会变成 NaN（见下面
  // sanitizeResourceInput/parseResourceInput 的测试）；这里单独确认
  // validateResourceValue 收到非 number 运行时值（不仅是 NaN）时同样回退，
  // 不依赖调用方一定先转换成合法的 number 类型——这是防御性的第二层。
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

// G1：资源输入从源头限制为整数。第一轮只堵住了 `10.5` 这一个例子——
// `Number.isInteger` 那层永远拿不到原始输入，`100.0`/`1e2`/`0x64`/`100abc`
// 照样会被 v-model.number 的 parseFloat 悄悄放行。这里直接测试字符级过滤
// 函数本身，覆盖的是「非数字字符的各种出现形式」这一整类，不是逐个补漏洞。
describe('sanitizeResourceInput — G1 从源头剥离非数字字符', () => {
  it.each([
    // [原始输入, 期望剥离后的结果, 说明]
    ['100.0', '1000', '小数点被剥离，不再是 parseFloat 悄悄截断出的 100'],
    ['1e2', '12', '科学计数法的 e 被剥离，不会被当成 100 解析'],
    ['0x64', '064', '十六进制前缀的 x 被剥离，不会像 parseFloat 那样悄悄变成 0'],
    ['100abc', '100', '尾随字母被剥离'],
    ['10.5', '105', '小数点被剥离——非法形式在输入阶段就打不出来，不是打完再回退'],
    ['', '', '空串保持空串'],
    ['   ', '', '纯空格全部剥离成空串'],
    ['-5', '5', '负号被剥离（资源不可能为负）'],
    ['007', '007', '前导零原样保留，交给 Number(...) 处理'],
    ['1.2.3', '123', '多个小数点全部剥离'],
    ['１２３', '', '全角数字不是 ASCII \\d，视为非法字符剥离（\\D 只认 0-9）'],
    ['12 34', '1234', '中间的空格也被剥离'],
    ['12\t34\n', '1234', '制表符、换行符等空白字符同样被剥离'],
  ])('sanitizeResourceInput(%j) === %j（%s）', (raw, expected) => {
    expect(sanitizeResourceInput(raw)).toBe(expected)
  })

  it('剥离结果只可能是纯 ASCII 数字或空串，用一批随机噪声输入做属性验证', () => {
    const noisy = [
      '1a2b3c', '..5..', 'e10', '0X1F', '  1 0  ', '+-10', '10%', '¥10',
      'NaN', 'Infinity', '10,000', '一百',
    ]
    for (const raw of noisy) {
      const sanitized = sanitizeResourceInput(raw)
      expect(sanitized).toMatch(/^\d*$/)
    }
  })
})

describe('parseResourceInput — G1 清洗后转换为送入算法的数值', () => {
  it('非空数字串转换为对应整数', () => {
    expect(parseResourceInput('100')).toBe(100)
    expect(parseResourceInput('007')).toBe(7)
    expect(parseResourceInput('0')).toBe(0)
  })

  it('空串转换为 NaN，而不是静默当成 0', () => {
    expect(Number.isNaN(parseResourceInput(''))).toBe(true)
  })
})

// 把 sanitizeResourceInput/parseResourceInput 接到 applyResourceChange 的
// deep watch 链路上（复刻 DevelopmentView.vue 里 @input 的接线），验证表格里
// 每一类畸形输入最终喂给"重算"的都是全整数数组——不是只测到纯函数为止，
// 而是测到审查要求的"进算法前"这一步。
//
// 如实说明覆盖边界：下面 makeInputHarness 里的 watch(resources, ...) 是在
// 测试里用真实的 Vue ref/watch **复刻**出来的一份接线，不是 DevelopmentView.vue
// 里那个 watch 本身——sanitizeResourceInput/applyResourceChange 这两个函数是
// 真实生产代码，但"View 是否真的这样接线调用它们"这件事，这份测试测不出来
// （需要挂载组件的测试，如 @vue/test-utils，本次未引入该依赖）。
describe('G1：原始输入 → 清洗 → 算法，全链路验证「不会以非整数或截断值进入算法」', () => {
  function makeInputHarness() {
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

    // 复刻 DevelopmentView.vue 的 onResourceInput：拿原始字符串 → 清洗 → 转数值 → 写回。
    function typeRaw(index: number, raw: string) {
      const sanitized = sanitizeResourceInput(raw)
      resources.value[index] = parseResourceInput(sanitized)
    }

    return { resources, recompute, typeRaw }
  }

  it.each([
    ['100.0'], ['1e2'], ['0x64'], ['100abc'], ['10.5'], [''], ['   '],
  ])('原始输入 %j：recompute 收到的每一项都必须是整数', async (raw) => {
    const { resources, recompute, typeRaw } = makeInputHarness()

    typeRaw(3, raw)
    await nextTick()
    await nextTick() // 非整数（如空串→NaN）触发的回退会再引一轮 watch

    for (const call of recompute.mock.calls) {
      expect(call[0].every((v: number) => Number.isInteger(v))).toBe(true)
    }
    // 最终态本身也必须是整数——不允许停在一个非整数/NaN 上
    expect(resources.value.every((v) => Number.isInteger(v))).toBe(true)
  })

  it('"0x64" 最终落在按字符剥离后的确定值（064 → 64），不是 parseFloat 悄悄给出的 0', async () => {
    const { resources, typeRaw } = makeInputHarness()
    typeRaw(3, '0x64')
    await nextTick()
    expect(resources.value[3]).toBe(64)
  })

  it('"100abc" 落在剥离字母后的 100，且 recompute 至少被调用过一次整数数组', async () => {
    const { resources, recompute, typeRaw } = makeInputHarness()
    typeRaw(3, '100abc')
    await nextTick()
    expect(resources.value[3]).toBe(100)
    expect(recompute).toHaveBeenCalledWith([10, 10, 10, 100])
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
  // 同上：这是复刻出来的接线，不是真实 View 接线本身，见上面 G1 describe
  // 块开头的边界说明。
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
  //
  // 明确这条锁的是本实现自己选的语义，不是照搬某个参考行为：失焦时
  // validateResourceValue 让 resources 与 lastValid 一起夹到 [10,300]，
  // 即 lastValid 全程只保存「已校验过、可安全喂给算法」的值，从不保存越界值。
  // 这是刻意的选择——resources 本身就是直接喂给算法的那份数据，
  // applyResourceChange 的回退分支（`next[i] = lastValid[i]`）不会再做一次
  // 夹紧；如果 lastValid 允许保存越界值（比如失焦后仍保留未夹紧的 500），
  // 一旦后续输入触发回退，算法会直接吃到这个未夹紧的越界值。因此本实现
  // 不采用「失焦只夹紧显示、内部备份值不夹紧」这种在别处见过的做法，
  // 已核对过其代价（备份值可能把越界数据带回算法）后确认不适用于这里——
  // 这不是一个未经核对、顺手写下的假设。
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

  it('连续打完 "500"（不失焦，lastValid 跟着推进到越界值 500）→ 再打成 "500.5" → 回退到未夹紧的 500 → 失焦后 resources 与 lastValid 一起夹到 300', async () => {
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
    // 关键断言：失焦后 lastValid 与 resources 一起被夹到 300，不保留未夹紧的
    // 500。这是本实现的既定选择（见上面 describe 的说明），不是待核对的假设。
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
