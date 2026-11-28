import type { PullResult } from '@/core/collection'

type ImportResult = PullResult & {
  lost?: number
  lostTitles?: readonly string[]
  dated?: number
}

export function importResultText(result: ImportResult): string {
  const changes =
    result.mode === 'replace'
      ? [`Список заменён · записей ${result.total}`]
      : [`Добавлено ${result.added}`, `Обновлено ${result.updated}`]
  if (result.lost) {
    const titles = result.lostTitles ?? []
    const examples =
      titles.length > 0
        ? ` (${titles.join(', ')}${result.lost > titles.length ? ' и др.' : ''})`
        : ''
    changes.push(`Пропущено ${result.lost}${examples}`)
  }
  if (result.dated) changes.push(`Перенесено дат просмотра ${result.dated}`)
  return changes.join(' · ')
}
