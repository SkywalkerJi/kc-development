import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadNameTables, isValidNameTable } from '../load'

const I18N_DATA_DIR = join(__dirname, '..', '..', '..', '..', 'public', 'data', 'i18n')

/** 同 src/i18n/__tests__/index.spec.ts 的 mockFetchOk 写法：按 URL 里含哪个
 * 相对路径分发到对应的响应体，不认识的 URL 直接抛错，暴露"发了预期外的请求"
 * 这类问题而不是静默返回 undefined。 */
function mockFetchOk(bodies: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(bodies).find((k) => String(url).includes(k))
    if (key === undefined) throw new Error(`未预期的请求: ${url}`)
    return { ok: true, status: 200, json: async () => bodies[key] } as unknown as Response
  })
}

describe('loadNameTables', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('合法的表原样返回', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: '12cm单装炮', 20: '15.5cm三连装炮' },
      'ships.json': { 78: '金刚' },
      'ctype.json': { 6: '金刚级' },
    }))
    const tables = await loadNameTables('zh-Hant')
    expect(tables).toEqual({
      items: { 1: '12cm单装炮', 20: '15.5cm三连装炮' },
      ships: { 78: '金刚' },
      ctype: { 6: '金刚级' },
    })
  })

  it('跳过的请求（ja 的 items/ships，zh-Hans 的 ctype）解析成 {}，不发请求', async () => {
    const f = mockFetchOk({ 'ctype.json': { 6: '金剛型' } })
    vi.stubGlobal('fetch', f)
    const ja = await loadNameTables('ja')
    expect(ja).toEqual({ items: {}, ships: {}, ctype: { 6: '金剛型' } })
    expect(f.mock.calls.every((c) => String(c[0]).includes('ctype.json'))).toBe(true)

    const f2 = mockFetchOk({ 'items.json': { 1: 'X' }, 'ships.json': { 78: 'Y' } })
    vi.stubGlobal('fetch', f2)
    const zhHans = await loadNameTables('zh-Hans')
    expect(zhHans).toEqual({ items: { 1: 'X' }, ships: { 78: 'Y' }, ctype: {} })
    expect(f2.mock.calls.every((c) => !String(c[0]).includes('ctype.json'))).toBe(true)
  })

  // P1：HTTP 200 但响应体是 null——陈旧 CDN 缓存条目、或恰好解析成功的错误页
  // 都可能长这样。fetchJson() 本身不会因此失败（响应码是 2xx、body 是合法
  // JSON），必须在这一层拦下来，否则会被 setLocale 当成真实数据发布。
  it.each(['items.json', 'ships.json', 'ctype.json'])('%s 的响应体是 null 时整体 reject', async (file) => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: 'X' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' }, [file]: null,
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it('响应体是数组时 reject（不是普通对象）', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': [], 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it('响应体是恰好合法的 JSON 但语义上是错误页（比如反代吐的 {"error":...}）时 reject——键不是规范数值字符串', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { error: 'not found' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it.each(['01', '1.5', '+1', '1e2', ' 1', '1 '])('键是非规范数值字符串 %p 时 reject', async (badKey) => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { [badKey]: 'X' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it('值是空字符串时 reject（空字符串不是"这个 ID 没有译名"的合法表示，缺键才是）', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: '' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it.each([123, null, ['x'], { nested: true }])('值不是字符串（%p）时 reject', async (badValue) => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: badValue }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  // P1（Fix 4）：真的发出过请求、拿到的响应体是空对象时必须 reject，不能
  // 当成"这张表暂时没有条目"放行——en 的三张表若恰好全部拉回 {}（比如
  // 上游目录暂时清空、CDN 缓存了一份空响应），旧版校验会让 setLocale('en')
  // 报成功，界面切换过去之后每一个名字都悄悄回退成日文，用户完全看不出
  // "翻译坏了"和"这门语言真的还没翻译"的区别——这与响应体是 null 时的
  // P1（上面那组 it.each）是同一类故障，只是"看起来像成功"这一步走得更远。
  it.each(['items.json', 'ships.json', 'ctype.json'])('%s 真的发起请求后响应体是空对象 {} 时 reject（不是跳过请求时的占位值）', async (file) => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: 'X' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' }, [file]: {},
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })

  it('isValidNameTable({}) 直接返回 false', () => {
    expect(isValidNameTable({})).toBe(false)
  })

  it('值首尾只有空白（如 " "）时 reject——trim 之后是空字符串，与空字符串是同一种"没有译名"', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      'items.json': { 1: '   ' }, 'ships.json': { 78: 'Y' }, 'ctype.json': { 6: 'Z' },
    }))
    await expect(loadNameTables('en')).rejects.toThrow(/名称表格式不合法/)
  })
})

// 上面几条只在手写的 mock 数据上验证过校验规则——校验规则本身写严了的话，
// 会在 mock 数据上全绿，却把 sync-i18n.mjs 真实产出的数据判成不合法，
// pnpm build 之后用户在生产环境看到的是空白页而不是名称，而这里的测试
// 一条都不会变红。这条用例直接读 public/data/i18n/ 下四语言实际落盘的
// items/ships/ctype.json，逐一喂给 isValidNameTable，与 dataSchema.spec.ts
// 里"正式数据 public/data/xxx.json 完整通过校验"是同一个理由、同一种测试。
describe('isValidNameTable 校验正式产出数据', () => {
  const locales = ['ja', 'zh-Hans', 'zh-Hant', 'en'] as const
  const files = ['items.json', 'ships.json', 'ctype.json'] as const

  for (const locale of locales) {
    for (const file of files) {
      const path = join(I18N_DATA_DIR, locale, file)
      // zh-Hans 不产出 ctype.json（见 load.ts 顶部注释），这个组合本来就
      // 不该存在，跳过而不是断言失败。
      if (locale === 'zh-Hans' && file === 'ctype.json') continue
      // ja 的 items.json/ships.json 磁盘上确实是 {}（日文名真值源是
      // start2.json 本身，见 load.ts 顶部注释），这是"跳过请求"这个决策
      // 的产出，loadNameTables 对 ja 走的是 Promise.resolve({})、从不把
      // 这两个文件的内容喂给 isValidNameTable——它们不属于这条回归测试
      // 想覆盖的"真实产出、经过这个函数校验"的路径，isValidNameTable
      // 现在也确实会对空对象返回 false（见上面 P1 那组用例），在这里对它们
      // 断言 true 会失败，且失败是错的——不是数据坏了，是这两个文件本来
      // 就不该被这样测。
      if (locale === 'ja' && (file === 'items.json' || file === 'ships.json')) continue

      it(`public/data/i18n/${locale}/${file} 通过 isValidNameTable 校验`, () => {
        expect(existsSync(path)).toBe(true)
        const data = JSON.parse(readFileSync(path, 'utf8'))
        expect(isValidNameTable(data)).toBe(true)
      })
    }
  }

  it('zh-Hans 确实没有 ctype.json（回归：不是漏测，是这个组合按设计不存在）', () => {
    expect(existsSync(join(I18N_DATA_DIR, 'zh-Hans', 'ctype.json'))).toBe(false)
  })

  it('ja 的 items.json/ships.json 确实是磁盘上的空对象（回归：不是漏测，是这两个文件按设计为空，见上面循环里的跳过说明）', () => {
    for (const file of ['items.json', 'ships.json']) {
      const data = JSON.parse(readFileSync(join(I18N_DATA_DIR, 'ja', file), 'utf8'))
      expect(data).toEqual({})
    }
  })
})
