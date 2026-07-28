import { describe, it, expect } from 'vitest'
import { stripJsonComments } from '../stripJsonComments.mjs'

describe('stripJsonComments', () => {
  it('剥离块注释', () => {
    const src = '[\r\n  /*****炮战池*****/\r\n  {"a": 1}\r\n]'
    expect(JSON.parse(stripJsonComments(src))).toEqual([{ a: 1 }])
  })

  it('剥离行注释', () => {
    expect(JSON.parse(stripJsonComments('{"a": 1} // 尾注'))).toEqual({ a: 1 })
  })

  it('不动字符串内部的 /* 和 //', () => {
    const src = '{"name": "a/*b*/c", "url": "http://x"}'
    expect(JSON.parse(stripJsonComments(src))).toEqual({ name: 'a/*b*/c', url: 'http://x' })
  })

  it('不被字符串内的转义引号骗过', () => {
    const src = '{"q": "he said \\"/*\\" ok"}'
    expect(JSON.parse(stripJsonComments(src))).toEqual({ q: 'he said "/*" ok' })
  })

  it('保留字符数不变的空白替换，行号不漂移', () => {
    const out = stripJsonComments('{\n/* x */\n}')
    expect(out.split('\n').length).toBe(3)
  })

  it('代理对不会让替换位置漂移（emoji 与 U+20000 面汉字）', () => {
    // 用 Array.from 按码点切分会与按码元计数的索引错位，产出长度变化的结果
    for (const src of ['{"n": "\u{1F6A2}"} /* c */', '{"n": "\u{20000}abc"} /* c */']) {
      const out = stripJsonComments(src)
      expect(out.length).toBe(src.length)
      expect(() => JSON.parse(out)).not.toThrow()
    }
  })
})
