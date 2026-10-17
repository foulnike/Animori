// Ориентация экрана и системные полосы. Приложение портретное; альбомную сторону и погружение
// просит только плеер. Моста нет вне Android — вызов молча уходит в никуда.

/** portrait — всё приложение, landscape — плеер. */
export function setOrientation(name: 'portrait' | 'landscape'): void {
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
