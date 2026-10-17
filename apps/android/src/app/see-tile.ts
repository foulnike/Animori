// Отметка о появлении плитки в окне: спрашивать источники стоит о том, что видно. Наблюдатель один
// на окно, а не на плитку. Просьба одноразовая: спросили — сняли с наблюдения, ответ в памяти ядра.

import type { Directive } from 'vue'

import { Logger } from '@/utils/logger'

/** Насколько раньше края окна считать плитку показанной: примерно ряд запаса — пока человек
 *  долистывает, ответ уже едет, и метка не выскакивает поверх готового постера. */
const LOOK_AHEAD_PX = 300

/** Что делать, когда узел показался. Слабые ссылки: снятая с экрана плитка уводит запись сама,
 *  а в длинном списке таких узлов сотни. */
const calls = new WeakMap<Element, () => void>()

let eye: IntersectionObserver | null = null

/** Зовёт обработчик. Чужая ошибка не должна снимать наблюдение с остальных плиток. */
function run(call: () => void): void {
  try {
    call()
  } catch (e) {
    Logger('WARN', 'Показ плитки: обработчик споткнулся', e)
  }
}

function fire(el: Element): void {
  const call = calls.get(el)
  if (call === undefined) return

  calls.delete(el)
  eye?.unobserve(el)

  run(call)
}

/** Наблюдатель окна. Заводится перед первой плиткой и дальше живёт один на всех. */
function eyeNode(): IntersectionObserver | null {
  if (eye !== null) return eye
  if (typeof IntersectionObserver === 'undefined') return null

  eye = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue

        fire(entry.target)
      }
    },
    { rootMargin: `${String(LOOK_AHEAD_PX)}px 0px`, threshold: 0 },
  )

  return eye
}

/** Одноразовая отметка о показе: v-seen="() => onSeen(row.mediaId)".
 *  Значение — что сделать, когда узел впервые попал в окно; не функция — узел не берётся вовсе. */
export const seen: Directive<HTMLElement, (() => void) | null | undefined> = {
  mounted(el, binding) {
    const call = binding.value
    if (typeof call !== 'function') return

    const watcher = eyeNode()
    if (watcher === null) {
      // Движок без наблюдателя пересечений: считаем плитку показанной сразу — лишние вопросы лучше сетки без меток.
      run(call)
      return
    }

    calls.set(el, call)
    watcher.observe(el)
  },

  updated(el, binding) {
    // Строка перерисовывается на месте, и обработчик каждый раз новый: прежний указывал бы
    // на выписку прошлой перерисовки.
    if (!calls.has(el)) return

    const call = binding.value
    if (typeof call === 'function') calls.set(el, call)
  },

  unmounted(el) {
    if (!calls.has(el)) return

    calls.delete(el)
    eye?.unobserve(el)
  },
}
