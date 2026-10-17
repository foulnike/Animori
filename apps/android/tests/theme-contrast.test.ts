// Контраст токенов: WCAG 2.1 AA (4.5:1 для обычного текста) считается инструментально по парам
// «текстовая роль × поверхность» для всех трёх тем продукта. Глазом не сверить: роли dim/faint/status —
// обычный текст в 13 px, а живут они и на фоне окна, и на панелях. Полупрозрачное значение
// композируется поверх непрозрачной подложки — так его и рисует браузер.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/** Три скина: тёмная висит и на :root, и на атрибуте; две другие — только на атрибуте. */
const SKINS = ['dark', 'light', 'amoled'] as const

/** Текстовые роли: всё, что уходит в разметку как color — и заголовки, и статусы. */
const FOREGROUNDS = [
  'am-text',
  'am-dim',
  'am-faint',
  'am-accent',
  'am-accent-2',
  'am-good',
  'am-warn',
  'am-bad',
] as const

/** Поверхности под текстом: фон окна, его подложка и две панели. Стекло, аврора и завеса
 *  плеера полупрозрачны или лежат поверх чужого фона — их пара одними токенами не выражена. */
const SURFACES = ['am-bg', 'am-bg-2', 'am-panel', 'am-panel-2'] as const

/** WCAG 2.1 AA — обычный текст (14 px без полужирного). */
const AA_TEXT = 4.5

type Tokens = Record<string, string>
type Skin = (typeof SKINS)[number]
type Rgb = readonly [number, number, number, number]

const themeCss = readFileSync(join(import.meta.dirname, '../src/app/styles/theme.css'), 'utf8')
const clean = themeCss.replace(/\/\*[\s\S]*?\*\//g, '')

function declsOf(body: string): Tokens {
  const out: Tokens = {}
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) out[name] = value.trim()
  }
  return out
}

function blockOf(skin: Skin): string {
  const pattern =
    skin === 'dark'
      ? /:root,\s*\[data-am-skin='dark'\]\s*\{([^}]*)\}/
      : new RegExp(`\\[data-am-skin='${skin}'\\]\\s*\\{([^}]*)\\}`)
  return clean.match(pattern)?.[1] ?? ''
}

/** Тёмная задаёт цвета для всех трёх: две остальные — только переопределения поверх неё. */
const themes: Record<Skin, Tokens> = {
  dark: declsOf(blockOf('dark')),
  light: { ...declsOf(blockOf('dark')), ...declsOf(blockOf('light')) },
  amoled: { ...declsOf(blockOf('dark')), ...declsOf(blockOf('amoled')) },
}

function colorOf(raw: string | undefined, tokens: Tokens, depth = 0): Rgb | null {
  if (raw === undefined || depth > 8) return null
  const value = raw.trim()
  const ref = value.match(/^var\((--[\w-]+)\)$/)?.[1]
  if (ref !== undefined) return colorOf(tokens[ref], tokens, depth + 1)
  if (value === 'transparent') return [0, 0, 0, 0]

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1]
  if (hex !== undefined) {
    let digits = hex
    if (digits.length === 3)
      digits = digits
        .split('')
        .map((c) => c + c)
        .join('')
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
      digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    ]
  }

  const rgb = value.match(/^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/)
  if (rgb) {
    const alpha =
      rgb[4] === undefined
        ? 1
        : rgb[4].endsWith('%')
          ? Number(rgb[4].slice(0, -1)) / 100
          : Number(rgb[4])
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha]
  }

  return null
}

function over(fg: Rgb, bg: Rgb): Rgb {
  return [
    fg[0] * fg[3] + bg[0] * (1 - fg[3]),
    fg[1] * fg[3] + bg[1] * (1 - fg[3]),
    fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    1,
  ]
}

function luminance([r, g, b]: Rgb): number {
  const channel = (x: number): number => {
    const s = x / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: Rgb, b: Rgb): number {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}

describe('разбор темы', () => {
  it('все три темы собраны и полны', () => {
    for (const skin of SKINS) {
      expect(
        Object.keys(themes[skin]).length,
        `тема ${skin}: блок не найден или пуст`,
      ).toBeGreaterThanOrEqual(35)
    }
  })
})

describe.each(SKINS)('контраст темы %s', (skin) => {
  const tokens = themes[skin]

  it.each(FOREGROUNDS)('--%s держит 4.5:1 на всех поверхностях', (foreground) => {
    const low: string[] = []
    for (const surface of SURFACES) {
      const fg = colorOf(`var(--${foreground})`, tokens)
      const bg = colorOf(`var(--${surface})`, tokens)
      expect(fg, `--${foreground}: значение не распознано как цвет`).not.toBeNull()
      expect(bg, `--${surface}: значение не распознано как цвет`).not.toBeNull()
      if (fg === null || bg === null) continue
      const value = ratio(over(fg, bg), bg)
      if (value < AA_TEXT) low.push(`--${surface}: ${value.toFixed(2)}`)
    }
    expect(low, `${skin}: --${foreground} ниже 4.5:1 — ${low.join(', ')}`).toHaveLength(0)
  })

  it('чернила на сакуре держат 4.5:1', () => {
    // Чернил в теме может не быть вовсе (на TV нет знака поверх обложки) — сверяем только заведённые.
    if (tokens['am-on-sakura'] === undefined || tokens['am-sakura'] === undefined) return
    const ink = colorOf('var(--am-on-sakura)', tokens)
    const sakura = colorOf('var(--am-sakura)', tokens)
    expect(ink, '--am-on-sakura: значение не распознано как цвет').not.toBeNull()
    expect(sakura, '--am-sakura: значение не распознано как цвет').not.toBeNull()
    if (ink === null || sakura === null) return
    const value = ratio(over(ink, sakura), sakura)
    expect(
      value,
      `${skin}: --am-on-sakura на --am-sakura — ${value.toFixed(2)}`,
    ).toBeGreaterThanOrEqual(AA_TEXT)
  })
})
