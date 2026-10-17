// Проверки подгонки показываемого числа под колонки сетки: норма показа подобрана под десктоп, а колонок
// на приставке меньше, и внизу оставались пустые слоты.

import { describe, expect, it } from 'vitest'

import { gridCols, wholeRows, wholeRowsDown } from '../src/app/grid-fit'

describe('целое число рядов', () => {
  it('добирает вверх до кратного колонкам', () => {
    // Ровно те случаи из жалоб: 27 в сетке из пяти колонок, 36 в сетке из пяти, 8 в сетке из девяти.
    expect(wholeRows(27, 5)).toBe(30)
    expect(wholeRows(36, 5)).toBe(40)
    expect(wholeRows(8, 9)).toBe(9)
  })

  it('уже кратное колонкам число не трогает', () => {
    expect(wholeRows(36, 9)).toBe(36)
    expect(wholeRows(8, 4)).toBe(8)
    expect(wholeRows(27, 9)).toBe(27)
  })

  it('без измеренных колонок возвращает прежнюю норму', () => {
    // Пока сетки в разметке нет, показывать нечего лишнего: ведём себя как раньше.
    expect(wholeRows(27, 0)).toBe(27)
    expect(wholeRows(36, 1)).toBe(36)
  })

  it('ноль и отрицательное не ломают расчёт', () => {
    expect(wholeRows(0, 5)).toBe(0)
    expect(wholeRows(10, -3)).toBe(10)
  })
})

describe('целое число рядов вниз', () => {
  it('отрезает недобранный ряд, а не добирает его', () => {
    // Студия: 27 постеров в сетке из пяти колонок. Добрать вверх нечем — источник отдал столько, сколько отдал, — поэтому показываем пять рядов по пять, а двух лишних ждём следующей порцией.
    expect(wholeRowsDown(27, 5)).toBe(25)
    expect(wholeRowsDown(36, 5)).toBe(35)
  })

  it('уже кратное колонкам число не трогает', () => {
    expect(wholeRowsDown(27, 9)).toBe(27)
    expect(wholeRowsDown(36, 9)).toBe(36)
    expect(wholeRowsDown(8, 4)).toBe(8)
  })

  it('ниже одного ряда не опускается: пустая витрина хуже неполной строки', () => {
    expect(wholeRowsDown(3, 5)).toBe(3)
    expect(wholeRowsDown(0, 5)).toBe(0)
  })

  it('без измеренных колонок возвращает прежнюю норму', () => {
    expect(wholeRowsDown(27, 0)).toBe(27)
    expect(wholeRowsDown(27, 1)).toBe(27)
  })
})

describe('колонки сетки', () => {
  it('читает готовую раскладку и считает дорожки', () => {
    const grid = document.createElement('div')
    grid.style.display = 'grid'
    // happy-dom не рисует, поэтому дорожки задаём руками — именно их потом и читает обход.
    grid.style.gridTemplateColumns = '200px 200px 200px'
    document.body.appendChild(grid)

    expect(gridCols(grid)).toBe(3)
    grid.remove()
  })

  it('пустая сетка и отсутствующая сетка — колонок неизмеримо', () => {
    expect(gridCols(null)).toBe(0)

    const none = document.createElement('div')
    expect(gridCols(none)).toBe(0)
  })

  it('одна дорожка — это ряд, подгонять нечего', () => {
    const grid = document.createElement('div')
    grid.style.gridTemplateColumns = '200px'
    document.body.appendChild(grid)

    expect(gridCols(grid)).toBe(0)
    grid.remove()
  })
})
