// Резолвер русского названия и описания. Источник один: Шикимори.
// Описание отдаётся с разметкой источника, разбирает её core/rich-text.ts; настройки читаются при вызове.

import { settings } from '../core/settings'
import { fetchShikiAnime } from './shikimori-media'

export interface ResolvedTitle {
  russian: string
  /** Описание с разметкой источника: BBcode Шикимори или маркдаун AniList. */
  description: string | null
  url: string
  /** Человекочитаемое имя источника для подписи в UI. */
  sourceName: string
  /** Оценка MAL из зеркала Шикимори, шкала 0..10. */
  score: number | null
  /** Распределение голосов Шикимори: из него считается их собственная средняя. */
  rates: Array<{ name: string; value: number }> | null
}

/** Строка или `null`. Пустая строка равносильна отсутствию значения. */
function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null

  const clean = value.trim()
  return clean === '' ? null : clean
}

/** Резолвит русское название и описание; адреса всегда анимешные — раздела манги у нас больше нет. */
export async function resolveTitle(malId: number | null): Promise<ResolvedTitle | null> {
  // Заглушка на «выключено»: иначе выключенная подстановка всё равно спросила бы источник.
  if (settings.titlePrimary === 'off' || settings.titlePrimary === 'none') return null

  // Без номера MAL спрашивать не по чему: такой вызов уезжал бы за `/api/animes/null`.
  if (malId === null) return null

  const shiki = await fetchShikiAnime(malId)
  const data = shiki.data
  if (data === null || data === undefined) return null

  const russian = data.russian
  if (russian === undefined || russian === null || russian === '') return null

  const rawScore = Number(data.score)
  return {
    russian,
    description: textOrNull(data.description_html ?? data.description),
    url: 'https://' + (shiki.domain ?? '') + (data.url ?? ''),
    sourceName: 'Shikimori',
    score: Number.isFinite(rawScore) && rawScore > 0 ? rawScore : null,
    rates: Array.isArray(data.rates_scores_stats) ? data.rates_scores_stats : null,
  }
}
