// Проверка кадра розетки сакуры: тот же путь и кадр, что на плитках статистики ПК-билда. Прежний кадр был
// подобран на глаз и срезал правый лепесток на 2.48 единицы, поэтому сверяем кадр пути с viewBox.

import { describe, expect, it } from 'vitest'

import { SAKURA_PETAL, SAKURA_ROSETTE, SAKURA_ROSETTE_BOX, SAKURA_TURNS } from '../src/app/sakura'

/** Границы одной кубической Безье по производной: корни 3at² + 2bt + c = 0. */
function extremumRoots(a: number, b: number, c: number): ReadonlyArray<number> {
  if (Math.abs(a) < 1e-12) {
    return Math.abs(b) < 1e-12 ? [] : [-c / (2 * b)].filter((t) => t > 0 && t < 1)
  }

  const disc = b * b - 4 * a * c
  if (disc < 0) return []

  const root = Math.sqrt(disc)
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter((t) => t > 0 && t < 1)
}

interface Frame {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Настоящий кадр пути: начала подпоследовательностей и крайние точки каждой кубической. */
function pathFrame(d: string): Frame {
  const tokens = d.match(/[MCZ]|-?[\d.]+/g) ?? []
  const frame: Frame = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }

  // Оси разнесены: общий grow(value, 0) для Y подмешивал ноль в границы и портил вертикаль — по X выходило верно, и дефект с вертикальным запасом не был виден.
  const growX = (x: number): void => {
    if (x < frame.minX) frame.minX = x
    if (x > frame.maxX) frame.maxX = x
  }
  const growY = (y: number): void => {
    if (y < frame.minY) frame.minY = y
    if (y > frame.maxY) frame.maxY = y
  }
  const grow = (x: number, y: number): void => {
    growX(x)
    growY(y)
  }

  let at = 0
  let from: [number, number] = [0, 0]
  let cursor: [number, number] = [0, 0]

  while (at < tokens.length) {
    const kind = tokens[at]
    at += 1

    if (kind === 'M') {
      cursor = [Number(tokens[at]), Number(tokens[at + 1])]
      at += 2
      from = cursor
      grow(cursor[0], cursor[1])
      continue
    }

    if (kind === 'C') {
      const p0 = Number(tokens[at])
      const p1 = Number(tokens[at + 1])
      const p2 = Number(tokens[at + 2])
      const p3 = Number(tokens[at + 3])
      const p4 = Number(tokens[at + 4])
      const p5 = Number(tokens[at + 5])
      at += 6

      // По каждой оси — кубическая от курсора к концу; берём края и корни её производной.
      for (const [axis, a, b, c, d2] of [
        [0, cursor[0], p0, p2, p4],
        [1, cursor[1], p1, p3, p5],
      ] as const) {
        for (const t of extremumRoots(
          -3 * a + 9 * b - 9 * c + 3 * d2,
          6 * (a - 2 * b + c),
          3 * (b - a),
        )) {
          const u = 1 - t
          const value = u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d2
          if (axis === 0) growX(value)
          else growY(value)
        }
      }

      cursor = [p4, p5]
      continue
    }

    // `Z` замыкает подпоследовательность: курсор возвращается на её начало.
    if (kind === 'Z') cursor = from
  }

  return frame
}

/** Разбор viewBox в четыре числа. */
function boxOf(value: string): { x: number; y: number; w: number; h: number } {
  const parts = value.split(' ').map(Number)

  return { x: parts[0] ?? 0, y: parts[1] ?? 0, w: parts[2] ?? 0, h: parts[3] ?? 0 }
}

describe('кадр розетки', () => {
  const box = boxOf(SAKURA_ROSETTE_BOX)
  const rose = pathFrame(SAKURA_ROSETTE)

  it('настоящий кадр посчитан, а не пустой', () => {
    expect(Number.isFinite(rose.minX)).toBe(true)
    expect(rose.maxX).toBeGreaterThan(rose.minX)
    expect(rose.maxY).toBeGreaterThan(rose.minY)
  })

  it('розетка вписана в кадр целиком', () => {
    // Именно правый лепесток вылезал за прежний кадр на 2.48 единицы.
    expect(rose.maxX).toBeCloseTo(33.683, 2)
    expect(rose.minX).toBeGreaterThan(box.x)
    expect(rose.minY).toBeGreaterThan(box.y)
    expect(rose.maxY).toBeLessThan(box.y + box.h)
    expect(rose.maxX).toBeLessThan(box.x + box.w)
  })

  it('запас по краям равный и не нулевой', () => {
    const padLeft = rose.minX - box.x
    const padRight = box.x + box.w - rose.maxX
    const padTop = rose.minY - box.y
    const padBottom = box.y + box.h - rose.maxY

    expect(Math.abs(padLeft - padRight)).toBeLessThan(0.1)
    expect(Math.abs(padTop - padBottom)).toBeLessThan(0.1)
    // Кадр не должен липнуть к лепестку вплотную.
    expect(Math.min(padLeft, padRight, padTop, padBottom)).toBeGreaterThan(1)
  })

  it('розетка сидит в кадре по центру', () => {
    expect(Math.abs((rose.minX + rose.maxX) / 2 - (box.x + box.w / 2))).toBeLessThan(0.1)
    expect(Math.abs((rose.minY + rose.maxY) / 2 - (box.y + box.h / 2))).toBeLessThan(0.1)
  })

  it('лепесток знака и пять поворотов на месте', () => {
    expect(SAKURA_PETAL.startsWith('M')).toBe(true)
    expect(SAKURA_TURNS).toHaveLength(5)
  })
})
