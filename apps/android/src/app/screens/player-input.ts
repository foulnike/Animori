// Ввод экрана просмотра: одно действие — три пути к нему. Пульт для ПК приезжает обычной клавиатурой,
// поэтому отдельного вида под телевизор нет; здесь только ввод и внимание.

/** Чего человек хочет. Чем нажато — клавишей, пультом, мышью — уже неважно. */
export type PlayerIntent =
  | 'toggle'
  | 'seekBack'
  | 'seekAhead'
  | 'jumpBack'
  | 'jumpAhead'
  | 'louder'
  | 'quieter'
  | 'mute'
  | 'slower'
  | 'faster'
  | 'prevEpisode'
  | 'nextEpisode'
  | 'skip'
  | 'fullscreen'
  | 'exit'
  | 'focusUp'
  | 'focusDown'
  | 'focusLeft'
  | 'focusRight'

/** Шаг перемотки: стрелки на полосе времени и клавиши J/L. */
export const STEP_SEC = 10

/** Большой шаг: те же клавиши с Shift и клавиши страниц. */
export const JUMP_SEC = 60

/** Шаг громкости. Пятая часть: мелкие деления с дивана не поймать. */
export const VOLUME_STEP = 0.2

export const CALM_DELAY_MS = 3200

/** Скорости воспроизведения списком, а не арифметикой: доли вроде 0.25 в двоичных числах копят ошибку
 *  и подпись превращалась бы в 1.7500000000000002. Выше двух не идём: речь неразборчива. */
export const RATES: ReadonlyArray<number> = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** Обычная скорость. К ней возвращает нажатие на текущую строку меню. */
export const NORMAL_RATE = 1

/** Громкость помнится на запуск, как и скорость. Это не настройка. */
let volumeMark = 1

let rateMark: number = NORMAL_RATE

export function peekVolume(): number {
  return volumeMark
}

export function rememberVolume(value: number): void {
  volumeMark = Math.min(1, Math.max(0, value))
}

export function peekRate(): number {
  return rateMark
}

export function rememberRate(value: number): void {
  const first = RATES[0] ?? NORMAL_RATE
  const last = RATES[RATES.length - 1] ?? NORMAL_RATE
  rateMark = Math.min(last, Math.max(first, value))
}

/** Следующая скорость в сторону `step`. Крайние значения упираются, а не замыкаются в кольцо:
 *  прыжок с двойной скорости на четвертную одним нажатием — всегда промах. */
export function stepRate(current: number, step: number): number {
  const at = RATES.indexOf(current)

  // Скорость со стороны (например, из прошлого кадра) — ищем ближайшую.
  if (at < 0) {
    const near = RATES.reduce(
      (best, rate) => (Math.abs(rate - current) < Math.abs(best - current) ? rate : best),
      NORMAL_RATE,
    )
    return near
  }

  const goal = Math.min(RATES.length - 1, Math.max(0, at + step))
  return RATES[goal] ?? NORMAL_RATE
}

/** Подпись скорости: целые без дробного хвоста, знак умножения — не буква x. */
export function rateLabel(rate: number): string {
  const text = Number.isInteger(rate) ? String(rate) : String(rate).replace('.', ',')
  return `${text}\u00d7`
}

/** Набор текста главнее любых наших клавиш. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/** Читает нажатие. `inList` — фокус на кнопке или полосе: там стрелки водят фокус, а «ОК» и пробел
 *  нажимают саму кнопку, и перехватить их значит сработать дважды. Русские буквы стоят рядом с латинскими. */
export function readIntent(event: KeyboardEvent, inList: boolean): PlayerIntent | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (typing(event.target)) return null

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

  switch (key) {
    case ' ':
    case 'Enter':
      return inList ? null : 'toggle'
    case 'k':
    case 'л':
    case 'MediaPlayPause':
    case 'MediaPlay':
    case 'MediaPause':
      return 'toggle'
    case 'ArrowLeft':
      if (inList) return 'focusLeft'
      return event.shiftKey ? 'jumpBack' : 'seekBack'
    case 'ArrowRight':
      if (inList) return 'focusRight'
      return event.shiftKey ? 'jumpAhead' : 'seekAhead'
    case 'ArrowUp':
      return inList ? 'focusUp' : 'louder'
    case 'ArrowDown':
      return inList ? 'focusDown' : 'quieter'
    case 'j':
    case 'о':
      return event.shiftKey ? 'jumpBack' : 'seekBack'
    case 'l':
    case 'д':
      return event.shiftKey ? 'jumpAhead' : 'seekAhead'
    case 'PageUp':
      return 'jumpBack'
    case 'PageDown':
      return 'jumpAhead'
    case 'm':
    case 'ь':
      return 'mute'
    // Скорость двумя парами клавиш: квадратные скобки как в плеерах на ПК,
    // угловые как в вебе. Кириллица рядом — те же физические клавиши.
    case '[':
    case ',':
    case '<':
    case 'х':
    case 'б':
      return 'slower'
    case ']':
    case '.':
    case '>':
    case 'ъ':
    case 'ю':
      return 'faster'
    case 'f':
    case 'а':
    case 'F11':
      return 'fullscreen'
    case 's':
    case 'ы':
      return 'skip'
    case 'n':
    case 'т':
    case 'MediaTrackNext':
      return 'nextEpisode'
    case 'p':
    case 'з':
    case 'MediaTrackPrevious':
      return 'prevEpisode'
    case 'Escape':
    case 'Backspace':
    case 'BrowserBack':
      return 'exit'
    default:
      return null
  }
}

interface Zone {
  name: string
  along: 'row' | 'column'
}

/** Порядок зон: вдоль своей оси стрелка водит фокус внутри зоны, поперёк — переводит в соседнюю. Список задан
 *  руками, зато поведение не зависит ни от ширины окна, ни от порядка блоков. */
const ZONES: Zone[] = [
  { name: 'head', along: 'row' },
  { name: 'resume', along: 'row' },
  { name: 'skip', along: 'row' },
  { name: 'seek', along: 'row' },
  { name: 'bar', along: 'row' },
  { name: 'veil', along: 'row' },
  { name: 'voices', along: 'column' },
  { name: 'episodes', along: 'column' },
]

const ITEMS = 'button:not([disabled]), [tabindex="0"]'

/** Где фокус стоял в каждой зоне: возврат не начинает с первой кнопки. */
const marks = new Map<string, number>()

/** Виден ли элемент настолько, что фокус он примет: панель уезжает с кадра, но `querySelectorAll` видит её
 *  кнопки, а `focus()` молча не срабатывает. Проверка размера — про схлопнутые ползунки. */
function seen(el: HTMLElement): boolean {
  const box = el.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return false

  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkVisibilityCSS: true })
  }
  return el.offsetParent !== null || el.getClientRects().length > 0
}

function itemsOf(root: ParentNode, name: string): HTMLElement[] {
  const box = root.querySelector(`[data-zone="${name}"]`)
  if (box === null) return []

  // Сама зона тоже годится: плашка и «пропустить» — одиночные кнопки, обёртка им не нужна.
  const own = box instanceof HTMLElement && box.matches(ITEMS) ? [box] : []

  // Только свои, без вложенных зон: панель обнимает и полосу времени, и ряд кнопок, а полоса — своя зона,
  // и без проверки шаг «вниз» с полосы попадал в ту же полосу.
  const inner = Array.from(box.querySelectorAll<HTMLElement>(ITEMS)).filter(function (el) {
    return el.closest('[data-zone]') === box
  })

  return own.concat(inner).filter(seen)
}

function land(root: ParentNode, name: string, index: number): boolean {
  const items = itemsOf(root, name)
  if (items.length === 0) return false

  const at = Math.min(items.length - 1, Math.max(0, index))
  const item = items[at]
  if (item === undefined) return false

  marks.set(name, at)
  item.focus()
  return true
}

/** Ближайшая непустая зона в сторону step: озвучек или серий может не быть. */
function nextZone(root: ParentNode, from: number, step: number): Zone | null {
  for (let at = from + step; at >= 0 && at < ZONES.length; at += step) {
    const zone = ZONES[at]
    if (zone !== undefined && itemsOf(root, zone.name).length > 0) return zone
  }

  return null
}

/** Кнопки краёв списка: только у серий и только пока список раскрыт. */
function jumpsOf(root: ParentNode): HTMLElement[] {
  const box = root.querySelector<HTMLElement>('[data-zone="jump"]')
  if (box === null) return []

  return Array.from(box.querySelectorAll<HTMLElement>(ITEMS)).filter(seen)
}

function landJump(jumps: HTMLElement[], index: number): void {
  const at = Math.min(jumps.length - 1, Math.max(0, index))
  const jump = jumps[at]
  if (jump === undefined) return

  marks.set('jump', at)
  jump.focus()
}

/** Держит фокус внутри открытого меню: список лежит над своей кнопкой, и шаг вверх уводил на полосу
 *  времени. У серий есть ещё кнопки краёв справа: вправо со строки — на них, влево с них — в список. */
function holdMenu(root: ParentNode, here: HTMLElement | null, intent: PlayerIntent): boolean {
  const box = root.querySelector<HTMLElement>('[data-zone="menu"]')
  if (box === null) return false

  const rows = Array.from(box.querySelectorAll<HTMLElement>(ITEMS)).filter(seen)
  if (rows.length === 0) return false

  const jumps = jumpsOf(root)

  if (here !== null && jumps.indexOf(here) >= 0) {
    const at = jumps.indexOf(here)
    const walk = intent === 'focusUp' ? -1 : intent === 'focusDown' ? 1 : 0

    if (walk !== 0) {
      landJump(jumps, at + walk)
      return true
    }

    // Назад в список — на ту строку, с которой уходили, а не на выбранную: прыжок к краю
    // не отменяет то место, где человек листал.
    if (intent === 'focusLeft') {
      const back = marks.get('menu') ?? -1
      const on = rows.findIndex((row) => row.classList.contains('am-play__opt--on'))
      const want = back >= 0 ? back : Math.max(0, on)
      const row = rows[Math.min(rows.length - 1, want)]
      if (row !== undefined) row.focus()
    }

    return true
  }

  const at = here === null ? -1 : rows.indexOf(here)

  if (jumps.length > 0 && intent === 'focusRight' && at >= 0) {
    marks.set('menu', at)
    landJump(jumps, marks.get('jump') ?? 0)
    return true
  }

  const walk = intent === 'focusUp' || intent === 'focusLeft' ? -1 : 1

  // Стоим не в меню — встаём на выбранную строку, а не на первую: выбор человек уже сделал.
  const on = rows.findIndex((row) => row.classList.contains('am-play__opt--on'))
  const next = at < 0 ? Math.max(0, on) : Math.min(rows.length - 1, Math.max(0, at + walk))

  const row = rows[next]
  if (row !== undefined) row.focus()

  // Нажатие наше при любом исходе: прокручивать здесь нечего.
  return true
}

/** Водит фокус стрелками. true — нажатие наше: экран его гасит, иначе страница уедет прокруткой. */
export function moveFocus(root: ParentNode, intent: PlayerIntent): boolean {
  const active = document.activeElement
  const here = active instanceof HTMLElement ? active : null

  if (holdMenu(root, here, intent)) return true

  const box = here === null ? null : here.closest<HTMLElement>('[data-zone]')
  const name = box === null ? '' : (box.dataset.zone ?? '')
  const at = ZONES.findIndex((zone) => zone.name === name)
  const zone = at < 0 ? undefined : ZONES[at]

  // Фокус нигде: любая стрелка ставит его на панель. Панели может не быть — под заслонкой она спрятана, —
  // тогда подходит любая зона с живой кнопкой.
  if (zone === undefined) {
    if (land(root, 'bar', marks.get('bar') ?? 0)) return true

    for (const each of ZONES) {
      if (land(root, each.name, marks.get(each.name) ?? 0)) return true
    }

    return true
  }

  const items = itemsOf(root, name)
  const index = here === null ? -1 : items.indexOf(here)
  const along = zone.along === 'row'

  // Вдоль оси — шаг по зоне; у края шаг переводит в соседнюю зону: кнопка, после которой стрелка не делает
  // ничего, читается как поломка. Шаг считаем только от настоящего номера — фокус бывает вне списка зоны.
  const walk =
    intent === (along ? 'focusLeft' : 'focusUp')
      ? -1
      : intent === (along ? 'focusRight' : 'focusDown')
        ? 1
        : 0

  if (walk !== 0 && index >= 0) {
    const next = Math.min(items.length - 1, Math.max(0, index + walk))
    if (next !== index) return land(root, name, next)
  }

  const step = intent === 'focusUp' || intent === 'focusLeft' ? -1 : 1
  const goal = nextZone(root, at, step)

  // На краю нажатие всё равно наше: прокрутке страницы здесь делать нечего.
  return goal === null ? true : land(root, goal.name, marks.get(goal.name) ?? 0)
}
