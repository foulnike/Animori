// Подписи видов, закладок и строк с AniList по-русски: один источник для экранов.
// Незнакомый ключ показывается как есть: молчаливая пустота хуже латиницы.

/** Виды аниме: список закрыт перечислением сервера. */
const FORMAT_WORDS: Readonly<Record<string, string>> = {
  TV: 'ТВ',
  TV_SHORT: 'Короткий ТВ',
  MOVIE: 'Фильм',
  SPECIAL: 'Спешл',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Клип',
}

/** Жанры каталога AniList: список закрыт, все девятнадцать здесь. */
const GENRE_WORDS: Readonly<Record<string, string>> = {
  Action: 'Экшен',
  Adventure: 'Приключения',
  Comedy: 'Комедия',
  Drama: 'Драма',
  Ecchi: 'Этти',
  Fantasy: 'Фэнтези',
  Hentai: 'Хентай',
  Horror: 'Ужасы',
  'Mahou Shoujo': 'Махо-сỏдзỏ',
  Mecha: 'Меха',
  Music: 'Музыка',
  Mystery: 'Детектив',
  Psychological: 'Психологическое',
  Romance: 'Романтика',
  'Sci-Fi': 'Фантастика',
  'Slice of Life': 'Повседневность',
  Sports: 'Спорт',
  Supernatural: 'Сверхъестественное',
  Thriller: 'Триллер',
}

/** Жанры каталога в объявленном порядке: чипы витрины главной. */
export const GENRE_CHOICES: readonly string[] = Object.keys(GENRE_WORDS)

/** Пол человека в карточке: существительным, а не отметкой в анкете. */
const GENDER_WORDS: Readonly<Record<string, string>> = {
  Male: 'Мужчина',
  Female: 'Женщина',
}

/** Занятия автора: сервер отдаёт их из закрытого списка. */
const OCCUPATION_WORDS: Readonly<Record<string, string>> = {
  Animator: 'Аниматор',
  'Character Designer': 'Дизайнер персонажей',
  Director: 'Режиссёр',
  Illustrator: 'Иллюстратор',
  Mangaka: 'Мангака',
  Musician: 'Музыкант',
  Novelist: 'Новеллист',
  'Original Creator': 'Автор оригинала',
  Producer: 'Продюсер',
  Seiyu: 'Сэйю',
  Writer: 'Писатель',
}

/** Языки людей и озвучки. */
const LANG_WORDS: Readonly<Record<string, string>> = {
  Japanese: 'Японский',
  English: 'Английский',
  Korean: 'Корейский',
  Chinese: 'Китайский',
  Taiwanese: 'Тайваньский',
  Italian: 'Итальянский',
  French: 'Французский',
  Spanish: 'Испанский',
  German: 'Немецкий',
  Hungarian: 'Венгерский',
  Portuguese: 'Португальский',
  Hebrew: 'Иврит',
  Polish: 'Польский',
  Arabic: 'Арабский',
  Filipino: 'Филиппинский',
  Catalan: 'Каталанский',
  Norwegian: 'Норвежский',
  Turkish: 'Турецкий',
  Finnish: 'Финский',
  Dutch: 'Нидерландский',
  Swedish: 'Шведский',
  Thai: 'Тайский',
  Tagalog: 'Тагальский',
  Malaysian: 'Малайский',
  Indonesian: 'Индонезийский',
  Vietnamese: 'Вьетнамский',
  Nepali: 'Непальский',
  Hindi: 'Хинди',
  Urdu: 'Урду',
}

/** Запасная подпись ссылки: Шикимори ставит тег сущности без подписи, а имя
 *  подставляет сам сайт. Пока имя едет, пустая ссылка ненажимаема. */
const LINK_STUB_WORDS: Readonly<Record<string, string>> = {
  character: 'персонаж',
  staff: 'человек',
  media: 'тайтл',
}

export interface StatusItem {
  key: string
  title: string
}

/** Закладки своего списка. Порядок как в привычном списке на сайте. */
const STATUS_ITEMS: ReadonlyArray<StatusItem> = [
  { key: 'CURRENT', title: 'Смотрю' },
  { key: 'REPEATING', title: 'Пересматриваю' },
  { key: 'PLANNING', title: 'В планах' },
  { key: 'COMPLETED', title: 'Просмотрено' },
  { key: 'PAUSED', title: 'Отложено' },
  { key: 'DROPPED', title: 'Брошено' },
]

/** Слово из словаря или как пришло: незнакомое прятать хуже латиницы. */
function lookup(map: Readonly<Record<string, string>>, text: string | null): string | null {
  if (text === null || text === '') return null
  return map[text] ?? text
}

/** Вид тайтла по-русски. Нет вида — нет и подписи. */
export function formatWord(format: string | null): string | null {
  if (format === null || format === '') return null
  return FORMAT_WORDS[format] ?? format
}

/** Жанр по-русски. */
export function genreWord(genre: string | null): string | null {
  return lookup(GENRE_WORDS, genre)
}

/** Пол человека по-русски. */
export function genderWord(gender: string | null): string | null {
  return lookup(GENDER_WORDS, gender)
}

/** Занятие автора по-русски. */
export function occupationWord(occupation: string | null): string | null {
  return lookup(OCCUPATION_WORDS, occupation)
}

/** Язык по-русски. */
export function langWord(language: string | null): string | null {
  return lookup(LANG_WORDS, language)
}

/** Короткая метка анонса для постера: на плитке места мало. */
export function soonWord(): string {
  return 'Анонс'
}

/** Подсказка к метке анонса: одно слово объясняет не всё. */
export function soonHint(): string {
  return 'Анонс: ни одной части ещё не вышло'
}

/** Запасная подпись ссылки из описания, пока имя ещё не добралось. */
export function linkStubWord(kind: string): string {
  return LINK_STUB_WORDS[kind] ?? 'ссылка'
}

/** Закладки своего списка: порядок важен, поэтому массив, а не словарь. */
export function statusList(): ReadonlyArray<StatusItem> {
  return STATUS_ITEMS
}

/** Подпись одной закладки. Пустой ключ значит «тайтла нет в списке». */
export function statusWord(key: string | null): string | null {
  if (key === null || key === '') return null

  const found = STATUS_ITEMS.find((item) => item.key === key)
  return found?.title ?? key
}

/** Подпись строки счёта частей для карточки. */
export function partsWord(): string {
  return 'Эпизоды'
}

/** Короткое слово для плитки: на постере места мало. */
export function partsShort(): string {
  return 'эп.'
}
