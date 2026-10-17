// Колонки сетки и «целое число строк». Норму показа считаем под десктоп (студия добирает 27, лента 36),
// на приставке колонок меньше и последний ряд обрывался посреди экрана. Правило одно для всех трёх.

/** Сколько колонок сетка расставила по факту. Читается готовая раскладка, а не делим ширину на
 * плитку:
 *  `auto-fill` сам решает, сколько мест влезло. `0` — сетки в разметке ещё не было. */
export function gridCols(grid: HTMLElement | null): number {
  if (grid === null) return 0

  const track = getComputedStyle(grid).gridTemplateColumns.trim()
  if (track === '' || track === 'none') return 0

  const cols = track.split(/\s+/).length
  // Одна колонка — это и есть ряд: подгонять нечего, и по сути это «колонок не измерили».
  return cols > 1 ? cols : 0
}

/** Наименьшее число, не меньше `want` и кратное количеству колонок: сетка кончается целым рядом.
 * Колонки
 *  неизвестны (`0`) или сетка одноколоночная — возвращаем `want` как есть. */
export function wholeRows(want: number, cols: number): number {
  if (cols < 2) return want
  return Math.ceil(want / cols) * cols
}

/** Наибольшее число, не больше `want` и кратное количеству колонок: недобранный ряд не показываем
 * вовсе,  а оставляем следующей порции. Обратная сторона `wholeRows`: там «добить ряд вверх» превращалось в
 *  вечный недобор — пять рядов по пять лучше, чем четыре полных и два в обрезанном. */
export function wholeRowsDown(want: number, cols: number): number {
  if (cols < 2) return want

  const rows = Math.floor(want / cols)
  // Ниже одного ряда опускаться нельзя: пустая витрина хуже неполной строки.
  return rows >= 1 ? rows * cols : want
}
