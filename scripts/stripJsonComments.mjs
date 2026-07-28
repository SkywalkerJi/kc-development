/**
 * 剥离 JSON 中的块注释与行注释，用空格替换以保持字符偏移不变。
 * 用状态机而非正则：字符串字面量内部的 `/*` `//` 必须原样保留。
 */
export function stripJsonComments(text) {
  const out = Array.from(text)
  let inString = false
  let escaped = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      i++
      continue
    }

    if (c === '"') { inString = true; i++; continue }

    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      for (let k = i; k < stop; k++) if (out[k] !== '\n') out[k] = ' '
      i = stop
      continue
    }

    if (c === '/' && text[i + 1] === '/') {
      let stop = i
      while (stop < text.length && text[stop] !== '\n') stop++
      for (let k = i; k < stop; k++) out[k] = ' '
      i = stop
      continue
    }

    i++
  }

  return out.join('')
}
