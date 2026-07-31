// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import { t, equipName, shipName, ctypeName, setLocale, initLocale, currentLocale, __resetI18nForTest } from '@/i18n'

function mockFetchOk(tables: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(tables).find((k) => String(url).includes(k))
    if (!key) throw new Error(`未预期的请求: ${url}`)
    return { ok: true, status: 200, json: async () => tables[key] } as unknown as Response
  })
}

describe('i18n 门面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    __resetI18nForTest()
    // 清掉上一个用例可能写入的 'kc-development.locale'：initLocale 相关的
    // 用例依赖 localStorage 为空才会走到 navigator 探测分支，jsdom 的
    // localStorage 在同一测试文件内的多个用例之间是共享/持久的，不清会
    // 出现"这个用例其实读到了上一个用例 setLocale 写入的值"这种顺序耦合。
    localStorage.clear()
    const s = useStart2Store()
    s.equipList = { 1: { id: 1, name: '12cm単装砲' } } as never
    s.shipList = { 78: { id: 78, name: '金剛' } } as never
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('默认 zh-Hans，t() 取对应文案', () => {
    expect(currentLocale.value).toBe('zh-Hans')
    expect(t('label.fuel')).toBe('油')
  })

  it('名称表未加载时，装备名/舰名回退 start2 的日文原名', () => {
    expect(equipName(1)).toBe('12cm単装砲')
    expect(shipName(78)).toBe('金剛')
  })

  it('切换成功后同时换掉文案与名称，并写 <html lang>', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': { 1: '12cm Single Gun Mount' },
      'i18n/en/ships.json': { 78: 'Kongou' },
      'i18n/en/ctype.json': { 6: 'Kongou Class' },
    }))
    const ok = await setLocale('en')
    expect(ok).toBe(true)
    expect(currentLocale.value).toBe('en')
    expect(t('label.fuel')).toBe('Fuel')
    expect(equipName(1)).toBe('12cm Single Gun Mount')
    expect(document.documentElement.lang).toBe('en')
  })

  it('名称表里没有的 ID 仍回退日文原名，不显示空串', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
    }))
    await setLocale('en')
    expect(equipName(1)).toBe('12cm単装砲')
  })

  it('任一文件失败则整体不切换 —— 不出现「装备名换了、舰名还是旧的」', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('ships.json')
        ? ({ ok: false, status: 404 } as unknown as Response)
        : ({ ok: true, status: 200, json: async () => ({ 1: 'X' }) } as unknown as Response)))
    const ok = await setLocale('en')
    expect(ok).toBe(false)
    expect(currentLocale.value).toBe('zh-Hans')
    expect(t('label.fuel')).toBe('油')
    expect(equipName(1)).toBe('12cm単装砲')
  })

  it('切到 ja 不请求 items/ships（日文名取自 start2），只请求 ctype', async () => {
    const f = mockFetchOk({ 'i18n/ja/ctype.json': { 6: '金剛型' } })
    vi.stubGlobal('fetch', f)
    expect(await setLocale('ja')).toBe(true)
    expect(f.mock.calls.every((c) => String(c[0]).includes('ctype.json'))).toBe(true)
    expect(equipName(1)).toBe('12cm単装砲')
  })

  // Finding 1：localeRef 的初值 'zh-Hans' 不能被当成"已经加载过简体名称表"
  // 的证据。冷启动时浏览器语言探测成 zh-Hans（或探测不出、兜底成 zh-Hans）
  // 的用户，initLocale 必须真的发一次 setLocale，把 tables 从
  // EMPTY_NAME_TABLES 换成磁盘上的简体名称表——不能因为"locale 没变"就
  // 短路掉。这两个用例分别覆盖"探测到 zh-Hans"和"探测不出、兜底 zh-Hans"
  // 两条路径，回归时都会看见 equipName 停在日文原名而不是简体译名。
  describe('initLocale：冷启动必须真正加载当前语言的名称表', () => {
    function stubZhHansFetch() {
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/zh-Hans/items.json': { 1: '12cm单装炮' },
        'i18n/zh-Hans/ships.json': { 78: '金刚' },
      }))
    }

    it('navigator.languages 明确探测到 zh-Hans', async () => {
      vi.stubGlobal('navigator', { languages: ['zh-CN'], language: 'zh-CN' })
      stubZhHansFetch()
      await initLocale()
      expect(currentLocale.value).toBe('zh-Hans')
      expect(equipName(1)).toBe('12cm单装炮')
      expect(shipName(78)).toBe('金刚')
    })

    it('navigator.languages 探测不出任何已知语言，兜底 zh-Hans', async () => {
      vi.stubGlobal('navigator', { languages: ['xx-YY'], language: 'xx-YY' })
      stubZhHansFetch()
      await initLocale()
      expect(currentLocale.value).toBe('zh-Hans')
      expect(equipName(1)).toBe('12cm单装炮')
    })
  })

  // Finding 2：initLocale 不能在"切换是否成功"揭晓之前就把 <html lang> 写成
  // 目标语言——那正是半切换态本身（lang 已经是新语言，localeRef/tables 还
  // 是旧语言），只是发生在应用启动这一刻而不是用户手动点切换。
  it('initLocale：加载失败时 <html lang> 停在切换前的语言，不停在目标语言', async () => {
    vi.stubGlobal('navigator', { languages: ['en'], language: 'en' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 } as unknown as Response)))
    await initLocale()
    // 冷启动前 localeRef 是默认值 zh-Hans；加载 en 失败，两者都不该变成 en。
    expect(currentLocale.value).toBe('zh-Hans')
    expect(document.documentElement.lang).toBe('zh-Hans')
  })

  // Finding 3：ctypeName 没有"回退日文原名"这条路——ctypeMap／ctype 表本身
  // 就是自洽的（sync-i18n 已经把查不到译名的条目填成日文原文），运行时不
  // 存在另一份可回退的日文来源。这里补上此前完全没有的覆盖：zh-Hans 分支
  // 读 developmentStore.ctypeMap、非 zh-Hans 分支读加载进来的 ctype 表、
  // 两个分支各自的未命中都应该是空串而不是抛错或显示占位符。
  describe('ctypeName', () => {
    it('zh-Hans 走 developmentStore.ctypeMap', () => {
      const d = useDevelopmentStore()
      d.ctypeMap = { '6': '金刚级' }
      expect(ctypeName(6)).toBe('金刚级')
    })

    it('zh-Hans 未命中返回空串（没有运行时可回退的日文源）', () => {
      const d = useDevelopmentStore()
      d.ctypeMap = {}
      expect(ctypeName(999)).toBe('')
    })

    it('非 zh-Hans 走加载进来的 ctype 表', async () => {
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': { 6: 'Kongou Class' },
      }))
      await setLocale('en')
      expect(ctypeName(6)).toBe('Kongou Class')
    })

    it('非 zh-Hans 未命中返回空串', async () => {
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': {}, 'i18n/en/ships.json': {}, 'i18n/en/ctype.json': {},
      }))
      await setLocale('en')
      expect(ctypeName(999)).toBe('')
    })
  })

  // Finding 4：并发调用同一目标语言的 setLocale，两次调用都必须诚实反映
  // 最终结果——不能因为后来者撞见 pending 就直接判 false，把一次正在成功
  // 进行中的切换报告成失败（Task 4 的切换器用返回值取反当"切换失败"标志，
  // 假 false 会让用户看到一条错误的失败提示）。同时只应该发一轮网络请求：
  // 后来者复用前者的 promise，不重新触发 loadNameTables。
  it('并发对同一目标的两次 setLocale 都应 resolve true，且只发一轮网络请求', async () => {
    let releaseFetch!: () => void
    const gate = new Promise<void>((resolve) => { releaseFetch = resolve })
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      await gate
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
    }))

    const p1 = setLocale('en')
    const p2 = setLocale('en')
    releaseFetch()
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe(true)
    expect(r2).toBe(true)
    // en 一轮请求是 items + ships + ctype 三个文件；若并发触发了第二轮，
    // 这里会看到 6 次调用而不是 3 次。
    expect(calls.length).toBe(3)
  })
})
