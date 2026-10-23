// Память главной между показами: переход на карточку сносит экран, и отбор с набранной лентой
// переживают его здесь. Состояние сеанса: ни в снимок, ни в базу не пишется, гибнет с окном.

import { ref } from 'vue'

import { emptyPick, type CatalogPick, type CatalogTag } from '@/api/anilist-catalog'
import type { MediaBrief } from '@/api/anilist-media'
import { genreAllowed, tagAllowed } from '@/core/adult'
import { tagChoices, type FeedRun } from '@/core/recs'

export const homePick = ref<CatalogPick>(emptyPick())

/** Набранная лента: ключ отбора, обход и уже показанное. */
export interface FeedKeep {
  key: string
  run: FeedRun | null
  items: MediaBrief[]
}

/** Вне реактивности: ref на сотни описаний вешает наблюдателя на каждое поле; перерисовка — за экраном. */
export const feedKeep: FeedKeep = { key: '', run: null, items: [] }

/** Забыть набранное: смена отбора начинает ленту заново. */
export function dropFeed(): void {
  feedKeep.key = ''
  feedKeep.run = null
  feedKeep.items = []
}

/**
 * Чистка отбора при выключении взрослого: иначе чип остался бы на главной, а лента ушла в выключенном
 * состоянии. Тэги — по метке сервера из справочника, при провале справочника — по имени.
 */
export async function purgeAdultPick(): Promise<void> {
  const pick = homePick.value
  if (pick.genres.length === 0 && pick.tags.length === 0) return

  const known = await tagChoices().catch(() => [] as CatalogTag[])
  const byName = new Map(known.map((tag) => [tag.name, tag]))

  const genres = pick.genres.filter((genre) => genreAllowed(genre))
  const tags = pick.tags.filter((name) => {
    const tag = byName.get(name)
    return tag === undefined ? tagAllowed({ name }) : tagAllowed(tag)
  })

  if (genres.length === pick.genres.length && tags.length === pick.tags.length) return

  homePick.value = { ...pick, genres, tags }
  dropFeed()
}
