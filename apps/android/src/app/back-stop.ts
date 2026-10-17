// Очередь «Назад» для окон поверх экрана: пока окно открыто, «Назад» значит «закрыть окно».
// Аппаратная кнопка на Android достаётся оболочке раньше страницы: окно обязано сказать наружу, что живо.

/// Шаг «Назад». Возвращает true, если окно закрылось и наружу идти не надо.
type Stop = () => boolean

const stops: Stop[] = []

/// Окна ставятся по `v-if`, поэтому наличие узла и есть «окно открыто».
function opened(): Element | null {
  return document.querySelector('[role="dialog"]')
}

/// Говорит оболочке, есть ли кому принять шаг «Назад». На компьютере моста нет, и вызов молча уходит в никуда.
let armed = false

function sync(): void {
  const now = stops.length > 0 || opened() !== null
  if (now === armed) return
  armed = now

  const bridge = (window as unknown as { AnimoriBack?: { setBackStop?: (on: boolean) => void } })
    .AnimoriBack
  bridge?.setBackStop?.(now)
}

/// Ставит окно в очередь «Назад»; возвращает сниматель. Последнее поставленное закрывается первым — оно и лежит поверх.
export function pushBackStop(step: Stop): () => void {
  stops.push(step)
  sync()

  return function () {
    const at = stops.indexOf(step)
    if (at >= 0) stops.splice(at, 1)
    sync()
  }
}

/// Пытается закрыть верхнее окно; false — окон нет, и «Назад» идёт по истории.
/// Окну без записи страховка: не послушалось Escape — история листается сама, иначе человек остался бы в окне.
export function runBackStop(): boolean {
  const step = stops[stops.length - 1]
  if (step !== undefined) return step()

  if (opened() === null) return false

  // Событие уходит владельцу фокуса, а не на `window`: отправленное на окно до слушателей `document`
  // не доходит вовсе. Отправка на владельца фокуса повторяет настоящее нажатие — видят оба вида слушателей.
  const holder =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body
  holder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  window.setTimeout(sync, 60)
  window.setTimeout(function () {
    if (opened() !== null) window.history.back()
  }, 60)

  return true
}

// Окно открывается и закрывается и помимо нашей записи: галерея кадров и окно тем живут на своём состоянии.
const watch =
  typeof MutationObserver === 'function'
    ? new MutationObserver(function () {
        sync()
      })
    : null

watch?.observe(document.documentElement, { childList: true, subtree: true })

// Вызов оболочки по имени: она выполняет строку сама и своего контекста странице не даёт — имя в окне цена моста.
;(window as unknown as { __amBackStop?: () => void }).__amBackStop = function () {
  runBackStop()
}
