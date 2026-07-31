// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStart2Store } from '@/stores/start2Store'
import { useDevelopmentStore } from '@/stores/developmentStore'
import {
  t, equipName, shipName, ctypeName, stypeName, setLocale, initLocale, currentLocale,
  localeSwitchFailed, localeSwitchFailedAttempt, __resetI18nForTest,
} from '@/i18n'

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
    // 表本身必须非空（Fix 4 之后 {} 会被 isValidNameTable 拒绝、setLocale
    // 直接失败），但里面不含 id=1——这样才是在验证"切换真的成功了、只是
    // 这一个 ID 没有译名，查表落空后按设计回退日文原名"，而不是
    // "setLocale 干脆没成功，随便什么 locale 下缺表都会回退"这种假阳性。
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': { 999: 'Unrelated' }, 'i18n/en/ships.json': { 999: 'Unrelated' }, 'i18n/en/ctype.json': { 999: 'Unrelated' },
    }))
    const ok = await setLocale('en')
    expect(ok).toBe(true)
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

  // P1（本轮修复）：HTTP 200 + 响应体是合法但形状不对的 JSON（陈旧 CDN 缓存
  // 条目吐出 null、反代错误页恰好是合法 JSON）此前会穿过 fetchJson()，被
  // setLocale 当成"三份都成功"直接发布——equipName()/shipName() 要到下一次
  // 渲染读表时才会因为 null 不是预期形状而炸，此时 locale 已经切换过去了，
  // "失败就不切换"这条原子发布保证名存实亡。这里用与上一条用例完全相同的
  // 断言（返回值、currentLocale、文案、equipName），只把"HTTP 失败"换成
  // "HTTP 成功但 body 是 null"，验证两种失败被同等对待——校验逻辑本身在
  // src/i18n/names/load.spec.ts 里已经覆盖了每条具体的拒绝路径，这里只确认
  // 它真的接进了 setLocale 的原子发布链路，不是校验函数写好了但没人调用。
  it('HTTP 200 但响应体是 null（陈旧缓存/错误页）时，与 HTTP 失败同等对待，整体不切换', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('ships.json')
        ? ({ ok: true, status: 200, json: async () => null } as unknown as Response)
        : ({ ok: true, status: 200, json: async () => ({ 1: 'X' }) } as unknown as Response)))
    const ok = await setLocale('en')
    expect(ok).toBe(false)
    expect(currentLocale.value).toBe('zh-Hans')
    expect(t('label.fuel')).toBe('油')
    expect(equipName(1)).toBe('12cm単装砲')
    expect(shipName(78)).toBe('金剛')
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
      // 'x-testing' 是 BCP 47 的 private-use 单例子标签（主语言部分只有一个
      // 字母 'x'），语法上就不是个合法的语言子标签，detectLocale 识别不出。
      // 不能再用 'xx-YY'：Fix A（src/i18n/detect.ts）把「是否识别到了」的
      // 判断从白名单换成了纯语法校验，'xx' 满足「2-3 个字母」的形状，
      // 会被当成识别到了、直接归英文，这个用例就名不副实了。
      vi.stubGlobal('navigator', { languages: ['x-testing'], language: 'x-testing' })
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

  // Fix B（headless-Chrome 复核发现）：initLocale 冷启动失败时，此前用户界面
  // 上什么提示都看不到，也没有任何入口能重新触发那次失败的加载——不是因为
  // setLocale 的短路条件挡住了重试（`next === localeRef.value && loaded.value`
  // 在 loaded 为 false 时本就不短路），而是失败态从未被暴露到 doSwitch 之外，
  // LocaleSwitcher 的错误横幅只在它自己发起的调用里赋值。这里覆盖完整链路：
  // 冷启动失败 → 共享错误状态（localeSwitchFailed/localeSwitchFailedAttempt）
  // 可见 → 用状态里记录的 target/persist 重试 → 成功后错误状态清空。
  //
  // 用 fetch 调用次数而不是"返回值为 true"来判定重试是否"真的"发生：若重试
  // 被短路条件悄悄吃掉、直接回放上次的（失败）结果，返回值也可能凑巧看着
  // 合理，只有调用次数能区分"真的又发了一轮请求"与"压根没发请求"。
  it('initLocale 加载失败 → 错误可见 → 重试 → 成功后错误清空（且确认重试真的重新发起了请求）', async () => {
    vi.stubGlobal('navigator', { languages: ['en'], language: 'en' })
    let shouldFail = true
    // "成功" 分支的内容与这条用例无关（只关心失败/重试的状态机），但
    // Fix 4 之后真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable
    // 拒绝，"成功" 分支会变回失败，下面 expect(ok).toBe(true) 就假不了。
    const fetchMock = vi.fn(async () =>
      shouldFail
        ? ({ ok: false, status: 500 } as unknown as Response)
        : ({ ok: true, status: 200, json: async () => ({ 1: 'x' }) } as unknown as Response))
    vi.stubGlobal('fetch', fetchMock)

    await initLocale()
    expect(localeSwitchFailed.value).toBe(true)
    // persist 原样保留成 initLocale 当初传入的 false —— 重试不该凭空变成
    // "用户主动选择"。
    expect(localeSwitchFailedAttempt.value).toEqual({ target: 'en', persist: false })
    expect(currentLocale.value).toBe('zh-Hans') // 失败，仍停在冷启动前的默认语言
    const callsAfterFailure = fetchMock.mock.calls.length
    expect(callsAfterFailure).toBeGreaterThan(0)

    // 重试：原样重放 localeSwitchFailedAttempt 记录的 target/persist，
    // 与 LocaleSwitcher 的重试按钮（onRetry）走的是同一条路径。
    shouldFail = false
    const attempt = localeSwitchFailedAttempt.value!
    const ok = await setLocale(attempt.target, attempt.persist)

    expect(ok).toBe(true)
    // 真的重新发起了一轮请求，不是被短路条件吞掉、直接回放旧结果。
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFailure)
    expect(localeSwitchFailed.value).toBe(false)
    expect(localeSwitchFailedAttempt.value).toBeNull()
    expect(currentLocale.value).toBe('en')
    // persist 重放的是 false（initLocale 当初传入的值），重试成功也不该把
    // 这次探测结果写进 localStorage——否则就是设计稿 §6 点名要避免的那个
    // 退化："记住选择"变成"缓存探测结果"。
    expect(localStorage.getItem('kc-development.locale')).toBeNull()
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
      // items/ships 内容与这条用例无关（只关心 ctype），但 Fix 4 之后
      // 真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable 拒绝。
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': { 1: 'x' }, 'i18n/en/ships.json': { 1: 'x' }, 'i18n/en/ctype.json': { 6: 'Kongou Class' },
      }))
      const ok = await setLocale('en')
      expect(ok).toBe(true)
      expect(ctypeName(6)).toBe('Kongou Class')
    })

    it('非 zh-Hans 未命中返回空串', async () => {
      // ctype 表非空但不含 999——这样才是在验证"表加载成功、只是没有这个
      // ID"，而不是"setLocale 干脆没成功"这种假阳性（Fix 4 之后 {} 会被
      // isValidNameTable 拒绝，setLocale 会直接失败）。
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': { 1: 'x' }, 'i18n/en/ships.json': { 1: 'x' }, 'i18n/en/ctype.json': { 6: 'Kongou Class' },
      }))
      const ok = await setLocale('en')
      expect(ok).toBe(true)
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
    // 内容与这条用例无关（只关心并发请求次数与返回值），但 Fix 4 之后
    // 真实发起的请求不能再用 {} 糊弄——空表会被 isValidNameTable 拒绝。
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      await gate
      return { ok: true, status: 200, json: async () => ({ 1: 'x' }) } as unknown as Response
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

  // Fix 3：stypeName 此前只在 DevelopmentView.spec.ts 里被间接测过 zh-Hans
  // 分支，ja 分支（连同 Fix 2 新加的 FBB 覆盖）与回退到原始代码的路径完全
  // 没有覆盖。这里补齐四条路径。
  describe('stypeName', () => {
    it('zh-Hans 走 STYPE_NAMES 表', () => {
      expect(stypeName('DD')).toBe('驱逐舰')
    })

    it('en 走 STYPE_NAMES 表，保留缩写本身', async () => {
      // 内容与这条用例无关（stypeName 走的是 STYPE_NAMES 常量表，不读这三
      // 张名称表），但 Fix 4 之后真实发起的请求不能再用 {} 糊弄——空表会
      // 被 isValidNameTable 拒绝，setLocale 会失败、locale 根本切不到 en。
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': { 1: 'x' }, 'i18n/en/ships.json': { 1: 'x' }, 'i18n/en/ctype.json': { 1: 'x' },
      }))
      const ok = await setLocale('en')
      expect(ok).toBe(true)
      expect(stypeName('DD')).toBe('DD')
    })

    it('非 ja 未命中回退代码本身（STYPE_NAMES 是封闭集合，没有第二条回退路径）', () => {
      expect(stypeName('ZZ')).toBe('ZZ')
    })

    describe('ja：从 api_mst_stype 派生（含 Fix 2 的 FBB 覆盖）', () => {
      async function toJa() {
        // 内容与这组用例无关（stypeName 的 ja 分支读的是 api_mst_stype，
        // 不读 ctype 表），但 ja 仍然会真实发起 ctype.json 请求（见
        // load.ts 的 wantCtype），Fix 4 之后 {} 会被 isValidNameTable
        // 拒绝，setLocale 会失败、locale 根本切不到 ja。
        vi.stubGlobal('fetch', mockFetchOk({ 'i18n/ja/ctype.json': { 1: 'x' } }))
        const ok = await setLocale('ja')
        if (!ok) throw new Error('setLocale(ja) 应当成功——测试 fixture 本身坏了')
      }

      it('正常代码：查 ShipType 拿 stype 序数，再查 api_mst_stype 拿日文名', async () => {
        const s = useStart2Store()
        s.api_mst_stype = [{ api_id: 2, api_name: '駆逐艦' }] as never
        await toJa()
        expect(stypeName('DD')).toBe('駆逐艦')
      })

      // 这条是 Fix 2 本身的回归测试：若把覆盖删掉、或者不小心放到了
      // api_mst_stype.find 之后，FBB 会跟 BB 一样查到「戦艦」，两个断言的
      // 后半句就会失败。
      it('FBB 与 BB 在 api_mst_stype 里都是「戦艦」，但 stypeName 不应该撞车', async () => {
        const s = useStart2Store()
        s.api_mst_stype = [
          { api_id: 8, api_name: '戦艦' },
          { api_id: 9, api_name: '戦艦' },
        ] as never
        await toJa()
        expect(stypeName('FBB')).toBe('高速戦艦')
        expect(stypeName('BB')).toBe('戦艦')
      })

      // api_mst_stype 为空时 FBB 依然拿到覆盖值——证明覆盖判断发生在
      // api_mst_stype.find 之前、不依赖那次查找的结果。若覆盖被挪到了
      // find 之后当"兜底"，这条会失败（能命中覆盖的代码走不到这里）。
      it('FBB 覆盖不依赖 api_mst_stype 里有没有数据', async () => {
        const s = useStart2Store()
        s.api_mst_stype = [] as never
        await toJa()
        expect(stypeName('FBB')).toBe('高速戦艦')
      })

      it('ShipType 里没有的代码回退代码本身', async () => {
        await toJa()
        expect(stypeName('ZZ')).toBe('ZZ')
      })

      it('ShipType 里有、但 api_mst_stype 查不到对应记录时回退代码本身', async () => {
        const s = useStart2Store()
        s.api_mst_stype = [] as never
        await toJa()
        expect(stypeName('DD')).toBe('DD')
      })
    })
  })

  // Fix 7：localStorage 只应该记录用户真正做出的选择，不该缓存启动时的
  // 探测结果——见 i18n/index.ts 里 setLocale/initLocale 的 persist 参数。
  describe('localStorage 持久化：只在显式切换时写，探测驱动的切换不写', () => {
    it('显式 setLocale 会写 localStorage', async () => {
      // 内容本身与这条用例无关（只关心 localStorage 有没有被写），但 Fix 4
      // 之后真实发起的请求不能再用 {} 糊弄——空表现在会被 isValidNameTable
      // 拒绝，setLocale 会失败、根本不会走到写 localStorage 那一步。随便给
      // 一条非空内容，只是为了让 setLocale 本身能成功。
      vi.stubGlobal('fetch', mockFetchOk({
        'i18n/en/items.json': { 1: 'X' }, 'i18n/en/ships.json': { 1: 'X' }, 'i18n/en/ctype.json': { 1: 'X' },
      }))
      await setLocale('en')
      expect(localStorage.getItem('kc-development.locale')).toBe('en')
    })

    it('initLocale 靠探测选中语言时不写 localStorage', async () => {
      // 探测到 ja（而不是默认的 zh-Hans），确保这次切换确实执行了、
      // 不是被"locale 没变"的短路跳过——那样的话"没写"就什么也证明不了。
      vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' })
      // 同上一条用例：内容与这条用例无关，只是 {} 现在会被拒绝，换成非空。
      vi.stubGlobal('fetch', mockFetchOk({ 'i18n/ja/ctype.json': { 1: 'X' } }))
      await initLocale()
      expect(currentLocale.value).toBe('ja')
      expect(localStorage.getItem('kc-development.locale')).toBeNull()
    })
  })

  // Fix 10：index.html 的静态 <title> 只覆盖首帧；语言切换后标签页标题也要
  // 跟着变，否则 en/ja/zh-Hant 用户会一直看到 zh-Hans 的标题。
  it('切换语言后 document.title 跟着变成对应语言的 title.app', async () => {
    // 同上：内容与这条用例无关，{} 现在会被 isValidNameTable 拒绝，换成非空。
    vi.stubGlobal('fetch', mockFetchOk({
      'i18n/en/items.json': { 1: 'X' }, 'i18n/en/ships.json': { 1: 'X' }, 'i18n/en/ctype.json': { 1: 'X' },
    }))
    await setLocale('en')
    expect(document.title).toBe(t('title.app'))
    expect(document.title).toBe('Equipment Development')
  })
})
