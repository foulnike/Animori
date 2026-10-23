// Внешние ссылки карточки человека: AniList и Шикимори. Адреса собираются из номеров,
// сети это не стоит. Редактора своих ссылок нет сознательно: набор источников известен заранее.

import { SHIKI_DOMAINS } from '@/core/constants'

/** Первое зеркало Шикимори с запасным именем: ссылка без узла вела бы в никуда. */
const SHIKI_HOST = SHIKI_DOMAINS[0] ?? 'shikimori.io'

/** Раздел людей у Шикимори: у персонажей и авторов он разный, и путать их нельзя. */
const SHIKI_KIND: Record<'character' | 'staff', string> = {
  character: 'characters',
  staff: 'people',
}

/** Одна ссылка хвоста описания. */
export interface PersonLink {
  /** Ключ для перебора в разметке. */
  key: string
  text: string
  url: string
  /** Подсказка: куда уводит ссылка. */
  hint: string
}

/** Всё, из чего собирается хвост карточки человека. */
export interface PersonLinksInput {
  kind: 'character' | 'staff'
  /** Своя страница на AniList: пустая строка — как отсутствие. */
  siteUrl: string | null
  /** Номер человека у Шикимори: известен, только если оттуда пришло описание. */
  shikiId: number | null
  /** Описание взято с Шикимори. Без этого ссылка была бы враньём: у источника может не быть страницы. */
  fromShiki: boolean
}

/** Ссылки под человеком: AniList — всегда (карточка без перевода), Шикимори — только при
 *  собственном описании (нет адреса — ссылка в никуда). */
export function personLinks(input: PersonLinksInput): PersonLink[] {
  const list: PersonLink[] = []

  const siteUrl = (input.siteUrl ?? '').trim()
  if (siteUrl !== '') {
    list.push({
      key: 'anilist',
      text: 'AniList',
      url: siteUrl,
      hint: 'Открыть карточку на AniList',
    })
  }

  const shikiId = input.shikiId
  if (input.fromShiki && shikiId !== null && shikiId > 0) {
    list.push({
      key: 'shiki',
      text: 'Шикимори',
      url: `https://${SHIKI_HOST}/${SHIKI_KIND[input.kind]}/${String(shikiId)}`,
      hint: 'Открыть страницу Шикимори: описание взято оттуда',
    })
  }

  return list
}
