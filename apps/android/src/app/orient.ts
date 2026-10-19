// Ориентация экрана и системные полосы. Приложение портретное; альбомную сторону и погружение
// просит только плеер, а режим датчика — фулскрин трейлера: ролик во весь экран смотрят
// боком. Моста нет вне Android — вызов молча уходит в никуда.

/** portrait — всё приложение, landscape — плеер, auto — датчик (фулскрин трейлера). */
export function setOrientation(name: 'portrait' | 'landscape' | 'auto'): void {
  const bridge = (window as unknown as { AnimoriOrient?: { set?: (n: string) => void } })
    .AnimoriOrient
  bridge?.set?.(name)
}

/** Системные полосы со строкой часов и заряда: плеер живёт без них, выход возвращает. */
export function setImmersive(on: boolean): void {
  const bridge = (window as unknown as { AnimoriOrient?: { immersive?: (on: boolean) => void } })
    .AnimoriOrient
  bridge?.immersive?.(on)
}
