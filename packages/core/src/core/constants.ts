// Глобальные константы: только неизменяемые значения.
// Состояние сессии — паузы и инстанс БД — в своих модулях, не здесь.

/** Зеркала Shikimori: `.io` первым, `.rip` — откат; рабочее зеркало помнит api/shikimori.ts. */
export const SHIKI_DOMAINS: readonly string[] = ['shikimori.io', 'shikimori.rip']

/** Срок хранения кэша: бессрочно; чистится только руками через clearCache(). */
export const CACHE_TIME = Number.POSITIVE_INFINITY

// IndexedDB
export const DB_NAME = 'AniMoriSuperDB'
/** Версия схемы: 6-я переносит склад карточек shikiCache → mediaCache, 7-я заводит склад постеров. */
export const DB_VERSION = 7
