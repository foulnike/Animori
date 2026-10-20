// Кадр в маленьком окне. Web-PiP в Android WebView мёртв, поэтому уносит кадр сама активность,
// а страница только кормит мост прямоугольником кадра и признаком игры. Той же мостовой шлёт
// оболочка весть о входе и выходе из PiP (window.__amPipChanged).

import { ref } from 'vue'

/** Кадр сейчас в маленьком окне. */
export const pipOn = ref(false)

/** Умеет ли устройство PiP вовсе: кнопки без умения быть не должно. */
export const pipReady = ref(false)

type PipBridge = {
  source?: (l: number, t: number, w: number, h: number, aw: number, ah: number) => void
  playing?: (on: boolean) => void
  enter?: () => boolean
  supports?: () => boolean
}

function bridge(): PipBridge | undefined {
  return (window as unknown as { AnimoriPip?: PipBridge }).AnimoriPip
}

/** Ставит слежение за сменой режима. Возвращает снятие. */
export function watchPip(): () => void {
  const fn = (on: boolean): void => {
    pipOn.value = on
  }
  ;(window as unknown as { __amPipChanged?: (on: boolean) => void }).__amPipChanged = fn
  return () => {
    const win = window as unknown as { __amPipChanged?: (on: boolean) => void }
    if (win.__amPipChanged === fn) delete win.__amPipChanged
  }
}

/** Считает умение устройства. Зовётся один раз при открытии плеера. */
export function markPipReady(): void {
  const b = bridge()
  pipReady.value = b?.supports?.() === true
}

/**
 * Кормит мост прямоугольником кадра и пропорцией. Рект меряется в dp (CSS px), мост сам
 * пересчитает в пиксели. Зовётся при открытии плеера, при смене раскладки и перед входом:
 * кадр мог сменить место после разворота или смены серии.
 */
export function feedPipSource(el: HTMLVideoElement): void {
  const b = bridge()
  if (b?.source === undefined) return

  const box = el.getBoundingClientRect()
  if (box.width < 1 || box.height < 1) return

  const aw = el.videoWidth > 0 ? el.videoWidth : 16
  const ah = el.videoHeight > 0 ? el.videoHeight : 9
  b.source(
    Math.round(box.left),
    Math.round(box.top),
    Math.round(box.width),
    Math.round(box.height),
    aw,
    ah,
  )
}

/** Пишет признак игры: сворачивание решает по нему, уводить ли кадр. */
export function markPipPlaying(on: boolean): void {
  bridge()?.playing?.(on)
}

/** Уводит кадр в маленькое окно. false — отказ или не умение. */
export function enterPip(): boolean {
  return bridge()?.enter?.() === true
}
