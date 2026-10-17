import { onScopeDispose, watch } from 'vue'

// Прокрутка фона под оверлеем: тело замирает, пока открыто хоть одно окно.
// Счётчик держит наложения — «запись поверх карточки поверх списка» — и не даёт
// одному окну разбудить фон, пока открыто другое.

let held = 0
let keep = ''

function lock(): void {
  if (held === 0) {
    keep = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  held += 1
}

function unlock(): void {
  held = Math.max(0, held - 1)
  if (held === 0) document.body.style.overflow = keep
}

/** Замок по открытости окна. Гоняется в setup: нажато — тело замёрзло, отпустили — ожило.
 *  Снятие с экрана само возвращает прокрутку. */
export function useScrollLock(open: () => boolean): void {
  let release: (() => void) | null = null

  watch(
    open,
    (on) => {
      if (on && release === null) {
        lock()
        let free = false
        release = () => {
          if (free) return
          free = true
          unlock()
        }
      } else if (!on && release !== null) {
        release()
        release = null
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    release?.()
    release = null
  })
}
