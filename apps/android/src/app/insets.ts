// Системные поля в CSS-переменные. Chromium отдаёт в env() не всё: нижний навбар в три кнопки
// до стилей не доходит, и содержимое уезжает под него. Мост молчит вне Android — переменные
// остаются нулевыми, и max(env(), var()) в стилях работает на одних инсетах браузера.

const TOP = '--am-sys-top'
const BOTTOM = '--am-sys-bottom'

/** Читает поля моста и кладёт их в корень. */
export function syncInsets(): void {
  const bridge = (
    window as unknown as {
      AnimoriOrient?: { insetTop?: () => number; insetBottom?: () => number }
    }
  ).AnimoriOrient
  if (bridge?.insetTop === undefined || bridge.insetBottom === undefined) return

  const style = document.documentElement.style
  style.setProperty(TOP, `${bridge.insetTop()}px`)
  style.setProperty(BOTTOM, `${bridge.insetBottom()}px`)
}

/** Ставит чтение при старте. Поля приходят асинхронно после первой раскладки, поэтому
 *  первые шаги повторены; дальше ходят resize и смена ориентации. */
export function startInsets(): void {
  syncInsets()
  for (const delay of [120, 400, 1200]) window.setTimeout(syncInsets, delay)

  window.addEventListener('resize', syncInsets)
  window.addEventListener('orientationchange', syncInsets)
  window.addEventListener('focus', syncInsets)
}
