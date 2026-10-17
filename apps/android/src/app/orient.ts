// Ориентация экрана. Приложение портретное; альбомную сторону просит только плеер.
// Моста нет вне Android — вызов молча уходит в никуда.

/** portrait — всё приложение, landscape — плеер. */
export function setOrientation(name: 'portrait' | 'landscape'): void {
  const bridge = (window as unknown as { AnimoriOrient?: { set?: (n: string) => void } })
    .AnimoriOrient
  bridge?.set?.(name)
}
