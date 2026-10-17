// Проверки фигуры звезды (`app/star`). Слой рисуется по этому пути, и ошибка в нём видна только
// глазом на приставке: пять острых углов вместо скруглённых или фигура, уехавшая за квадрат.

import { describe, expect, it } from 'vitest'

import { starPath } from '../src/app/star'

/** Числа пути: команды пропускаем, знаки не трогаем. */
function numbers(d: string): number[] {
  return [...d.matchAll(/-?\d+(\.\d+)?/g)].map((hit) => Number(hit[0]))
}

describe('путь звезды', () => {
  it('замкнут: фигура без хвоста выглядит обломком', () => {
    const d = starPath()

    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('скругляет каждую вершину: пять лучей и пять впадин дают десять кривых', () => {
    // Именно они скругляют углы: без них остаётся острый многоугольник, каким он и был.
    expect([...starPath().matchAll(/Q/g)].length).toBe(10)
  })

  it('лежит в квадрате 32 и не лижет краёв', () => {
    for (const value of numbers(starPath())) {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThan(32)
    }
  })

  it('первый луч смотрит вверх, а не вбок', () => {
    const at = numbers(starPath())

    // Первое Q — срез верхнего луча: управляющая точка стоит над центром, у самой фигуры.
    expect(at[2]).toBe(16)
    expect(at[3]).toBeLessThan(3)
  })

  it('одинаков от прогона к прогону', () => {
    expect(starPath()).toBe(starPath())
  })
})
