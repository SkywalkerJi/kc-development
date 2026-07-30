import { describe, it, expect, vi } from 'vitest'
import { ref, watch, nextTick } from 'vue'
import {
  validateResourceValue,
  applyResourceChange,
  sanitizeResourceInput,
  parseResourceInput,
  resolveResourceInputText,
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
    ['10.5', '105', '小数点被剥离——这是字符级过滤本身的结果'],
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

// 第二轮审查残留 1：sanitizeResourceInput 是**剥离**语义。逐字符输入时这没
// 问题（非法字符在按下的当下就被吃掉，用户根本打不出来）；但粘贴一个 "10.5"
// 进去，剥离会得到 "105"——一个用户没打过、也没预期的"第三个数"。
// resolveResourceInputText 把"这次输入到底该被当成什么文本处理"这个判断
// 单独收口成一个纯函数：一次性写入（粘贴/拖拽/自动填充）里混了非法字符时，
// 整体拒绝、回退到上一个合法值，而不是接受剥离结果。
describe('resolveResourceInputText — 残留1：一次性写入的非法字符必须被整体拒绝', () => {
  it.each([
    ['100.0', '不能变成剥离后的 1000'],
    ['1e2', '不能变成剥离后的 12'],
    ['0x64', '不能变成剥离后的 064'],
    ['100abc', '不能变成剥离后的 100'],
    ['10.5', '不能变成剥离后的 105'],
    ['...', '清洗后为空串，同样要回退到旧值，不是变成空串'],
  ])('resolveResourceInputText(%j, "50") === "50"（%s）', (raw) => {
    expect(resolveResourceInputText(raw, '50')).toBe('50')
  })

  it('原始文本本身干净（清洗前后一致）：直接返回清洗结果，不触发拒绝', () => {
    expect(resolveResourceInputText('100', '50')).toBe('100')
    expect(resolveResourceInputText('7', '50')).toBe('7')
  })

  it('原始文本是空串（清空输入框）：不落进拒绝分支，返回空串，交给 parseResourceInput 走既有的 NaN 回退', () => {
    expect(resolveResourceInputText('', '50')).toBe('')
  })

  it('单个非法字符混进已有的合法文本（模拟逐字符打了一下 "."）：清洗结果等于打这个字符之前的文本，效果与"什么都没打"一致', () => {
    // "10." 是在已经打出 "10" 之后，多打了一个 "." 形成的——清洗后还是 "10"，
    // 与 lastValidText 传入的 "10" 一致，属于"清洗结果 === 打这个字符前的文本"
    // 这种典型情况，不需要真的走到拒绝分支也能得到同样的结果。
    expect(resolveResourceInputText('10.', '10')).toBe('10')
  })
})

// 把 sanitizeResourceInput/parseResourceInput/resolveResourceInputText 接到
// applyResourceChange 的 deep watch 链路上（复刻 DevelopmentView.vue 里
// @input 的接线），验证表格里每一类畸形输入最终喂给"重算"的都是全整数数组——
// 不是只测到纯函数为止，而是测到审查要求的"进算法前"这一步。
//
// 如实说明覆盖边界：下面 makeInputHarness 里的 watch(resources, ...) 是在
// 测试里用真实的 Vue ref/watch **复刻**出来的一份接线，不是 DevelopmentView.vue
// 里那个 watch 本身——sanitizeResourceInput/parseResourceInput/
// resolveResourceInputText/applyResourceChange 都是真实生产代码，但"View 是否
// 真的这样接线调用它们"这件事，这份测试测不出来。这条缺口现在有
// src/views/__tests__/DevelopmentView.spec.ts 用真实 SFC 挂载去覆盖（越界
// 输入不提交 committedResources、不影响分组结果）；但那份测试关注的是
// rawResources/committedResources 这一层拆分是否接对，不是这里逐字符/粘贴
// 输入清洗的每一种畸形形态，两份测试分工不同，不是互相替代的关系。
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
      if (!result.recompute) return
      recompute([...resources.value])
    }, { deep: true })

    // 复刻 DevelopmentView.vue 的 onResourceInput：raw 是这次 input 事件触发
    // 时 target.value 的完整内容。调用方按"一次性写入整段文本"（粘贴）或
    // "在当前已结算的值后面追加一个字符"（逐字符键入）两种方式构造 raw，
    // 对应真实浏览器里粘贴与打字的不同行为。
    async function fireInputEvent(index: number, raw: string) {
      const text = resolveResourceInputText(raw, String(lastValid.value[index]))
      resources.value[index] = parseResourceInput(text)
      await nextTick()
      await nextTick() // 给非整数触发的回退留出结算时间
    }

    return { resources, lastValid, recompute, fireInputEvent }
  }

  it.each([
    ['100.0'], ['1e2'], ['0x64'], ['100abc'], ['10.5'], [''], ['   '],
  ])('一次性写入（粘贴场景） %j：resources 最终必须是整数，recompute 收到的每一项也都必须是整数', async (raw) => {
    const { resources, recompute, fireInputEvent } = makeInputHarness()

    await fireInputEvent(3, raw)

    for (const call of recompute.mock.calls) {
      expect(call[0].every((v: number) => Number.isInteger(v))).toBe(true)
    }
    // 最终态本身也必须是整数——不允许停在一个非整数/NaN 上
    expect(resources.value.every((v) => Number.isInteger(v))).toBe(true)
  })

  it('粘贴 "0x64"：被残留1的拒绝逻辑整体拒绝，停留在粘贴前的旧值 10，不是剥离出来的 64', async () => {
    const { resources, fireInputEvent } = makeInputHarness()
    await fireInputEvent(3, '0x64')
    expect(resources.value[3]).toBe(10)
  })

  it('粘贴 "100abc"：同样被整体拒绝，停留在 10，recompute 不会被这次粘贴触发', async () => {
    const { resources, recompute, fireInputEvent } = makeInputHarness()
    await fireInputEvent(3, '100abc')
    expect(resources.value[3]).toBe(10)
    expect(recompute).not.toHaveBeenCalled()
  })
})

// 第二轮审查残留 1 补充验证：确认这个改动不会破坏正常输入体验——连续逐字符
// 输入、退格删除、清空输入框这三种最常见的交互都要不受影响。
describe('残留1：正常输入体验不受影响——连续输入 / 退格 / 清空', () => {
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
      if (!result.recompute) return
      recompute([...resources.value])
    }, { deep: true })

    async function fireInputEvent(index: number, raw: string) {
      const text = resolveResourceInputText(raw, String(lastValid.value[index]))
      resources.value[index] = parseResourceInput(text)
      await nextTick()
      await nextTick()
    }

    return { resources, lastValid, recompute, fireInputEvent }
  }

  it('连续逐字符输入合法数字：全选后依次打 "1"→"10"→"100"，每一步都被正常接受', async () => {
    const { resources, fireInputEvent } = makeInputHarness()
    await fireInputEvent(3, '1')
    expect(resources.value[3]).toBe(1)
    await fireInputEvent(3, '10')
    expect(resources.value[3]).toBe(10)
    await fireInputEvent(3, '100')
    expect(resources.value[3]).toBe(100)
  })

  it('逐字符打 "100abc"（全选后逐字敲键）：数字正常累积到 100 并触发一次重算；随后敲的字母 a/b/c 各自被当次吃掉，不影响已经打出来的 100，也不会再次触发重算', async () => {
    const { resources, recompute, fireInputEvent } = makeInputHarness()

    await fireInputEvent(3, '1')     // 全选后打第一个字符，替换掉原来的 "10"
    await fireInputEvent(3, '10')
    await fireInputEvent(3, '100')
    expect(resources.value[3]).toBe(100)
    expect(recompute).toHaveBeenCalledWith([10, 10, 10, 100])
    recompute.mockClear()

    await fireInputEvent(3, '100a')   // 在已结算的 "100" 后面敲了个 "a"
    expect(resources.value[3]).toBe(100)
    await fireInputEvent(3, '100ab')
    expect(resources.value[3]).toBe(100)
    await fireInputEvent(3, '100abc')
    expect(resources.value[3]).toBe(100)
    // 三次字母键入都被吃掉、数值没有变化，不应该有新的重算被触发
    expect(recompute).not.toHaveBeenCalled()
  })

  it('退格删除：从已结算的 "100" 删掉最后一位变成 "10"，正常生效', async () => {
    const { resources, fireInputEvent } = makeInputHarness()
    await fireInputEvent(3, '1')
    await fireInputEvent(3, '10')
    await fireInputEvent(3, '100')
    expect(resources.value[3]).toBe(100)

    await fireInputEvent(3, '10') // 退格：文本从 "100" 变成 "10"
    expect(resources.value[3]).toBe(10)
  })

  it('清空输入框（全选后删除，raw 是空串）：不落进残留1新增的拒绝分支（要求 raw 非空），走的是既有的 NaN 回退，回退到上一个合法值，不受这次改动影响', async () => {
    const { resources, fireInputEvent } = makeInputHarness()
    await fireInputEvent(3, '1')
    await fireInputEvent(3, '10')
    await fireInputEvent(3, '100')
    expect(resources.value[3]).toBe(100)

    await fireInputEvent(3, '') // 清空
    expect(resources.value[3]).toBe(100) // 回退到清空前的合法值，不是停在空/NaN
  })

  it('粘贴与逐字符输入的对照：同样是 "100abc"，粘贴（一次性写入）被整体拒绝停在旧值；逐字符打出来则正常累积到 100——两种输入方式的结果不同，且都符合各自的预期', async () => {
    const pasted = makeInputHarness()
    await pasted.fireInputEvent(3, '100abc')
    expect(pasted.resources.value[3]).toBe(10) // 粘贴：整体拒绝，停在初始值 10

    const typed = makeInputHarness()
    await typed.fireInputEvent(3, '1')
    await typed.fireInputEvent(3, '10')
    await typed.fireInputEvent(3, '100')
    await typed.fireInputEvent(3, '100a')
    await typed.fireInputEvent(3, '100ab')
    await typed.fireInputEvent(3, '100abc')
    expect(typed.resources.value[3]).toBe(100) // 逐字符：正常累积到 100
  })
})

describe('applyResourceChange — F1 watcher 前置整数判断', () => {
  it('全部是整数且全部在 [10,300] 内：不回退，推进 lastValid 并允许重算', () => {
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

// 第二轮审查残留 2：全部是整数、但存在越界项（不在 [10,300] 内）时，输入
// 过程中不该立即用越界值触发重算。这是审查明确点名的一处与某类参考实现
// 不同的地方：那类实现在"输入变化"这个时机点，只有整数且落在合法区间内
// 才更新缓存并重算；越界时什么都不做（既不重算，也不回退显示），等失焦
// 才夹紧并无条件重算。
describe('applyResourceChange — 残留2：越界整数不回退显示、但也不重算', () => {
  it('单项越界（超过 300）：不回退（revertedResources 为 null，resources 应保持原样）、不推进 lastValid、不重算', () => {
    const result = applyResourceChange([10, 10, 10, 500], [10, 10, 10, 10])
    expect(result.revertedResources).toBeNull()
    expect(result.lastValid).toEqual([10, 10, 10, 10]) // 不推进，仍是旧值
    expect(result.recompute).toBe(false)
  })

  it('单项越界（低于 10）：同样不回退、不推进、不重算', () => {
    const result = applyResourceChange([10, 10, 10, 5], [10, 10, 10, 10])
    expect(result.revertedResources).toBeNull()
    expect(result.lastValid).toEqual([10, 10, 10, 10])
    expect(result.recompute).toBe(false)
  })

  it('边界值 10 与 300 本身视为合法，不落入越界分支', () => {
    const result = applyResourceChange([10, 300, 10, 10], [10, 10, 10, 10])
    expect(result.revertedResources).toBeNull()
    expect(result.lastValid).toEqual([10, 300, 10, 10])
    expect(result.recompute).toBe(true)
  })

  it('非整数优先于越界判断：存在非整数项时整体走非整数回退分支；越界但本身仍是整数的其它项不参与这次回退，原样保留在 revertedResources 里', () => {
    const result = applyResourceChange([10.5, 500, 10, 10], [10, 20, 10, 10])
    // 下标 0 是非整数，被替换成 lastValid[0]=10；下标 1 的 500 本身是整数，
    // 不落进"非整数回退"这个分支的处理范围，原样保留。
    expect(result.revertedResources).toEqual([10, 500, 10, 10])
    expect(result.recompute).toBe(false)
    expect(result.lastValid).toEqual([10, 20, 10, 10]) // 未推进，仍是调用前的值
  })

  it('从越界恢复到合法区间：下一次输入落回 [10,300] 后，正常推进 lastValid 并重算', () => {
    const first = applyResourceChange([10, 10, 10, 500], [10, 10, 10, 10])
    expect(first.recompute).toBe(false)
    const second = applyResourceChange([10, 10, 10, 200], first.lastValid)
    expect(second.revertedResources).toBeNull()
    expect(second.lastValid).toEqual([10, 10, 10, 200])
    expect(second.recompute).toBe(true)
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
      if (!result.recompute) return
      recompute([...resources.value])
    }, { deep: true })

    // 模拟把铝资源打成小数（复现 [10,10,10,10.5]）
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

// 越界整数不会被 lastValid 记住（残留2），失焦时始终按当前显示值夹紧。
//
// 明确这条锁的是本实现自己选的语义，不是照搬某个参考行为：失焦时
// validateResourceValue 让 resources 与 lastValid 一起夹到 [10,300]，
// 即 lastValid 全程只保存「已校验过、可安全喂给算法」的值，从不保存越界值。
// 这是刻意的选择——resources 本身就是直接喂给算法的那份数据，
// applyResourceChange 的回退分支（`next[i] = lastValid[i]`）不会再做一次
// 夹紧；如果 lastValid 允许保存越界值，一旦后续输入触发回退，算法会直接
// 吃到这个未夹紧的越界值。因此本实现不采用「失焦只夹紧显示、内部备份值
// 不夹紧」这种在别处见过的做法，已核对过其代价后确认不适用于这里。
describe('F1/残留2：越界整数不会污染 lastValid，失焦无条件按当前显示值夹紧', () => {
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

  it('打完 "500"（不失焦）：resources 保持显示 500，但 lastValid 停留在上一个合法值 10，不会被越界值污染', async () => {
    const { resources, lastValid } = makeHarness()
    resources.value[3] = 500
    await nextTick()
    expect(resources.value[3]).toBe(500) // 保持显示原样，不回退
    expect(lastValid.value[3]).toBe(10) // 越界，不推进
  })

  it('打完 "5"（低于下限，不失焦）：同样保持显示、lastValid 不推进', async () => {
    const { resources, lastValid } = makeHarness()
    resources.value[0] = 5
    await nextTick()
    expect(resources.value[0]).toBe(5)
    expect(lastValid.value[0]).toBe(10)
  })

  it('先打一个合法的 "50"（推进 lastValid），再打越界的 "500"：lastValid 停在 50，不会被 500 覆盖', async () => {
    const { resources, lastValid } = makeHarness()
    resources.value[3] = 50
    await nextTick()
    expect(lastValid.value[3]).toBe(50)

    resources.value[3] = 500
    await nextTick()
    expect(resources.value[3]).toBe(500) // 显示原样
    expect(lastValid.value[3]).toBe(50) // 仍是上一个合法值，没被 500 覆盖
  })

  it('失焦时无条件按当前显示值夹紧——"500" 会被夹到 300，不受 lastValid 停留在 10 这件事影响', async () => {
    const { resources, lastValid, blur } = makeHarness()
    resources.value[3] = 500
    await nextTick()
    expect(lastValid.value[3]).toBe(10) // 越界未推进

    blur(3)
    // 关键断言：失焦夹紧用的是"当前显示的 500"，不是 lastValid 里那个更旧的
    // 10——两者夹出来的结果不一样（500→300，10→10），这里验证走的是前者。
    expect(resources.value[3]).toBe(300)
    expect(lastValid.value[3]).toBe(300)
  })

  it('打成 "5"（低于下限，不失焦）→ 失焦 → 夹到 10', async () => {
    const { resources, blur } = makeHarness()
    resources.value[0] = 5
    await nextTick()
    expect(resources.value[0]).toBe(5)

    blur(0)
    expect(resources.value[0]).toBe(10)
  })
})
