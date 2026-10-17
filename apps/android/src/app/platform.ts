// Признак слабой платформы: отдельного «телевизионного» режима нет, признак один — Android.
// Размытие подложки стоит сто миллисекунд на кадр: подложку снимают заново каждый кадр.

import { Bridge } from '@/bridge'

const LITE = 'am-lite'

let weak = false

/// Слабая ли платформа. Верно с момента вызова markPlatform().
export function isWeakPlatform(): boolean {
  return weak
}

/** Есть ли браузер: на телевизоре его нет, и кнопка, которая никуда не ведёт, хуже отсутствия.
 *
 * Ответ даёт оболочка, а не осмотр user-agent: умение — свойство продукта, и объявляет его
 * мост. Иначе «умеет» знает только оболочка, а спрашивают экраны, и знание снова разъедется.
 */
export function canOpenOutside(): boolean {
  return Bridge.shell.can.browser
}

/** Звать до createApp(): класс должен стоять на <html> к первой отрисовке. */
export function markPlatform(): void {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || ''
  weak = /Android/i.test(ua)
  if (weak) document.documentElement.classList.add(LITE)
}
