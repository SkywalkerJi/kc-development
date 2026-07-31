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
      json: async () => (String(url).includes('ships.json') ? { 78: '金刚', 85: '长门' } : {}),
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
      json: async () => (String(url).includes('ships.json') ? { 78: 'Kongou' } : {}),
    } as unknown as Response)))
    await setLocale('en')
    expect((await type(mount(), 'Kongou')).join()).toContain('Kongou')
  })
})
