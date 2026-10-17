// Пятиконечная звезда для слоя-цветка: та же фигура, что у сакуры, но со скруглёнными углами. Скругление
// срезает вершину на две точки по краям рёбер; штрих со скруглёнными стыками оставлял под заливкой второй силуэт.

interface Point {
  x: number
  y: number
}

/** Центр и радиусы фигуры в квадрате 32 — том же, что у сакуры. */
const CX = 16
const CY = 16
const R_TIP = 14
const R_HOLLOW = 6.5

/** Срез вершины: у луча круглее, у впадины меньше — рёбра там короткие. */
const CUT_TIP = 2.6
const CUT_HOLLOW = 1.3

function pointAt(deg: number, radius: number): Point {
  const rad = (deg * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}

/** Точка на ребре, отстоящая от вершины на `dist`. */
function along(from: Point, to: Point, dist: number): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: from.x + (dx / len) * dist, y: from.y + (dy / len) * dist }
}

/** Число в путь: два знака, хвостовых нулей нет. */
function n(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/** Путь звезды: пять лучей по очереди с впадинами, у каждой вершины срез и кривая через неё. */
export function starPath(): string {
  const at: Point[] = []
  for (let turn = 0; turn < 5; turn += 1) {
    at.push(pointAt(-90 + turn * 72, R_TIP))
    at.push(pointAt(-90 + turn * 72 + 36, R_HOLLOW))
  }

  let d = ''
  for (let i = 0; i < at.length; i += 1) {
    const cur = at[i]!
    const prev = at[(i + at.length - 1) % at.length]!
    const next = at[(i + 1) % at.length]!
    const cut = i % 2 === 0 ? CUT_TIP : CUT_HOLLOW

    const back = along(cur, prev, cut)
    const ahead = along(cur, next, cut)

    d += i === 0 ? `M${n(back.x)} ${n(back.y)}` : `L${n(back.x)} ${n(back.y)}`
    d += `Q${n(cur.x)} ${n(cur.y)} ${n(ahead.x)} ${n(ahead.y)}`
  }

  return `${d}Z`
}
