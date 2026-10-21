// Облик тайтла для сетки постеров и сводки: обложка, цвет, счёт серий и формат — память, склад, сеть. Снимок картинок не держит, поэтому вид живёт отдельно; хозяин обликов — этот модуль.

import { CACHE_TIME } from './constants'
import { dbGet, dbGetMany, dbSet } from './db'
import { localCover } from './posters'
import { fetchBriefsByIds } from '../api/anilist-lookup'
import type { MediaBrief } from '../api/anilist-media'
import { Logger } from '../utils/logger'
import type { MediaCacheRecord } from './types'

/** Префикс ключа склада; цифра — версия формы (3-я добавила статус выпуска, хранение бессрочное).
 * Новые поля версию не поднимают: переделка склада обошлась бы в сотни запросов ради одного числа. */
const KEY_PREFIX = 'LOOK3_'

/** По скольку тайтлов спрашиваем за раз: потолок страницы у AniList. */
const LOOK_CHUNK = 50

/** По скольку ключей читаем склад за одну транзакцию: сводке нужен формат всего списка сразу. */
const STORE_CHUNK = 200

/** Статус «ни одной части ещё не вышло»; вынесен сюда, чтобы метка анонса не заводилась на каждом экране. */
export const SOON_STATUS = 'NOT_YET_RELEASED'

/** Внешность тайтла: то, без чего плитка не рисуется; русские имена и описания держит media-title. */
export interface MediaLook {
  cover: string | null
  color: string | null
  format: string | null
  seasonYear: number | null
  episodes: number | null
  /** Длина серии в минутах; у фильма — длина фильма. Сводка часов считает по ней. */
  duration: number | null
  averageScore: number | null
  romaji: string | null
  english: string | null
  /** Статус выпуска с сервера: из него видна метка анонса на постере. */
  status: string | null
  /** Номер серии, которая ещё только выйдет. У завершённого его нет. */
  airingEpisode: number | null
  /** Срок выхода той серии в секундах: по нему видно, что облик отстал. */
  airingAt: number | null
}

/** Знание этого запуска. `null` значит «спрашивали, сервер тайтла не знает». */
const memory = new Map<number, MediaLook | null>()

/** Чьи ключи уже искали на складе: отсутствие там не значит «облика нет» — стоит спросить сеть. */
const asked = new Set<number>()
const cacheReads = new Map<number, Promise<MediaLook | null>>()
let warmInFlight: Promise<number> | null = null

function cacheKey(mediaId: number): string {
  return `${KEY_PREFIX}${mediaId}`
}

/**
 * Знаменатель полосы прогресса: у онгоинга без итога — номер ближайшей серии; ноль подменяется итогом. Это НЕ число вышедших серий: для надписи «Вышло» есть partsAired.
 */
export function partsCeiling(
  look: {
    episodes: number | null
    airingEpisode: number | null
  } | null,
): number | null {
  if (look === null) return null

  const aired = look.airingEpisode === null ? null : look.airingEpisode - 1
  if (aired !== null && aired > 0) return aired

  return look.episodes
}

/**
 * Сколько серий уже вышло; ноль здесь остаётся нулём (подмена — только у знаменателя), null — тайтл не идёт. */
export function partsAired(look: { airingEpisode: number | null } | null): number | null {
  if (look === null || look.airingEpisode === null) return null

  return Math.max(0, look.airingEpisode - 1)
}

/** Анонс ли это: сравнение в ядре, чтобы строка статуса не разъехалась по экранам. */
export function notOutYet(look: MediaLook | null): boolean {
  return look !== null && look.status === SOON_STATUS
}

/** Отстал ли облик от сетки выхода: у онгоинга старение считается по сроку ближайшей серии. */
function airedOut(look: MediaLook): boolean {
  return look.airingAt !== null && look.airingAt * 1000 <= Date.now()
}

/** Читает облик со склада. Протухшая запись считается отсутствующей. */
async function readCache(mediaId: number): Promise<MediaLook | null> {
  const pending = cacheReads.get(mediaId)
  if (pending) return pending
  if (asked.has(mediaId)) return null

  asked.add(mediaId)

  const task = (async () => {
    const record = await dbGet<MediaCacheRecord<MediaLook>>('mediaCache', cacheKey(mediaId))
    if (!record || typeof record.ts !== 'number') return null
    if (Date.now() - record.ts > CACHE_TIME) return null

    const data = record.data
    if (!data || typeof data !== 'object') return null

    // Серия уже вышла: счёт в записи отстал, облик берётся из сети заново.
    if (airedOut(data)) return null

    return data
  })()
  cacheReads.set(mediaId, task)
  void task.then(
    () => cacheReads.delete(mediaId),
    () => cacheReads.delete(mediaId),
  )
  return task
}

/** Кладёт облик на склад. Сама картинка не хранится — только её адрес. */
async function writeCache(mediaId: number, look: MediaLook): Promise<void> {
  await dbSet('mediaCache', { key: cacheKey(mediaId), data: look, ts: Date.now() })
}

/** Собран ли облик целиком, чтобы больше не идти в сеть: у онгоинга знание стареет, у записи до
 * появления длины серии поля нет. Ответ сервера «не знаю» — это null, и он собран: иначе сводка спрашивала бы до бесконечности. */
function lookComplete(look: MediaLook | null): boolean {
  if (look === null) return true
  return !airedOut(look) && look.duration !== undefined
}

/** Выписка сервера в облик: из ответа берётся только видимое глазу. */
function fromBrief(brief: MediaBrief): MediaLook {
  return {
    cover: brief.cover,
    color: brief.color,
    format: brief.format,
    seasonYear: brief.seasonYear,
    episodes: brief.episodes,
    duration: brief.duration,
    averageScore: brief.averageScore,
    romaji: brief.romaji,
    english: brief.english,
    status: brief.status,
    airingEpisode: brief.airingEpisode,
    airingAt: brief.airingAt,
  }
}

/** Что известно прямо сейчас, без ожидания — разметка ждать не умеет. Обложка отдаётся локальной,
 * если постер лежит на диске: без сети ссылка на CDN не рисуется. Поэтому ни плитка, ни строки списка о складе не знают. */
export function peekLook(mediaId: number): MediaLook | null {
  // null в памяти значит «сервер тайтла не знает» — наружу это то же отсутствие, что и «ещё не знаем».
  const look = memory.get(mediaId) ?? null
  if (look === null) return null

  const cover = localCover(mediaId)
  if (cover === null || look.cover === cover) return look

  return { ...look, cover }
}

/**
 * Спрашивали ли облик и что ответили. Отличается от `peekLook` тем, что различает «ещё не знаем» и «сервер тайтла не знает»: и то, и другое читается как null, а сводке важно второе не переспрашивать.
 */
export function lookKnown(mediaId: number): boolean {
  return memory.has(mediaId)
}

/** Поднимает облики со склада пачкой и без сети: сводке нужны вид и длина серии всех записей сразу.
 * Чего на складе нет, остаётся неизвестным — за это отвечает warmLooks. Отказ склада не запоминается. */
export async function hydrateLooks(mediaIds: readonly number[]): Promise<number> {
  const wanted = mediaIds.filter(
    (mediaId) => !memory.has(mediaId) && !asked.has(mediaId) && !cacheReads.has(mediaId),
  )
  if (wanted.length === 0) return 0

  let raised = 0

  for (let from = 0; from < wanted.length; from += STORE_CHUNK) {
    const chunk = wanted.slice(from, from + STORE_CHUNK)

    const records = await dbGetMany<MediaCacheRecord<MediaLook>>('mediaCache', chunk.map(cacheKey))

    // Склад не ответил — «спрашивали» ставить нельзя: иначе запись на нём не найдётся уже никогда.
    if (records === null) {
      Logger('WARN', 'Облик: склад не ответил на пачку, подъём прекращён')
      break
    }

    for (const mediaId of chunk) {
      asked.add(mediaId)

      const record = records.get(cacheKey(mediaId))
      if (!record || typeof record.ts !== 'number') continue

      const data = record.data
      if (!data || typeof data !== 'object') continue

      // Серия онгоинга уже вышла: запись отстала, её место занимает сеть.
      if (airedOut(data)) continue

      memory.set(mediaId, data)
      raised++
    }
  }

  if (raised > 0) Logger('INFO', `Облик: со склада поднято ${raised} из ${wanted.length}`)
  return raised
}

/** Запоминает облик, даром доставшийся с находкой поиска: списки получат обложку без запроса. */
export function rememberBrief(brief: MediaBrief): void {
  const look = fromBrief(brief)
  memory.set(brief.mediaId, look)

  // Склад пишется вдогонку: ждать его ради отрисовки незачем.
  void writeCache(brief.mediaId, look).catch((e) => {
    Logger('WARN', `Облик: тайтл ${brief.mediaId} на склад не лёг`, e)
  })
}

/** Готовит облик для куска списка: сначала склад, потом сеть; повторный заход не стоит ничего. */
export function warmLooks(mediaIds: number[]): Promise<number> {
  return (async () => {
    if (warmInFlight) await warmInFlight

    const task = warmLooksImpl(mediaIds)
    warmInFlight = task
    try {
      return await task
    } finally {
      if (warmInFlight === task) warmInFlight = null
    }
  })()
}

async function warmLooksImpl(mediaIds: number[]): Promise<number> {
  const unknown: number[] = []

  await Promise.all(
    mediaIds.map(async (mediaId) => {
      const known = memory.get(mediaId)

      // Не догоданный облик (см. lookComplete) идёт в сеть: склад своего ответа не даст.
      if (known !== undefined && lookComplete(known)) return

      try {
        const cached = await readCache(mediaId)
        if (cached) memory.set(mediaId, cached)
      } catch (e) {
        // Склад мог не открыться: без него облик возьмём из сети.
        Logger('WARN', `Облик: склад не ответил по тайтлу ${mediaId}`, e)
      }
    }),
  )

  for (const mediaId of mediaIds) {
    const known = memory.get(mediaId)
    if (!memory.has(mediaId) || (known !== undefined && !lookComplete(known))) unknown.push(mediaId)
  }

  if (unknown.length === 0) return 0

  let added = 0

  for (let from = 0; from < unknown.length; from += LOOK_CHUNK) {
    const chunk = unknown.slice(from, from + LOOK_CHUNK)

    let briefs: MediaBrief[]
    try {
      briefs = await fetchBriefsByIds(chunk)
    } catch (e) {
      // Отказ сети не запоминаем: повторный заход на экран спросит снова.
      Logger('WARN', `Облик: пачка из ${chunk.length} не доехала`, e)
      break
    }

    const seen = new Set<number>()

    for (const brief of briefs) {
      const look = fromBrief(brief)
      memory.set(brief.mediaId, look)
      seen.add(brief.mediaId)
      added++
      void writeCache(brief.mediaId, look).catch((e) => {
        Logger('WARN', `Облик: тайтл ${brief.mediaId} на склад не лёг`, e)
      })
    }

    // Чего сервер не назвал в ответе на свою же пачку — того он не знает.
    for (const mediaId of chunk) {
      if (!seen.has(mediaId)) memory.set(mediaId, null)
    }
  }

  if (added > 0) Logger('INFO', `Облик: добыто ${added} из ${unknown.length}`)
  return added
}

/** Забывает знание запуска. Склад не трогается: его чистят из настроек. */
export function forgetLooks(): void {
  memory.clear()
  asked.clear()
  cacheReads.clear()
}
