// Свои всплывающие подписи вместо системного title: тот всплывает с секундной задержкой, рисуется шрифтом системы и не знает ни темы, ни скруглений. Плашка одна на всё окно и живёт в body.

import type { Directive } from 'vue'

/** Задержка перед показом: проход мышью по сетке не должен мигать плашками. */
const SHOW_DELAY_MS = 240

/** Зазор между целью и плашкой. */
const AIM_GAP = 9

/** Отступ от краёв окна: подпись у крайней плитки не липнет к границе. */
const EDGE_PAD = 10

/** Подписи по узлам. Слабые ссылки: снятая с экрана плитка уводит запись сама,
 *  а в сетке на тысячу строк таких узлов много. */
const words = new WeakMap<Element, string>()

let plate: HTMLElement | null = null

/** Чей текст сейчас на экране: нужен для подмены подписи на лету. */
let shownFor: Element | null = null

let timer = 0
let watching = false

/** Когда указатель последний раз двигался; до первого движения — «никогда». */
let lastMove = -1

/** Как долго движение указателя считается свежим. Настоящее наведение приходит вместе с движением,
 *  а показ без него — наводка припаркованного указателя, и плашка висела бы над элементом мимо курсора. */
const MOVE_GRACE_MS = 400

// Слушатель один на всё окно и ставится при загрузке: он нужен до первого наведения.
window.addEventListener('pointermove', () => (lastMove = Date.now()), { passive: true })

/** Плашка показа: создаётся перед первой подписью и дальше живёт в body. */
function plateNode(): HTMLElement {
  if (plate !== null) return plate

  const node = document.createElement('div')
  node.className = 'am-tip'
  node.setAttribute('role', 'tooltip')
  node.hidden = true
  document.body.appendChild(node)

  plate = node
  return node
}

/** Текст подписи из значения директивы. Пустое значение — подписи нет. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Ставит плашку у цели: под ней, а когда снизу тесно — над ней. Размер считается
 *  по уже поставленному тексту: до него размер плашки чужой. */
function place(aim: Element): void {
  const node = plateNode()
  const box = aim.getBoundingClientRect()
  const own = node.getBoundingClientRect()

  const below = box.bottom + AIM_GAP
  const above = box.top - AIM_GAP - own.height
  const up = below + own.height > window.innerHeight - EDGE_PAD && above >= EDGE_PAD

  node.classList.toggle('am-tip--up', up)
  node.classList.toggle('am-tip--down', !up)

  const wanted = box.left + box.width / 2 - own.width / 2
  const limit = Math.max(EDGE_PAD, window.innerWidth - own.width - EDGE_PAD)

  node.style.left = `${Math.round(Math.min(Math.max(wanted, EDGE_PAD), limit))}px`
  node.style.top = `${Math.round(up ? above : below)}px`
}

/** Показывает подпись цели. Пустая подпись показом не считается. */
function show(aim: Element): void {
  const text = words.get(aim) ?? ''
  if (text === '') return

  const node = plateNode()
  node.textContent = text

  // Появление рисует возврат из display: none — своего перезапуска не надо.
  node.hidden = false
  shownFor = aim

  place(aim)
  watchWindow()
}

/** Убирает подпись и гасит отложенный показ. */
function hide(): void {
  window.clearTimeout(timer)
  timer = 0
  shownFor = null

  if (plate !== null) plate.hidden = true
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') hide()
}

/** Прокрутка и смена размера уводят цель из-под плашки. Слушатели ставятся один
 *  раз на всё окно: подписанных узлов сотни, а плашка одна. */
function watchWindow(): void {
  if (watching) return
  watching = true

  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
  window.addEventListener('keydown', onKey, true)
}

/** Наведение или фокус: подпись всплывает после короткой задержки. */
function onEnter(e: Event): void {
  const aim = e.currentTarget
  if (!(aim instanceof Element)) return

  // Наводка без свежего движения указателя — призрак: пульт сюда не ходил, и подпись не должна показываться. Фокус и прикосновение не проверяются: они наводкой не бывают.
  if (
    e instanceof PointerEvent &&
    e.pointerType !== 'touch' &&
    Date.now() - lastMove > MOVE_GRACE_MS
  ) {
    return
  }

  window.clearTimeout(timer)
  timer = window.setTimeout(() => show(aim), SHOW_DELAY_MS)
}

/** Уход курсора, потеря фокуса и нажатие: подписи больше не место. */
function onLeave(): void {
  hide()
}

/** Подпись к любому узлу: v-tip="'Повторных проходов: 3'". Пустая строка и null
 *  значат «подписи нет» — условие в разметке не нужно. */
export const tip: Directive<HTMLElement, string | null | undefined> = {
  mounted(el, binding) {
    words.set(el, textOf(binding.value))

    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onLeave)
    el.addEventListener('focus', onEnter)
    el.addEventListener('blur', onLeave)
  },

  updated(el, binding) {
    const text = textOf(binding.value)
    words.set(el, text)

    // Подпись сменилась под курсором: счёт проходов растёт правкой тут же.
    if (shownFor !== el) return

    if (text === '') hide()
    else show(el)
  },

  unmounted(el) {
    words.delete(el)
    if (shownFor === el) hide()

    el.removeEventListener('pointerenter', onEnter)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('pointerdown', onLeave)
    el.removeEventListener('focus', onEnter)
    el.removeEventListener('blur', onLeave)
  },
}

/** Снимает чужую подпись: пульт увёл фокус, а висит плашка от припаркованного указателя.
 *  Свою подпись не трогаем — её уберёт blur, когда фокус действительно уйдёт. */
export function hideStaleTip(): void {
  const hot = document.activeElement
  if (shownFor !== null && hot instanceof Element && hot.contains(shownFor)) return
  hide()
}
