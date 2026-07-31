// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStart2Store } from '@/stores/start2Store'
import { t, equipName, shipName, setLocale, currentLocale, __resetI18nForTest } from '@/i18n'

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
})
