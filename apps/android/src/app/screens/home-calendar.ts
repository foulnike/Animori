// Календарь выхода на Главной: «что выйдет завтра». Неделя календарная, прошедшие дни остаются, день — полка постеров.
// Две области: «Моё» (список без брошеного) и «Популярное» (верхушка идущих — AniList не умеет «всё, что выходит в мире»).

import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { fetchMalIds } from '@/api/anilist-media'
import { fetchAiringSchedules, fetchPopularOngoing, type AiringEntry } from '@/api/anilist-schedule'
import { adultAllowed, hiddenCount, keepAllowed } from '@/core/adult'
import { peekLook, warmLooks } from '@/core/media-looks'
import { peekRussianName, prefetchRussianNames } from '@/core/media-title'
import {
  onPlayableChange,
  peekPlayable,
  primePlayable,
  requestPlayable,
  type PlayAsk,
  type PlayState,
} from '@/core/playable'
import { Logger } from '@/utils/logger'

import { statusList } from '../labels'

/** Подписи дней коротко. У JS неделя идёт с воскресенья, поэтому порядок свой. */
const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

const DAY_FULL = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const

/** Месяцы в родительном падеже: «21 сентября», а не «21 сентябрь». */
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const

const WEEK_DAYS = 7

/** По скольку имён просить за заход: источники отвечают по одному. */
const NAME_CHUNK = 6

/** Сколько имён добираем за один показ дня: в чужом показе день бывает в два десятка выходов, и каждый —
 *  чужой тайтл. Двадцати четырёх хватает на самый полный замеренный день (девятнадцать выходов). */
const NAME_LIMIT = 24

/** Сколько идущих тайтлов брать для чужого показа. Сотня выбрана замером по живому расписанию: она даёт
 *  81 выход за неделю, а верхушка в 150 добавляет к ним три; дальше растёт только счёт запросов. */
const POPULAR_LIMIT = 100

export type CalendarScope = 'mine' | 'popular'

/** Закладки, которые календарь считает своими. Собираются из общего словаря, а не списком:
 *  иначе календарь молча перестал бы показывать новый статус. */
export const OWN_STATUSES: readonly string[] = statusList()
  .map((item) => item.key)
  .filter((key) => key !== 'DROPPED')

/** Один выход в строке календаря. Поля названы так, как их зовёт плитка. */
export interface WeekRow {
  key: string
  mediaId: number
  episode: number
  /** Срок выхода в миллисекундах: по нему идёт порядок внутри дня. */
  at: number
  time: string
  title: string
  /** Подпись под названием: «19:30 · серия 7», а у вышедшей — «вышла · серия 7». */
  facts: string
  /** Обложка постера. До добора её нет, и плитка покажет букву названия. */
  cover: string | null
  /** Цвет обложки: подложка, пока картинка едет. */
  color: string | null
  /** Есть ли выход у источников видео. `null` — ещё не спрашивали, и знака не будет. */
  play: PlayState | null
  aired: boolean
}

/** День полосы. */
export interface WeekDay {
  /** Начало местных суток: и ключ дня, и то, по чему его выбирают. */
  key: number
  word: string
  num: string
  /** Полная подпись для подсказки: «среда, 16 сентября». */
  title: string
  today: boolean
  past: boolean
  rows: WeekRow[]
}

export function dayStart(stamp: number): number {
  const date = new Date(stamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Сдвиг на дни вперёд или назад. Через `setDate`, а не прибавлением суток в миллисекундах:
 *  в сутках их не всегда ровно восемьдесят шесть миллионов четыреста. */
export function addDays(stamp: number, days: number): number {
  const date = new Date(stamp)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

/** Начало недели, в которой лежит срок: понедельник, местные сутки. */
export function weekStart(stamp: number): number {
  const date = new Date(dayStart(stamp))
  const shift = (date.getDay() - 1 + WEEK_DAYS) % WEEK_DAYS
  return addDays(date.getTime(), -shift)
}

/** Час выхода по местным часам. Не через toLocaleTimeString: тот отдаёт
    двенадцатичасовой вид и точку вместо двоеточия на чужих настройках. */
export function hourText(stamp: number): string {
  const date = new Date(stamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Подпись недели: «15 — 21 сентября». Месяц и год появляются, только
    когда они разные: внутри одного месяца они бы только мешали. */
export function weekText(start: number): string {
  const from = new Date(start)
  const to = new Date(addDays(start, WEEK_DAYS - 1))

  const fromMonth = MONTHS[from.getMonth()] ?? ''
  const toMonth = MONTHS[to.getMonth()] ?? ''

  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()} — ${to.getDate()} ${fromMonth}`
  }

  if (from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()} ${fromMonth} — ${to.getDate()} ${toMonth}`
  }

  return (
    `${from.getDate()} ${fromMonth} ${from.getFullYear()} — ` +
    `${to.getDate()} ${toMonth} ${to.getFullYear()}`
  )
}

/** Имя выхода по старшинству: русское знание, затем название сервера, затем номер тайтла —
 *  номер честен: имени у этого тайтла нет нигде. */
function titleOf(entry: AiringEntry): string {
  return (
    peekRussianName(entry.mediaId) ?? entry.romaji ?? entry.english ?? `Аниме #${entry.mediaId}`
  )
}

/** Подпись под названием: час и серия, а у вышедшей серии — слово вместо часа: минута выхода уже
 *  ничего не решает, а «вышла» отвечает, можно ли смотреть сейчас. */
function factsOf(episode: number, time: string, aired: boolean): string {
  return aired ? `вышла · серия ${episode}` : `${time} · серия ${episode}`
}

function toRow(entry: AiringEntry, at: number): WeekRow {
  const look = peekLook(entry.mediaId)
  const time = hourText(at)
  const aired = at <= Date.now()

  return {
    key: `${entry.mediaId}|${entry.airingAt}`,
    mediaId: entry.mediaId,
    episode: entry.episode,
    at,
    time,
    title: titleOf(entry),
    facts: factsOf(entry.episode, time, aired),
    cover: look?.cover ?? null,
    color: look?.color ?? null,
    play: peekPlayable(entry.mediaId),
    aired,
  }
}

/** Раскладывает выходы по семи дням недели, начиная с `start`. Дни строятся всегда, даже пустые:
 *  клетка без выходов говорит «здесь ничего», а пропущенная не говорит ничего. */
export function buildDays(entries: AiringEntry[], start: number, today: number): WeekDay[] {
  const buckets = new Map<number, WeekRow[]>()

  for (const entry of entries) {
    const at = entry.airingAt * 1000
    const key = dayStart(at)
    const bucket = buckets.get(key)

    if (bucket === undefined) buckets.set(key, [toRow(entry, at)])
    else bucket.push(toRow(entry, at))
  }

  const out: WeekDay[] = []

  for (let i = 0; i < WEEK_DAYS; i += 1) {
    const key = addDays(start, i)
    const date = new Date(key)
    const rows = buckets.get(key) ?? []
    rows.sort((a, b) => a.at - b.at)

    out.push({
      key,
      word: DAY_SHORT[i] ?? '',
      num: String(date.getDate()),
      title: `${DAY_FULL[i] ?? ''}, ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`.trim(),
      today: key === today,
      past: key < today,
      rows,
    })
  }

  return out
}

/** Всё, что разметка календаря берёт готовым. */
export interface HomeCalendar {
  busy: Ref<boolean>
  /** Расписание не пришло: пустая полоса без этой отметки читалась бы
      «ничего не выходит», а это неправда. */
  failed: Ref<boolean>
  days: ComputedRef<WeekDay[]>
  /** Выбранный день. Ноль — «тот, что сегодня». */
  picked: Ref<number>
  shown: ComputedRef<WeekDay | null>
  span: ComputedRef<string>
  scope: Ref<CalendarScope>
  /** Сколько выходов недели спрятал отбор взрослого: иначе пустой день читался бы «здесь ничего не выходит». */
  hidden: Ref<number>
  /** Дни, где выходы были, но их спрятал отбор. Отдельно от счёта за неделю: иначе пустой день
      не отличить от дня, где всё скрыто. */
  hiddenDays: Ref<Set<number>>
  pick: (key: number) => void
  /** Смена области показа: выбранный день не трогается — человек хочет увидеть тот же четверг. */
  setScope: (next: CalendarScope, mediaIds: number[]) => Promise<void>
  load: (mediaIds: number[]) => Promise<void>
}

const entries = ref<AiringEntry[]>([])
const busy = ref(false)
const failed = ref(false)
const picked = ref(0)
/** Область показа по умолчанию — «Популярное»: «Моё» пусто у только что установившего приложение,
 *  и календарь открывался бы пустой сеткой. Своё остаётся первым в ряду. */
const scope = ref<CalendarScope>('popular')
const startKey = ref(0)
const todayKey = ref(0)
const hidden = ref(0)
const hiddenDays = ref<Set<number>>(new Set())

/** Счётчик добора: `peekRussianName`, `peekLook` и `peekPlayable` не реактивны,
    и без него полка не пересобралась бы, когда приедет имя, обложка или метка. */
const stamp = ref(0)

/** Номера заходов: старый видит по своему номеру, что его ответ уже не нужен. */
let run = 0
let nameRun = 0
let coverRun = 0
let playRun = 0

/** Верхушка идущих на время сеанса: за неделю не меняется, а стоит двух запросов. */
let popularIds: number[] = []

const days = computed<WeekDay[]>(() => {
  void stamp.value
  return startKey.value === 0 ? [] : buildDays(entries.value, startKey.value, todayKey.value)
})

/** Показанный день: выбранный, а если его нет в этой неделе — сегодняшний, так смена недели сбрасывает выбор. */
const shown = computed<WeekDay | null>(() => {
  const list = days.value
  if (list.length === 0) return null

  return (
    list.find((day) => day.key === picked.value) ?? list.find((day) => day.today) ?? list[0] ?? null
  )
})

const span = computed<string>(() => (startKey.value === 0 ? '' : weekText(startKey.value)))

/** Русские имена для выходов показанного дня, а не всей недели: в чужом показе за неделю набирается
 *  восемь десятков тайтлов. Подпись без имени нечитаема, но держать из-за неё экран незачем. */
async function warmNames(): Promise<void> {
  const mine = ++nameRun
  const day = shown.value
  if (day === null) return

  const wanted = [
    ...new Set(
      day.rows.filter((row) => peekRussianName(row.mediaId) === null).map((row) => row.mediaId),
    ),
  ].slice(0, NAME_LIMIT)

  if (wanted.length === 0) return

  try {
    for (let from = 0; from < wanted.length; from += NAME_CHUNK) {
      if (mine !== nameRun) return

      await prefetchRussianNames(wanted.slice(from, from + NAME_CHUNK))
      if (mine !== nameRun) return

      stamp.value += 1
    }
  } catch (e) {
    // Без перевода название останется на латинице — это не повод ругаться.
    Logger('WARN', 'Календарь: русские названия добрать не вышло', e)
  }
}

/** Обложки для выходов показанного дня: расчёт тот же, что у имён. Потолка здесь нет нарочно —
 *  выписки едут пачкой до пятидесяти тайтлов, а `warmLooks` сам помнит, что уже спрашивал. */
async function warmCovers(): Promise<void> {
  const mine = ++coverRun
  const day = shown.value
  if (day === null) return

  const wanted = [
    ...new Set(day.rows.filter((row) => row.cover === null).map((row) => row.mediaId)),
  ]

  if (wanted.length === 0) return

  try {
    const added = await warmLooks(wanted)
    if (mine !== coverRun || added === 0) return

    stamp.value += 1
  } catch (e) {
    // Без обложки плитка останется с буквой названия — это не повод ругаться.
    Logger('WARN', 'Календарь: обложки добрать не вышло', e)
  }
}

/** Выходы недели, попавшие в этот день. Вопрос источникам собирается по ним, а не по строкам показа:
 *  у выхода с сервера есть оба названия, а у строки — только победившее в старшинстве. */
function entriesOf(dayKey: number): AiringEntry[] {
  return entries.value.filter((entry) => dayStart(entry.airingAt * 1000) === dayKey)
}

/** Вопрос источникам по одному выходу. Номер MAL нужен один: метку ставит Kodik, а он входит только
 *  по номеру Шикимори и названий не читает. `airing: true` — не догадка: тайтл стоит в расписании. */
function askOf(entry: AiringEntry, malId: number | null): PlayAsk {
  const look = peekLook(entry.mediaId)
  const names = [peekRussianName(entry.mediaId), entry.romaji, entry.english, look?.romaji]

  return {
    mediaId: entry.mediaId,
    malId,
    titles: [
      ...new Set(names.filter((name): name is string => typeof name === 'string' && name !== '')),
    ],
    year: look?.seasonYear ?? undefined,
    airing: true,
  }
}

/** Метки доступности для выходов показанного дня. Склад спрашивается первым и по всем номерам разом —
 *  он отвечает даром; номера MAL нужны службе Kodik, идут они лестницей `fetchMalIds`. */
async function warmPlay(): Promise<void> {
  const mine = ++playRun
  const day = shown.value
  if (day === null) return

  const wanted = entriesOf(day.key).filter((entry) => peekPlayable(entry.mediaId) === null)
  if (wanted.length === 0) return

  try {
    const primed = await primePlayable(wanted.map((entry) => entry.mediaId))
    if (mine !== playRun) return
    if (primed > 0) stamp.value += 1

    const left = wanted.filter((entry) => peekPlayable(entry.mediaId) === null)
    if (left.length === 0) return

    const malIds = await fetchMalIds(left.map((entry) => entry.mediaId))
    if (mine !== playRun) return

    requestPlayable(left.map((entry) => askOf(entry, malIds.get(entry.mediaId) ?? null)))
  } catch (e) {
    // Без метки плитка останется без знака — так и задумано, а не с ложным.
    Logger('WARN', 'Календарь: метки доступности не доехали', e)
  }
}

/** Подписка на ответы о доступности живёт вместе с модулем, а не с экраном: неделя переживает уход с Главной.
 *  Перерисовка заказывается лишь тогда, когда неделя собрана, — иначе каждый ответ гонял бы пустую пересборку. */
onPlayableChange(() => {
  if (startKey.value === 0 || entries.value.length === 0) return

  stamp.value += 1
})

/** Номера для запроса расписания: свои из списка или верхушка популярности (берётся раз на сеанс). */
async function idsFor(mediaIds: number[]): Promise<number[]> {
  if (scope.value === 'mine') return mediaIds

  if (popularIds.length === 0) popularIds = await fetchPopularOngoing(POPULAR_LIMIT)
  return popularIds
}

/** Собирает неделю. Полоса рисуется сразу, до сети: дни — это календарь, а не данные.
 *  Границы окна у AniList строгие, поэтому расширены на секунду внутрь: серия ровно в полночь осталась бы за бортом. */
async function fetchWeek(mediaIds: number[]): Promise<void> {
  const mine = ++run
  failed.value = false
  busy.value = true

  try {
    const ids = await idsFor(mediaIds)
    if (mine !== run) return

    if (ids.length === 0) {
      entries.value = []
      hidden.value = 0
      hiddenDays.value = new Set()
      return
    }

    const from = Math.floor(startKey.value / 1000) - 1
    const to = Math.floor(addDays(startKey.value, WEEK_DAYS) / 1000) + 1
    const found = await fetchAiringSchedules(ids, from, to)
    if (mine !== run) return

    // Отбор взрослого стоит здесь, до доборов: спрятанный выход не тянет
    // за собой ни имени, ни обложки, ни вопроса о доступности.
    hidden.value = hiddenCount(found, (entry) => entry.isAdult)

    const hushed = new Set<number>()
    for (const entry of found) {
      if (!adultAllowed(entry.isAdult)) hushed.add(dayStart(entry.airingAt * 1000))
    }
    hiddenDays.value = hushed

    entries.value = keepAllowed(found, (entry) => entry.isAdult) as AiringEntry[]

    void warmNames()
    void warmCovers()
    void warmPlay()
  } catch (e) {
    if (mine !== run) return

    Logger('WARN', 'Календарь: расписание не пришло', e)
    entries.value = []
    hidden.value = 0
    hiddenDays.value = new Set()
    failed.value = true
  } finally {
    if (mine === run) busy.value = false
  }
}

async function load(mediaIds: number[]): Promise<void> {
  startKey.value = weekStart(Date.now())
  todayKey.value = dayStart(Date.now())
  picked.value = 0

  await fetchWeek(mediaIds)
}

/** Смена области показа: неделя та же, выбор дня тот же, меняется только наполнение. Повторное нажатие
 *  ничего не делает, только если показ не пуст: пустой — это и «ничего не вышло», и «запрос не дошёл». */
async function setScope(next: CalendarScope, mediaIds: number[]): Promise<void> {
  if (scope.value === next && entries.value.length > 0) return

  // Прежний показ уходит сразу: иначе до ответа под новой подписью висели бы строки прошлой области.
  entries.value = []
  hidden.value = 0
  hiddenDays.value = new Set()
  scope.value = next

  await fetchWeek(mediaIds)
}

function pick(key: number): void {
  picked.value = key
  void warmNames()
  void warmCovers()
  void warmPlay()
}

/** Состояние одно на приложение: знание о неделе переживает уход на другой экран и возврат. */
export function useHomeCalendar(): HomeCalendar {
  return {
    busy,
    failed,
    days,
    picked,
    shown,
    span,
    scope,
    hidden,
    hiddenDays,
    pick,
    setScope,
    load,
  }
}
