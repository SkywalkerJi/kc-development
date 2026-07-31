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
