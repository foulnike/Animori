// Единая точка отбора взрослого содержимого: решает тумблер настроек, прячется карточка, а не плеер.
// Свой список тоже подчиняется; история тоже подчиняется.

import { ADULT_TAG_RULES_DEFAULT, settings, type AdultFilterMode } from './settings'

/** Жанры, которых не бывает при выключенном 18+. Имена серверные. */
const ADULT_GENRES: ReadonlySet<string> = new Set(['Hentai'])

/** Разделы справочника тэгов, закрытые целиком. */
const ADULT_TAG_GROUPS: ReadonlySet<string> = new Set(['Sexual Content'])

/** Тэги вне закрытых разделов, которым в меню отбора тоже не место. */
const ADULT_TAG_NAMES: ReadonlySet<string> = new Set(['Hentai', 'Nudity', 'Prostitution'])

/**
 * Регулируемые тэги: 18+ синий.
 * Блокируются при rank ≥ порога, если showAdult выключен.
 */
const TAG_RULES = ADULT_TAG_RULES_DEFAULT

export function adultMode(): AdultFilterMode {
  // `showAdult` remains a compatibility escape hatch for old callers and tests.
  if (settings.showAdult === true) return 'none'
  return settings.adultMode
}

/** Показывать ли взрослое сейчас: читается в момент вопроса — тумблер действует сразу. */
export function adultShown(): boolean {
  return adultMode() === 'none'
}

/** Пускать ли аниме в показ: isAdult или теги регулируемые с весом выше порога. */
export function adultAllowed(
  isAdult: boolean | null | undefined,
  tagsOrRegulated?: readonly { name: string; rank?: number | null }[] | boolean | null,
): boolean {
  const mode = adultMode()
  if (mode === 'none') return true
  if (isAdult === true) return false
  if (mode === 'full' || mode === 'partial') {
    const regulated =
      typeof tagsOrRegulated === 'boolean' ? tagsOrRegulated : regulatedByTags(tagsOrRegulated)
    if (
      regulated &&
      (mode === 'full' ||
        typeof tagsOrRegulated === 'boolean' ||
        regulatedHiddenInPartial(tagsOrRegulated))
    )
      return false
  }
  return true
}

/** Проверка по регулируемым тегам: блокируются при весе ≥ порога. */
export function regulatedByTags(
  tags?: readonly { name: string; rank?: number | null }[] | null,
): boolean {
  if (!tags || tags.length === 0) return false

  for (const tag of tags) {
    const rank = tag.rank ?? 0
    const rule = settings.adultTagRules[tag.name] ?? TAG_RULES[tag.name]
    if (rule && rank >= rule.threshold) return true
  }

  return false
}

export function regulatedHiddenInPartial(
  tags?: readonly { name: string; rank?: number | null }[] | null,
): boolean {
  if (!tags) return false
  return tags.some((tag) => {
    const rule = settings.adultTagRules[tag.name] ?? TAG_RULES[tag.name]
    return rule?.hideInPartial === true && (tag.rank ?? 0) >= rule.threshold
  })
}

/** Пускать ли жанр в меню отбора: спрашивается серверным именем, не подписью. */
export function genreAllowed(genre: string): boolean {
  if (!ADULT_GENRES.has(genre)) return true
  return adultMode() === 'none'
}

/** Пускать ли тэг в меню отбора: метка сервера, список имён и закрытые разделы. */
export function tagAllowed(tag: {
  name: string
  category?: string | null
  adult?: boolean | null
}): boolean {
  const blocked =
    tag.adult === true ||
    ADULT_TAG_NAMES.has(tag.name) ||
    (typeof tag.category === 'string' && ADULT_TAG_GROUPS.has(tag.category))

  if (!blocked) return true
  return adultMode() === 'none'
}

/** Отсеивает запрещённое из готовой выдачи. Тот же массив, когда прятать нечего. */
export function keepAllowed<T>(
  items: readonly T[],
  isAdultOf: (item: T) => boolean | null | undefined,
  tagsOf?: (item: T) => readonly { name: string; rank?: number | null }[] | null | undefined,
): readonly T[] {
  const mode = adultMode()
  if (mode === 'none') return items
  return items.filter((item) => {
    if (isAdultOf(item) === true) return false
    if (
      tagsOf &&
      (mode === 'full' ? regulatedByTags(tagsOf(item)) : regulatedHiddenInPartial(tagsOf(item)))
    )
      return false
    return true
  })
}

/** Сколько находок спрятано: нужно подписи под выдачей, чтобы не выглядело потерей. */
export function hiddenCount<T>(
  items: readonly T[],
  isAdultOf: (item: T) => boolean | null | undefined,
  tagsOf?: (item: T) => readonly { name: string; rank?: number | null }[] | null | undefined,
): number {
  const mode = adultMode()
  if (mode === 'none') return 0

  let hidden = 0
  for (const item of items) {
    if (
      isAdultOf(item) === true ||
      (tagsOf &&
        (mode === 'full' ? regulatedByTags(tagsOf(item)) : regulatedHiddenInPartial(tagsOf(item))))
    ) {
      hidden += 1
    }
  }
  return hidden
}

/** Возраст допуска: то же число, что на серверной метке 18+. */
export const ADULT_AGE = 18

/** Полные годы на дату; `null` — дата негодна. Время — довод ради воспроизводимости теста. */
export function ageAt(birth: string | null | undefined, now: Date = new Date()): number | null {
  if (typeof birth !== 'string') return null

  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth)
  if (hit === null) return null

  const year = Number(hit[1])
  const month = Number(hit[2])
  const day = Number(hit[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  let age = now.getFullYear() - year
  const before = now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)
  if (before) age -= 1

  return age < 0 ? null : age
}

/** Прошла ли проверка возраста: негодная дата — ответ «нет». */
export function adultByBirth(birth: string | null | undefined, now: Date = new Date()): boolean {
  const age = ageAt(birth, now)
  return age !== null && age >= ADULT_AGE
}
