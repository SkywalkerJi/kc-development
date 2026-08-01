// @vitest-environment jsdom
//
// 真实 SFC 挂载测试，做法同 LocaleSwitcher.spec.ts / DevelopmentView.spec.ts：
// createApp(FlagshipSearch, props).mount() + 原生 dispatchEvent，不引入
// @vue/test-utils。
//
// 这里钉住的是搜索谓词的三个匹配维度：日文原名、假名读音、当前语言译名。
// 前两个维度改造前就有；后两条用例专门证明「译名维度」是真的接了译名层、
// 不是巧合命中日文原名——都特意挑了译名与日文原文**不同**的舰船（金剛→
// Kongou、長門→长门/长门），并且都先 stubGlobal('fetch') 让 setLocale 真正
// 发起一次名称表加载，而不是让测试停留在 EMPTY_NAME_TABLES 的回退路径上。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import FlagshipSearch from '../FlagshipSearch.vue'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { createPools } from '@/core/developmentPool'
import { __resetI18nForTest, setLocale } from '@/i18n'

let app: App | null = null
let host: HTMLElement | null = null

function mount() {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(FlagshipSearch, { matched: true })
  app.mount(host)
  return host
}

async function type(el: HTMLElement, text: string) {
  const input = el.querySelector('input')!
  input.value = text
  input.dispatchEvent(new Event('input'))
  await nextTick()
  return [...el.querySelectorAll('.suggestions li')].map((li) => li.textContent ?? '')
}

describe('FlagshipSearch 的搜索维度', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    const s = useStart2Store()
    s.shipList = {
      78: { id: 78, name: '金剛', yomi: 'こんごう' },
      85: { id: 85, name: '長門', yomi: 'ながと' },
    } as never
    useDevelopmentStore()
  })
  afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; vi.unstubAllGlobals() })

  it('按日文舰名命中', async () => {
    expect((await type(mount(), '金剛')).join()).toContain('金剛')
  })

  it('按假名读音命中', async () => {
    expect((await type(mount(), 'ながと')).join()).toContain('長門')
  })

  it('简体输入在 zh-Hans 下能命中 —— 这正是改造前搜不到的场景', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这条用例无关，见上面同类用例的注释。
      json: async () => (String(url).includes('ships.json') ? { 78: '金刚', 85: '长门' } : { 1: 'x' }),
    } as unknown as Response)))
    // 默认就是 zh-Hans，但名称表要真的加载进来才有译名维度；
    // 先切走再切回是让 setLocale 真正跑一次加载
    await setLocale('en')
    await setLocale('zh-Hans')
    // 断言的是**译名**'长门'（简体），不是日文原名'長門'——display 现在渲染的
    // 是 shipName(id) 的结果，命中之后整条建议文本应该是「长门（ながと）」。
    // 若这里错写成断言日文原名，翻译层被绕过时反而会通过，测不出回归。
    expect((await type(mount(), '长门')).join()).toContain('长门（ながと）')
  })

  it('译名维度随语言切换而变：英文下输入 Kongou 能命中', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这些用例无关（只关心 ships 译名），但 Fix 4
      // 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable
      // 拒绝，setLocale 会失败。随便给一条非空内容。
      json: async () => (String(url).includes('ships.json') ? { 78: 'Kongou' } : { 1: 'x' }),
    } as unknown as Response)))
    await setLocale('en')
    expect((await type(mount(), 'Kongou')).join()).toContain('Kongou')
  })

  // 以下三条钉住 Fix 3：搜索关键字与三个匹配维度都要先经
  // normalizeForSearch（NFKC + 大小写折叠 + 片假名→平假名）再比较，
  // 缺一步都会让某种输入形态搜不到本该搜到的舰。
  it('小写英文关键字也能命中大写开头的译名——大小写不敏感（Fix 3）', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这些用例无关（只关心 ships 译名），但 Fix 4
      // 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable
      // 拒绝，setLocale 会失败。随便给一条非空内容。
      json: async () => (String(url).includes('ships.json') ? { 78: 'Kongou' } : { 1: 'x' }),
    } as unknown as Response)))
    await setLocale('en')
    // 改造前 String.includes 是大小写敏感的，'kongou' 全小写找不到 'Kongou'。
    expect((await type(mount(), 'kongou')).join()).toContain('Kongou')
  })

  it('全角拉丁字母关键字命中半角译名——NFKC 规范化（Fix 3）', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这些用例无关（只关心 ships 译名），但 Fix 4
      // 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable
      // 拒绝，setLocale 会失败。随便给一条非空内容。
      json: async () => (String(url).includes('ships.json') ? { 78: 'Kongou' } : { 1: 'x' }),
    } as unknown as Response)))
    await setLocale('en')
    // 'Ｋｏｎｇｏｕ' 是全角拉丁字母（U+FF21 起），改造前原样比较肯定找不到
    // 半角的 'Kongou'；NFKC 把全角折成半角后应该等价于上一条用例。
    expect((await type(mount(), 'Ｋｏｎｇｏｕ')).join()).toContain('Kongou')
  })

  it('片假名关键字命中平假名读音——片假名→平假名折叠（Fix 3）', async () => {
    // 长门的 yomi 是平假名'ながと'；ナガト是它的片假名形态，游戏内、
    // 输入法候选、维基百科条目都常见这种写法，改造前逐字节比较搜不到。
    expect((await type(mount(), 'ナガト')).join()).toContain('長門')
  })
})

describe('FlagshipSearch：选中态跟随语言切换（Fix 4）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    const s = useStart2Store()
    s.shipList = { 78: { id: 78, name: '金剛', yomi: 'こんごう' } } as never
    // choose() 要 developmentStore.setFlagship(78) 返回非 null 命中，
    // 需要一个 开发池ID > 0 且 舰ID集 含 78 的池；createPools 不跑 init()
    // 也能直接从给定的 舰ID 建出 舰ID集，够用（同 DevelopmentView.spec.ts
    // 的既有做法）。
    useDevelopmentStore().developmentPools = createPools([
      { 开发池名称: '金刚池', 开发池ID: 1, 舰ID: [78], 出货率: {} },
    ])
  })
  afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; vi.unstubAllGlobals() })

  it('选中舰船后切换语言：输入框显示值跟着变成新语言的译名，不停留在选中那一刻的旧字符串', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这些用例无关（只关心 ships 译名），但 Fix 4
      // 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable
      // 拒绝，setLocale 会失败。随便给一条非空内容。
      json: async () => (String(url).includes('ships.json') ? { 78: 'Kongou' } : { 1: 'x' }),
    } as unknown as Response)))
    await setLocale('en')

    const el = mount()
    await type(el, '金剛')
    const li = el.querySelector('.suggestions li') as HTMLLIElement
    li.click()
    await nextTick()
    const input = el.querySelector('input') as HTMLInputElement
    // 断言真实 DOM 的 input.value，不是组件内部的 keyword ref——用户看到的
    // 是前者，若 v-model 没把 computed 的新值真的 patch 进 DOM，断言 ref
    // 会看不出来。
    expect(input.value).toBe('Kongou')

    // 切到 zh-Hans，且给 78 一个与 'Kongou' 明显不同的译名，制造"若还是
    // 旧值就会一眼看出不对"的落差——同一个字符串在两种语言下巧合相同
    // 不能证明「跟着语言变」这件事。
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true, status: 200,
      // items/ctype 内容与这条用例无关，见上面同类用例的注释。
      json: async () => (String(url).includes('ships.json') ? { 78: '金刚' } : { 1: 'x' }),
    } as unknown as Response)))
    await setLocale('zh-Hans')
    await nextTick()
    expect(input.value).toBe('金刚')
  })

  it('手动输入舰名后切换语言：输入框保留用户打的字，不会被选中态的旧逻辑覆盖', async () => {
    // 内容与这条用例无关（只关心 setLocale 是否触碰了输入框），但 Fix 4
    // 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable 拒绝。
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => ({ 1: 'x' }),
    } as unknown as Response)))

    const el = mount()
    await type(el, '長門')
    const input = el.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('長門')

    // 从未点过任何建议项，selectedShipId 应该始终是 null——语言切换不该
    // 触碰这个输入框。
    await setLocale('en')
    await nextTick()
    expect(input.value).toBe('長門')
  })
})

/**
 * 建议列表的关闭路径（round5 发现 15）。
 *
 * 改造前 `open` 只在 choose() 里被置回 false，没有任何其它出口。列表是
 * `position:absolute; z-index:10; top:100%`、最高 240px 的悬浮层，正好压在
 * 下方的资源输入框上：真实 Chrome 实测 1400px 下「钢」「铝」两框点不到，
 * 1024px 下四种语言里四个框**全部**点不到——点下去会被建议项截走，静默
 * 切换所选池。
 *
 * 这里钉的是「列表会不会自己关掉」这个状态迁移，与视口宽度无关（jsdom
 * 不做布局，也测不了遮挡几何；遮挡那一面由 scripts/verify-render.mjs 的
 * elementFromPoint 断言兜）。
 */
describe('FlagshipSearch：建议列表的关闭路径（发现 15）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    const s = useStart2Store()
    // 两条都能被关键字「金」命中，键盘上下移动才有可移动的余地
    s.shipList = {
      78: { id: 78, name: '金剛', yomi: 'こんごう' },
      79: { id: 79, name: '金剛改', yomi: 'こんごうかい' },
    } as never
    useDevelopmentStore().developmentPools = createPools([
      { 开发池名称: '金刚池', 开发池ID: 1, 舰ID: [78, 79], 出货率: {} },
    ])
  })
  afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; vi.unstubAllGlobals() })

  it('按 Escape 收起建议列表', async () => {
    const el = mount()
    expect((await type(el, '金')).length).toBeGreaterThan(0)

    const input = el.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()

    expect(el.querySelectorAll('.suggestions li')).toHaveLength(0)
  })

  it('输入框失焦后收起建议列表', async () => {
    const el = mount()
    expect((await type(el, '金')).length).toBeGreaterThan(0)

    const input = el.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new FocusEvent('blur'))
    await nextTick()

    expect(el.querySelectorAll('.suggestions li')).toHaveLength(0)
  })

  // ⚠️ 上面那条「失焦即关闭」会引入一个 **jsdom 测不出来** 的回归：
  // 真实浏览器点 <li> 的事件序列是 mousedown → blur → mouseup → click，
  // 失焦关闭会在 click 落地**之前**把 <li> 从 DOM 上摘掉，点击于是永远
  // 送不到 choose()。而 jsdom 的 li.click() 只派发 click、不派发
  // mousedown/blur，所以既有那条「点建议项能选中」的用例照样全绿。
  //
  // 这里手工复刻真实序列（mousedown 可取消 → 未被 preventDefault 才 blur），
  // 断言的是「click 还有机会落地」这个前置条件，而不是 click 本身——
  // 因为在 jsdom 里对一个已被摘除的节点调 click() 依然会命中 Vue 挂在它
  // 上面的监听器，断言 click 的结果反而测不出这个回归。
  it('点建议项：mousedown 不得让建议项在 click 落地前消失', async () => {
    const el = mount()
    expect((await type(el, '金')).length).toBeGreaterThan(0)

    const input = el.querySelector('input') as HTMLInputElement
    const li = el.querySelector('.suggestions li') as HTMLLIElement

    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    li.dispatchEvent(mousedown)
    // 浏览器只在 mousedown 未被 preventDefault 时才移动焦点
    if (!mousedown.defaultPrevented) input.dispatchEvent(new FocusEvent('blur'))
    await nextTick()

    expect(el.contains(li)).toBe(true)
  })
})

/**
 * 键盘可达性（round5 发现 23）。
 *
 * 改造前建议列表对纯键盘用户完全不可用：<li> 既不是原生可聚焦元素、也没有
 * tabindex，组件里更没有任何 keydown 处理——真实 Chrome 实测按 Tab 焦点
 * 直接从 #flagship 跳到 #fuel，把整个列表跳过去，「按舰名反查归属开发池」
 * 这条本页唯一入口纯键盘够不着。
 */
describe('FlagshipSearch：键盘导航（发现 23）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    const s = useStart2Store()
    s.shipList = {
      78: { id: 78, name: '金剛', yomi: 'こんごう' },
      79: { id: 79, name: '金剛改', yomi: 'こんごうかい' },
    } as never
    useDevelopmentStore().developmentPools = createPools([
      { 开发池名称: '金刚池', 开发池ID: 1, 舰ID: [78, 79], 出货率: {} },
    ])
  })
  afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; vi.unstubAllGlobals() })

  const press = (el: HTMLElement, key: string) => {
    ;(el.querySelector('input') as HTMLInputElement)
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    return nextTick()
  }

  it('ArrowDown 高亮第一项，Enter 选中它', async () => {
    const el = mount()
    expect(await type(el, '金')).toHaveLength(2)

    await press(el, 'ArrowDown')
    await press(el, 'Enter')

    const input = el.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('金剛')
    expect(el.querySelectorAll('.suggestions li')).toHaveLength(0)
  })

  // ARIA 1.2 的 combobox + listbox 契约。焦点留在 input 上，"当前是哪一项"
  // 由 aria-activedescendant 指过去——所以 <li> 不需要 tabindex。
  it('展开时暴露 combobox / listbox / option 语义，activedescendant 指向高亮项', async () => {
    const el = mount()
    await type(el, '金')
    await press(el, 'ArrowDown')

    const input = el.querySelector('input') as HTMLInputElement
    const list = el.querySelector('.suggestions') as HTMLUListElement
    const options = [...el.querySelectorAll('.suggestions li')] as HTMLLIElement[]

    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-controls')).toBe(list.id)
    expect(list.id).not.toBe('')
    expect(list.getAttribute('role')).toBe('listbox')
    expect(options.map((o) => o.getAttribute('role'))).toEqual(['option', 'option'])

    // 高亮在第一项：activedescendant 必须指向它、且只有它 aria-selected
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false'])
  })

  it('收起时 aria-expanded 为 false，且不再残留 activedescendant', async () => {
    const el = mount()
    await type(el, '金')
    await press(el, 'ArrowDown')
    await press(el, 'Escape')

    const input = el.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })

  // 高亮下标是相对**当前**建议列表的。继续打字会换掉整个列表，旧下标要么
  // 指向另一艘舰（Enter 选错船），要么直接越界（activeOptionId 取到
  // undefined.id 而抛错）。两种都必须由「一改输入就重置」堵掉。
  it('继续输入缩小结果后不残留越界高亮', async () => {
    const el = mount()
    expect(await type(el, '金')).toHaveLength(2)
    await press(el, 'ArrowDown')
    await press(el, 'ArrowDown') // 高亮落在第 2 项

    expect(await type(el, '金剛改')).toHaveLength(1) // 列表缩到 1 项，旧下标越界

    const input = el.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-activedescendant')).toBeNull()

    // 此时按 Enter 不该选中任何东西——没有高亮项
    await press(el, 'Enter')
    expect(input.value).toBe('金剛改')
  })

  // 「一改输入就重置」堵不住这条：译名维度让 suggestions 也随**语言**变化，
  // 而语言切换不经过 onInput。列表在用户没碰键盘的情况下自己缩短，旧下标
  // 同样会越界。
  it('语言切换让建议列表缩短时，高亮不越界', async () => {
    const table = { en: { 78: 'X-one', 79: 'X-two' }, 'zh-Hans': { 78: 'X-one', 79: '别的' } }
    const stub = (locale: 'en' | 'zh-Hans') =>
      vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok: true, status: 200,
        json: async () => (String(url).includes('ships.json') ? table[locale] : { 1: 'x' }),
      } as unknown as Response)))

    stub('en')
    await setLocale('en')

    const el = mount()
    expect(await type(el, 'X')).toHaveLength(2)
    await press(el, 'ArrowDown')
    await press(el, 'ArrowDown') // 高亮落在第 2 项

    stub('zh-Hans')
    await setLocale('zh-Hans')
    await nextTick()

    // 79 的译名不再含 X，列表缩到 1 项；旧下标 1 已越界
    expect(el.querySelectorAll('.suggestions li')).toHaveLength(1)
    const input = el.querySelector('input') as HTMLInputElement
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })
})

/**
 * 「当前跟踪着哪艘秘书舰」的单一真值源（round5 发现 21）。
 *
 * 改造前这件事有两个真值源：子组件本地的 resolved（一改输入就清空）决定
 * 那条归属池提示显不显示，父组件的 flagshipPoolName（只写不清）决定它显示
 * 「相符」还是「不符」。后者**没有任何清空点**，于是用户编辑搜索框之后，
 * 父组件仍然记着一艘早已不在跟踪的舰的归属池。
 *
 * 这份分歧当前不可见（resolved 为 null 时那条 <p> 整个不渲染），所以这里
 * 钉的是组件间的契约本身——子组件停止跟踪时必须通知父组件——而不是某个
 * 当下能看到的错误呈现。
 */
describe('FlagshipSearch：停止跟踪秘书舰时通知父组件（发现 21）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    const s = useStart2Store()
    s.shipList = { 78: { id: 78, name: '金剛', yomi: 'こんごう' } } as never
    useDevelopmentStore().developmentPools = createPools([
      { 开发池名称: '金刚池', 开发池ID: 1, 舰ID: [78], 出货率: {} },
    ])
  })
  afterEach(() => { app?.unmount(); host?.remove(); app = null; host = null; vi.unstubAllGlobals() })

  // trackedPool 由父组件持有，所以这里显式传它进来扮演父组件的角色——
  // 单独挂子组件而不传，测的就不是这个契约了。
  function mountTracking(trackedPool: string | null) {
    const onClear = vi.fn()
    host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(FlagshipSearch, { matched: true, trackedPool, onClear })
    app.mount(host)
    return onClear
  }

  it('正在跟踪某舰时编辑输入框：emit clear，让父组件放下那份归属池', async () => {
    const onClear = mountTracking('金刚池')
    await type(host as HTMLElement, '金')
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('没在跟踪任何舰时敲字：不 emit clear（否则每个按键都抛一次空通知）', async () => {
    const onClear = mountTracking(null)
    await type(host as HTMLElement, '金')
    expect(onClear).not.toHaveBeenCalled()
  })
})
