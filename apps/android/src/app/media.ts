// Медиа-мост. У WebView нет своей MediaSession, поэтому страница кормит оболочку состоянием звука
// (игра/пауза, позиция, заголовок), чтобы кнопки PiP-оверлея показывали настоящее. В обратную
// сторону приходят команды плеера: переключить и переходы серий.

type MediaBridge = {
  state?: (on: boolean, positionMs: number, durationMs: number) => void
  title?: (text: string) => void
  stop?: () => void
}

function bridge(): MediaBridge | undefined {
  return (window as unknown as { AnimoriMedia?: MediaBridge }).AnimoriMedia
}

/** Ставит слежение за командами оболочки. Возвращает снятие. */
export function watchMedia(): () => void {
  const toggle = (): void => {
    window.dispatchEvent(new CustomEvent('am-media-toggle'))
  }
  const prev = (): void => {
    window.dispatchEvent(new CustomEvent('am-media-prev'))
  }
  const next = (): void => {
    window.dispatchEvent(new CustomEvent('am-media-next'))
  }
  const win = window as unknown as {
    __amMediaToggle?: () => void
    __amMediaPrev?: () => void
    __amMediaNext?: () => void
  }
  win.__amMediaToggle = toggle
  win.__amMediaPrev = prev
  win.__amMediaNext = next
  return () => {
    if (win.__amMediaToggle === toggle) delete win.__amMediaToggle
    if (win.__amMediaPrev === prev) delete win.__amMediaPrev
    if (win.__amMediaNext === next) delete win.__amMediaNext
  }
}

/** Пишет состояние звука: игра/пауза, позиция и длительность в миллисекундах. */
export function reportMediaState(on: boolean, positionMs: number, durationMs: number): void {
  bridge()?.state?.(on, Math.round(positionMs), Math.round(durationMs))
}

/** Пишет заголовок кадра для плашки. */
export function reportMediaTitle(text: string): void {
  bridge()?.title?.(text)
}

/** Плеер ушёл — сессия гаснет. */
export function stopMedia(): void {
  bridge()?.stop?.()
}
