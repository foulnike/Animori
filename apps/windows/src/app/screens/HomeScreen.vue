<script setup lang="ts">
// Главная — витрина рекомендаций: своя полка из памяти коллекции, витрина — через core/recs. Три полки каталога едут одним запросом; «не интересно» добирает полку; метки — по показу плиток.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { emptyPick, pickIsSet, pickKey, type CatalogPick } from '@/api/anilist-catalog'
import { type MediaBrief, type MediaCard } from '@/api/anilist-media'
import { peekBanner, warmBanner } from '@/core/banner-cache'
import { setupVideoSources } from '@/api/video-sources'
import { genreAllowed, keepAllowed } from '@/core/adult'
import { blankEntry, editEntry, getEntry, initCollection, type EntryLook } from '@/core/collection'
import { selectEntries } from '@/core/collection-view'
import {
  notOutYet,
  partsCeiling,
  peekLook,
  peekRegulated,
  rememberBrief,
  SOON_STATUS,
  warmLooks,
  type MediaLook,
} from '@/core/media-looks'
import { peekRussianName, prefetchRussianNames, type RussianTitle } from '@/core/media-title'
import {
  onPlayableChange,
  peekPlayable,
  primePlayable,
  requestPlayable,
  type PlayAsk,
  type PlayState,
} from '@/core/playable'
import {
  distributeShelves,
  feedMore,
  hideRec,
  newFeed,
  shelfFill,
  type ShelfName,
} from '@/core/recs'
import type { SnapshotEntry } from '@/core/snapshot'
import { Logger } from '@/utils/logger'

import EmptyMark from '../components/EmptyMark.vue'
import EntrySheet from '../components/EntrySheet.vue'
import FilterSheet from '../components/FilterSheet.vue'
import MediaTile from '../components/MediaTile.vue'
import { watchCovers } from '../covers'
import { formatWord, GENRE_CHOICES, genreWord, partsShort } from '../labels'
import { navigate } from '../router'
import SakuraMark from '../components/SakuraMark.vue'
import ActivityYear from './ActivityYear.vue'
import { SAKURA_ROSETTE, SAKURA_ROSETTE_BOX } from '../sakura'
import { splashLine } from '../splash'
import { tagWord } from '../tag-words'
import { toPlayAsk, toTileRow, type TileRow } from '../tile-row'
import { sprayGrains, type Grain } from './home-spray'
import { OWN_STATUSES, useHomeCalendar, type CalendarScope } from './home-calendar'
import { dropFeed, feedKeep, homePick } from './home-keep'

/** Сколько постеров класть на полку: и на свою, и на полку витрины. */
const SHELF_SIZE = 14
const SHELF_FETCH = SHELF_SIZE * 3

// Плашка приветствия: фраза запуска — из колоды, круг которой лежит в хранилище (см. splash.ts).
const splash = splashLine()

const heyPlate = ref<HTMLElement | null>(null)
const grains = ref<Grain[]>([])
interface LightLine {
  left: number
  opacity: number
  rotate: number
  width: number
  duration: number
  pause: number
  layer: 'slow' | 'mid' | 'accent'
  flash: boolean
}

const lightLines = ref<LightLine[]>([])
const lightTimers: ReturnType<typeof setTimeout>[] = []
const deviationTimer = ref<number | null>(null)
const deviation = ref<{ key: number; action: 'fly' | 'shake' | 'spin' } | null>(null)

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Смещает скорость к медленной стороне: быстрые переходы остаются редкими вспышками. */
function slowDuration(min = 5, max = 12): number {
  const value = Math.random()
  return min + (max - min) * (1 - value * value)
}

const LINE_POINTS = [-8, 14, 35, 57, 78, 103]

function moveLightLine(index: number): void {
  const line = lightLines.value[index]
  if (!line) return

  line.left = LINE_POINTS[Math.floor(Math.random() * LINE_POINTS.length)] ?? 35
  line.opacity = randomBetween(0.2, 0.78)
  line.rotate = randomBetween(-42, 42)
  line.duration =
    line.layer === 'slow'
      ? slowDuration(8, 15)
      : line.layer === 'mid'
        ? slowDuration(6, 11)
        : slowDuration(4, 8)
  line.pause = randomBetween(4, 10)
  line.flash = Math.random() > 0.72

  lightTimers[index] = setTimeout(() => moveLightLine(index), (line.duration + line.pause) * 1000)
}

function startLightLines(): void {
  lightLines.value = Array.from({ length: 5 }, (_, index) => ({
    left: LINE_POINTS[index + 1] ?? 35,
    opacity: randomBetween(0.2, 0.78),
    rotate: randomBetween(-42, 42),
    width: [46, 22, 58, 28, 40][index] ?? 34,
    duration:
      index === 0 || index === 2
        ? slowDuration(8, 15)
        : index === 4
          ? slowDuration(4, 8)
          : slowDuration(6, 11),
    pause: randomBetween(4, 10),
    layer: index === 0 || index === 2 ? 'slow' : index === 4 ? 'accent' : 'mid',
    flash: false,
  }))
  lightLines.value.forEach((_, index) => moveLightLine(index))
}

// Россыпь пересчитывается по размеру плашки; прежний размер запоминается, иначе расчёт шёл бы на каждый кадр.
let heyWide = 0
let heyHigh = 0
let sprayEye: ResizeObserver | null = null

function layoutSpray(): void {
  const plate = heyPlate.value
  if (plate === null) return

  const wide = plate.clientWidth
  const high = plate.clientHeight
  if (wide <= 0 || high <= 0) return
  if (wide === heyWide && high === heyHigh) return
  heyWide = wide
  heyHigh = high

  // Россыпь намеренно не исключает текст и календарь: цветки должны плавать по всей площади.
  grains.value = sprayGrains(wide, high, [])
}

function triggerSakuraDeviation(): void {
  if (grains.value.length === 0 || deviation.value !== null) return
  const grain = grains.value[Math.floor(Math.random() * grains.value.length)]
  if (!grain) return
  const actions = ['fly', 'shake', 'spin'] as const
  deviation.value = {
    key: grain.key,
    action: actions[Math.floor(Math.random() * actions.length)] ?? 'shake',
  }
  window.setTimeout(() => {
    deviation.value = null
  }, 2600)
}

/** Области показа календаря. «Популярное», а не «Глобально»: глобального показа у AniList нет,
 *  и подпись, обещающая его, врала бы. */
const CALENDAR_SCOPES: ReadonlyArray<{ key: CalendarScope; title: string; hint: string }> = [
  { key: 'mine', title: 'Моё', hint: 'Всё из списка, кроме брошенного' },
  { key: 'popular', title: 'Популярное', hint: 'Выходы верхушки идущих за эту неделю' },
]

/** Скольким плиткам добирать русские названия и по скольку за заход. */
const TITLE_DEPTH = 12
const TITLE_CHUNK = 6

/** Сколько заглушек держать на время подъёма снимка. */
const HOLD_COUNT = 7

/** Ниже этого числа плиток полка не показывается: огрызок из одной-двух
    картинок после чистки повторов выглядит ошибкой загрузки. */
const SHELF_MIN = 3

/** Порция ленты за «Показать ещё»: четыре ряда по девять, иначе нижний ряд обрывался на середине. */
const FEED_WANT = 36

/** Пауза перед вопросом: без неё каждая плитка прокрутки уходила бы своим вопросом вместо пачки. */
const SEEN_PAUSE_MS = 200

/** Плитка своей полки. Тот же вид, что в списках: вид аниме везде один. */
interface Row {
  mediaId: number
  title: string
  facts: string
  mark: string | null
  own: string | null
  done: number
  soon: boolean
  play: PlayState | null
  cover: string | null
  color: string | null
  adult: boolean
  /** Регулируемое: не проверяется, нужна карточка. Всегда false для списка. */
  regulated: boolean
}

/** Полка витрины в показе: заголовок и готовые плитки. */
interface Shelf {
  key: string
  title: string
  rows: TileRow[]
}

/** Описание полки витрины: имя для ядра рекомендаций и заголовок. */
interface ShelfDef {
  key: ShelfName
  title: string
}

/** Условие отбора в строке под шапкой: нажатие снимает именно его. */
interface PickChip {
  key: string
  title: string
  kind: 'genre' | 'tag' | 'format' | 'years'
  value: string
}

const busy = ref(true)
const trouble = ref('')
const ownRows = ref<Row[]>([])
const recs = ref<Shelf[]>([])
const recsPending = ref(false)
const sheetOpen = ref(false)
const feedRows = ref<TileRow[]>([])
const feedBusy = ref(false)
const feedDone = ref(false)
const heroIndex = ref(0)
const heroCards = ref<Record<number, MediaCard>>({})
const heroTitles = ref<Record<number, RussianTitle>>({})
const heroReady = ref<Record<number, boolean>>({})
let heroTimer: ReturnType<typeof setTimeout> | null = null
const heroImages = ref<Record<number, string>>({})
const heroId = ref<number | null>(null)
const heroCurrentReady = computed(() => heroBrief.value !== null)

/** Баннер показывает описание как короткий текст: ссылки и исходные теги здесь не интерактивны. */
function plainHeroDescription(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''

  return raw
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<br\s*\/?>(\s*)/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[(?:character|person|anime|manga)=[^\]]+\s+([^\]]+)\]/gi, '$1')
    .replace(/\[(?:spoiler|quote)(?:=[^\]]+)?\]/gi, '')
    .replace(/\[\/(?:spoiler|quote)\]/gi, '')
    .replace(/\[[a-z][a-z0-9_-]*(?:=[^\]]*)?\]/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Виды правки, доступные с плитки. Удаление записи сюда не входит. */
type EntryEdit = 'status' | 'score' | 'progress' | 'repeat' | 'startedAt' | 'completedAt' | 'notes'

/** Номер записи в правке. Ноль — окно закрыто. */
const editId = ref(0)

/** Название для шапки окна: запоминается при открытии. */
const editName = ref('')

/** Облик для новой записи: имя и метка 18+ из брифа каталога или своей записи. */
const editLookDraft = ref<EntryLook | undefined>(undefined)

/** Счётчик правок: карта коллекции вне реактивности Vue и пересчёт не закажет. */
const editStamp = ref(0)

/** Запись в правке: из памяти списка или пустая — метку ставят и тайтлу, которого там нет. */
const editRow = computed<SnapshotEntry | undefined>(() => {
  void editStamp.value
  if (editId.value === 0) return undefined

  return getEntry(editId.value) ?? blankEntry(editId.value, Date.now(), editLookDraft.value)
})

/** Закладка записи для окна: у новой записи её нет, и окну годится пустая строка. */
const editStatus = computed<string>(() => editRow.value?.status ?? '')

/** Облик правимого аниме из склада: оттуда берётся потолок счёта серий. */
const editLook = computed(() => (editId.value > 0 ? peekLook(editId.value) : null))

/** Сколько серий уже вышло. Без облика потолка нет, и окно его не выдумывает. */
const editParts = computed<number | null>(() =>
  editLook.value !== null
    ? partsCeiling(editLook.value)
    : editLookDraft.value === undefined
      ? null
      : partsCeiling({
          episodes: editLookDraft.value.episodes ?? null,
          airingEpisode: editLookDraft.value.airingEpisode ?? null,
        }),
)

/** Идёт ли показ: онгоингу окно не ставит «Просмотрено» на потолке счёта. */
const editOngoing = computed<boolean>(() =>
  editLook.value !== null
    ? editLook.value.airingEpisode !== null
    : editLookDraft.value?.airingEpisode !== null &&
      editLookDraft.value?.airingEpisode !== undefined,
)

/** Календарь выхода. Всё считает home-calendar, здесь только разметка. */
const {
  busy: calendarBusy,
  failed: calendarFailed,
  days: calendarDays,
  shown: calendarDay,
  span: calendarSpan,
  scope: calendarScope,
  pick: pickDay,
  setScope: setCalendarScope,
  load: loadCalendar,
} = useHomeCalendar()

/** Выходы показанного дня; потолка нет: полка постеров едет вбок и в высоту не растёт. */
const dayRows = computed(() => calendarDay.value?.rows ?? [])

/** Записи своей полки вне реактивности: плитки пересобираются после добора. */
let ownEntries: SnapshotEntry[] = []

/** Номера своих тайтлов для календаря: нужны ещё раз при смене области показа. */
let calendarIds: number[] = []

/** Приехавшие полки витрины и их порядок: плитки собираются на показ. */
const staged = new Map<ShelfName, MediaBrief[]>()
let activeDefs: ShelfDef[] = []

/** Номера доборов полки: свежий ответ перекрывает прежний. */
const refillRun = new Map<ShelfName, number>()

/** Номера идущих доборов: смена отбора гасит старую работу. */
let lookRun = 0
let titleRun = 0
let playRun = 0
let recsRun = 0
let feedRun = 0
let askRun = 0

/** Показанные плитки и номера уже отправленных вопросов: одно аниме стоит в нескольких местах сразу. */
const seenTiles = new Set<number>()
const askedTiles = new Set<number>()
let seenTimer: ReturnType<typeof setTimeout> | null = null

/** Общий заход подъёма склада. Вопрос по показу ждёт его: иначе первый же
    экран уедет к чужой службе за тем, что уже лежит на диске. */
let priming: Promise<void> = Promise.resolve()

/** Стоит ли сейчас хоть одно условие отбора. */
const picked = computed(() => pickIsSet(homePick.value))

/** Кандидаты баннера берутся из той же полки, что и «В тренде», без отдельной выдачи. */
const heroItems = computed(() => {
  void recs.value
  if (picked.value) return []

  return keepAllowed(
    staged.get('trending') ?? [],
    (brief) => brief.isAdult,
    (brief) => brief.tags,
  ).slice(0, SHELF_SIZE)
})

const heroBrief = computed(() => {
  const item = heroItems.value.find((item) => item.mediaId === heroId.value)
  return item && heroReady.value[item.mediaId] ? item : null
})
const heroAllReady = computed(
  () =>
    heroItems.value.length > 0 && heroItems.value.every((item) => heroReady.value[item.mediaId]),
)
const heroCard = computed(() =>
  heroBrief.value === null ? null : (heroCards.value[heroBrief.value.mediaId] ?? null),
)
const heroTitle = computed(() =>
  heroBrief.value === null ? null : (heroTitles.value[heroBrief.value.mediaId] ?? null),
)
const heroRow = computed(() => (heroBrief.value === null ? null : toTileRow(heroBrief.value)))

function heroTarget(direction: -1 | 1): number | null {
  const items = heroItems.value
  if (items.length < 2 || heroId.value === null) return null
  const current = items.findIndex((item) => item.mediaId === heroId.value)
  if (current < 0) return null
  const index = (current + direction + items.length) % items.length
  const candidate = items[index]
  return candidate && heroReady.value[candidate.mediaId] ? index : null
}

function changeHero(direction: -1 | 1): void {
  const index = heroTarget(direction)
  const target = index === null ? undefined : heroItems.value[index]
  if (index === null || !target) return
  heroIndex.value = index
  heroId.value = target.mediaId
}

function nextHero(): void {
  changeHero(1)
}

watch(
  () => heroItems.value.map((item) => item.mediaId).join(','),
  () => {
    if (!heroItems.value.some((item) => item.mediaId === heroId.value)) heroId.value = null
    for (const item of heroItems.value) {
      const apply = (banner: NonNullable<ReturnType<typeof peekBanner>>) => {
        heroCards.value[item.mediaId] = banner.card
        if (banner.title) heroTitles.value[item.mediaId] = banner.title
        heroImages.value[item.mediaId] = banner.image
        heroReady.value[item.mediaId] = true
        if (
          heroId.value === null &&
          heroItems.value.some((candidate) => candidate.mediaId === item.mediaId)
        )
          heroId.value = item.mediaId
      }
      const cached = peekBanner(item.mediaId)
      if (cached) apply(cached)
      else
        void warmBanner(item.mediaId)
          .then(apply)
          .catch(() => {
            Logger('WARN', `Banner ${item.mediaId}: warm-up incomplete`)
          })
    }
  },
  { immediate: true },
)

// A complete slide receives fifteen full seconds before the next ready slide.
watch(
  () =>
    `${heroId.value}:${heroItems.value.map((item) => Number(heroReady.value[item.mediaId] === true)).join('')}:${heroAllReady.value}`,
  () => {
    if (heroTimer !== null) clearTimeout(heroTimer)
    heroTimer = null
    if (heroId.value !== null && heroItems.value.length > 1) heroTimer = setTimeout(nextHero, 15000)
  },
)

/** Сколько условий в отборе: число на кнопке «Фильтры». */
const pickCount = computed(
  () =>
    homePick.value.genres.length +
    homePick.value.tags.length +
    homePick.value.formats.length +
    (homePick.value.yearFrom !== null || homePick.value.yearTo !== null ? 1 : 0),
)

/** Быстрые жанры под политикой показа взрослого: при выключенном 18+
    «Хентая» нет и в быстрой ленте, а не только в выдаче. */
const genreList = computed<string[]>(() => GENRE_CHOICES.filter((genre) => genreAllowed(genre)))

/** Заголовок ленты: под отбором это результат подбора, без него — добавка
    к каруселям. */
const feedTitle = computed(() => (picked.value ? 'Подбор' : 'Ещё рекомендации'))

/** Показывать ли раздел ленты вообще. */
const feedShown = computed(
  () => feedBusy.value || feedRows.value.length > 0 || (picked.value && feedDone.value),
)

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Годы отбора одной подписью. */
function yearsWord(pick: CatalogPick): string {
  if (pick.yearFrom !== null && pick.yearTo !== null) {
    return pick.yearFrom === pick.yearTo
      ? String(pick.yearFrom)
      : `${pick.yearFrom}\u2013${pick.yearTo}`
  }
  if (pick.yearFrom !== null) return `с ${pick.yearFrom}`
  return `по ${pick.yearTo}`
}

/** Условия отбора строкой чипов: видно, чем сужен подбор, и снимается
    по одному, не открывая меню. */
const pickChips = computed<PickChip[]>(() => {
  const pick = homePick.value
  const out: PickChip[] = []

  for (const genre of pick.genres) {
    out.push({ key: `g:${genre}`, title: genreWord(genre) ?? genre, kind: 'genre', value: genre })
  }
  for (const tag of pick.tags) {
    out.push({ key: `t:${tag}`, title: tagWord(tag), kind: 'tag', value: tag })
  }
  for (const format of pick.formats) {
    out.push({
      key: `f:${format}`,
      title: formatWord(format) ?? format,
      kind: 'format',
      value: format,
    })
  }
  if (pick.yearFrom !== null || pick.yearTo !== null) {
    out.push({ key: 'y', title: yearsWord(pick), kind: 'years', value: '' })
  }

  return out
})

/** Короткая подпись под названием: вид и год. */
function factsText(look: MediaLook | null): string {
  if (look === null) return ''

  const parts: string[] = []
  const kindWord = formatWord(look.format)
  if (kindWord !== null) parts.push(kindWord)
  if (look.seasonYear !== null) parts.push(String(look.seasonYear))
  return parts.join(' · ')
}

/** Свой счёт частей на постере. */
function ownText(entry: SnapshotEntry, parts: number | null): string | null {
  const short = partsShort()
  if (parts === null) return entry.progress > 0 ? `${entry.progress} ${short}` : null
  return `${entry.progress} / ${parts} ${short}`
}

/** Вопрос об источниках по записи своей полки: берём все имена — любое может оказаться единственным;
 *  номер MAL бывает пустым у старых снимков. */
function playAskOf(entry: SnapshotEntry): PlayAsk {
  const look = peekLook(entry.mediaId)
  const names = [
    ...new Set([
      entry.romaji ?? '',
      entry.english ?? '',
      look?.romaji ?? '',
      peekRussianName(entry.mediaId) ?? '',
    ]),
  ]

  return {
    mediaId: entry.mediaId,
    malId: entry.malId ?? null,
    titles: names.filter((name) => name !== ''),
    year: look?.seasonYear ?? undefined,
  }
}

/** Строчка ряда с полки своего списка. */
function toRow(entry: SnapshotEntry): Row {
  // Появление постеров — тоже повод перерисовать строку: иначе плитка останется с адресом CDN.
  watchCovers()
  const look = peekLook(entry.mediaId)

  // У идущего сезона итога может не быть вовсе: считаем по вышедшему.
  const parts = partsCeiling(look)
  const done =
    parts !== null && parts > 0 && entry.progress > 0 ? Math.min(1, entry.progress / parts) : 0

  return {
    mediaId: entry.mediaId,
    title:
      peekRussianName(entry.mediaId) ??
      entry.romaji ??
      entry.english ??
      look?.romaji ??
      `Аниме #${entry.mediaId}`,
    facts: factsText(look),
    mark: entry.score10 > 0 ? `★ ${entry.score10.toFixed(1)}` : null,
    own: ownText(entry, parts),
    done,
    soon: notOutYet(look),
    play: peekPlayable(entry.mediaId),
    cover: look?.cover ?? null,
    color: look?.color ?? null,
    adult: entry.isAdult,
    regulated: peekRegulated(entry.mediaId),
  }
}

/** Пересобирает плитки своей полки из памяти. */
function redrawOwn(): void {
  ownRows.value = ownEntries.map(toRow)
}

/** Пересобирает плитки ленты; взрослое отсеивается при отрисовке: набранное живёт дольше настройки. */
function drawFeed(): void {
  const reserved = new Set(recs.value.flatMap((shelf) => shelf.rows.map((row) => row.mediaId)))
  feedRows.value = keepAllowed(
    feedKeep.items,
    (item) => item.isAdult,
    (item) => item.tags,
  )
    .filter((item) => !reserved.has(item.mediaId))
    .map(toTileRow)
}

/** Добирает обложки своей полки: снимок картинок не хранит. */
async function fillLooks(): Promise<void> {
  const mine = ++lookRun
  const wanted = ownEntries
    .filter((entry) => peekLook(entry.mediaId) === null)
    .map((entry) => entry.mediaId)

  if (wanted.length === 0) return

  try {
    await warmLooks(wanted)
    if (mine !== lookRun) return

    redrawOwn()
  } catch (e) {
    // Без обложки плитка останется с буквой названия — это не повод ругаться.
    Logger('WARN', 'Главная: обложки добрать не вышло', e)
  }
}

/** Добирает русские названия верхним плиткам своей полки. */
async function fillTitles(): Promise<void> {
  const mine = ++titleRun
  const wanted = ownEntries
    .slice(0, TITLE_DEPTH)
    .filter((entry) => peekRussianName(entry.mediaId) === null)
    .map((entry) => entry.mediaId)

  if (wanted.length === 0) return

  try {
    for (let from = 0; from < wanted.length; from += TITLE_CHUNK) {
      if (mine !== titleRun) return

      // Полке нужно только имя: описание и оценки спросит открытая карточка.
      await prefetchRussianNames(wanted.slice(from, from + TITLE_CHUNK))
      if (mine !== titleRun) return

      redrawOwn()
    }
  } catch (e) {
    Logger('WARN', 'Главная: названия добрать не вышло', e)
  }
}

/** Держит подъём склада в общем заходе: askSeen ждёт его целиком, а не
    ту полку, что приехала последней. */
function keepPriming(job: Promise<void>): void {
  priming = Promise.all([priming, job]).then(() => undefined)
}

/** Поднимает склад доступности по своей полке: он отвечает даром и разом по всем номерам. */
function loadOwnMarks(): void {
  if (ownEntries.length === 0) return

  const mine = ++playRun
  const job = primePlayable(ownEntries.map((entry) => entry.mediaId))
    .then((primed) => {
      if (mine === playRun && primed > 0) redrawOwn()
    })
    .catch((e) => {
      Logger('WARN', 'Главная: склад доступности своей полки не поднялся', e)
    })

  keepPriming(job)
}

/** Своя полка по памяти списка: продолжение просмотра и пересмотра. */
function ownWatching(): SnapshotEntry[] {
  // Взрослое отсеивается здесь, на входе: скрытая запись не тянет ни обложку, ни имя, ни вопрос.
  return selectEntries(
    { status: ['CURRENT', 'REPEATING'], hideAdult: true },
    { key: 'updated' },
  ).slice(0, SHELF_SIZE)
}

/** Своя полка: продолжение просмотра и пересмотра. */
function buildOwn(): void {
  ownEntries = ownWatching()
  redrawOwn()
  void fillLooks()
  void fillTitles()
  loadOwnMarks()

  // Календарю нужны все свои тайтлы, а не четырнадцать на полке, и закладки шире (OWN_STATUSES): календарь отвечает «что у меня выходит». Номера запоминаются для смены области показа.
  calendarIds = selectEntries({ status: [...OWN_STATUSES] }).map((entry) => entry.mediaId)
  void loadCalendar(calendarIds)
}

/** Состав витрины: порядок важен и для экрана, и для раздачи повторов. Под отбором каруселей нет. */
function shelfDefs(): ShelfDef[] {
  if (picked.value) return []

  return [
    { key: 'taste', title: 'Под ваш вкус' },
    { key: 'motif', title: 'По мотивам вашего списка' },
    { key: 'airing', title: 'Сейчас выходит' },
    { key: 'trending', title: 'В тренде' },
    { key: 'top', title: 'Лучшее за всё время' },
  ]
}

/** Собирает полки в показ по порядку состава; аниме показывается ровно на одной полке (выборки
    пересекаются), взрослое отсеивается здесь: состав полок запоминается дольше настройки. */
function publish(): void {
  const out: Shelf[] = []
  const distributed = distributeShelves(
    activeDefs.map((def) => def.key),
    new Map(
      [...staged].map(([key, items]) => [
        key,
        keepAllowed(
          items,
          (brief) => brief.isAdult,
          (brief) => brief.tags,
        ),
      ]),
    ),
    SHELF_SIZE,
  )

  for (const def of activeDefs) {
    const fresh = distributed.get(def.key) ?? []
    if (fresh.length < SHELF_MIN) continue
    out.push({ key: def.key, title: def.title, rows: fresh.map(toTileRow) })
  }

  recs.value = out
  drawFeed()
}

/** Без отбора лента ждёт полки: иначе «Ещё рекомендации» успевает показать дубли до их приезда. */
async function waitForRecs(): Promise<void> {
  if (picked.value || !recsPending.value) return
  await new Promise<void>((resolve) => {
    const stop = watch(recsPending, (pending) => {
      if (pending) return
      stop()
      resolve()
    })
  })
}

// Очередь доступности отвечает вразброд, и один ответ часто касается разом полки, витрины и ленты.
const stopPlayWatch = onPlayableChange(() => {
  redrawOwn()
  publish()
  drawFeed()
})

/** Вопрос об источниках по номеру плитки: у своей полки есть MAL из снимка, у каталога — бриф.
 *  Анонс не спрашивается: ответ известен заранее. */
function askFor(mediaId: number): PlayAsk | null {
  const own = ownEntries.find((entry) => entry.mediaId === mediaId)
  if (own !== undefined) return playAskOf(own)

  for (const items of staged.values()) {
    const brief = items.find((item) => item.mediaId === mediaId)
    if (brief === undefined) continue

    return brief.status === SOON_STATUS ? null : toPlayAsk(brief)
  }

  const inFeed = feedKeep.items.find((item) => item.mediaId === mediaId)
  if (inFeed === undefined) return null

  return inFeed.status === SOON_STATUS ? null : toPlayAsk(inFeed)
}

/** Забывает показанное: смена отбора и уход с экрана снимают накопленное
    вместе с недоспрошенной пачкой. */
function dropSeen(): void {
  askRun++

  if (seenTimer !== null) {
    clearTimeout(seenTimer)
    seenTimer = null
  }

  seenTiles.clear()
  askedTiles.clear()
}

/** Спрашивает чужие службы про показанные плитки одной пачкой, дождавшись склада на диске. */
async function askSeen(): Promise<void> {
  const mine = askRun

  await priming
  if (mine !== askRun) return

  const wanted: PlayAsk[] = []
  for (const mediaId of seenTiles) {
    if (askedTiles.has(mediaId) || peekPlayable(mediaId) !== null) continue

    const ask = askFor(mediaId)
    if (ask === null) continue

    askedTiles.add(mediaId)
    wanted.push(ask)
  }
  seenTiles.clear()

  if (wanted.length === 0) return

  try {
    // Реестр источников собирает не ядро, а слой api, и до плеера человек может и не дойти. Повторный зов ничего не стоит: сборка идёт один раз.
    setupVideoSources()

    await requestPlayable(wanted)
    if (mine !== askRun) return

    redrawOwn()
    publish()
    drawFeed()
  } catch (e) {
    // Без ответа плитка останется без метки, а не с ложной: так и задумано.
    Logger('WARN', 'Главная: метки доступности не доехали', e)
  }
}

/** Плитка попала в окно: копим номер и спрашиваем пачкой после паузы. */
function onTileSeen(mediaId: number): void {
  if (askedTiles.has(mediaId) || peekPlayable(mediaId) !== null) return

  seenTiles.add(mediaId)
  if (seenTimer !== null) return

  seenTimer = setTimeout(() => {
    seenTimer = null
    void askSeen()
  }, SEEN_PAUSE_MS)
}

/** Добирает русские названия плиткам полки витрины. */
async function warmRecTitles(mine: number, key: ShelfName): Promise<void> {
  const items = staged.get(key)
  if (items === undefined) return

  const wanted = items
    .filter((brief) => peekRussianName(brief.mediaId) === null)
    .map((brief) => brief.mediaId)

  try {
    for (let from = 0; from < wanted.length; from += TITLE_CHUNK) {
      if (mine !== recsRun) return

      await prefetchRussianNames(wanted.slice(from, from + TITLE_CHUNK))
      if (mine !== recsRun) return

      publish()
    }
  } catch (e) {
    Logger('WARN', 'Главная: названия витрины добрать не вышло', e)
  }
}

/** Поднимает склад доступности по полке витрины: даром и разом; в сеть идёт показ плитки, а не приезд. */
function primeShelfMarks(mine: number, key: ShelfName): void {
  const items = staged.get(key)
  if (items === undefined || items.length === 0) return

  const job = primePlayable(items.map((brief) => brief.mediaId))
    .then((primed) => {
      if (mine === recsRun && primed > 0) publish()
    })
    .catch((e) => {
      Logger('WARN', 'Главная: склад доступности витрины не поднялся', e)
    })

  keepPriming(job)
}

/** Добор одной полки: склад ставится сразу и не ждёт никого, а имена идут
    заходами. Имя важнее метки: без него плитку не узнать вовсе. */
async function warmRecShelf(mine: number, key: ShelfName): Promise<void> {
  primeShelfMarks(mine, key)
  await warmRecTitles(mine, key)
}

/** Тот же добор для новой порции ленты: склад разом, имена заходами,
    а вопросы в сеть — по показу. */
async function warmFeed(mine: number, items: MediaBrief[]): Promise<void> {
  const job = primePlayable(items.map((brief) => brief.mediaId))
    .then((primed) => {
      if (mine === feedRun && primed > 0) drawFeed()
    })
    .catch((e) => {
      Logger('WARN', 'Главная: склад доступности ленты не поднялся', e)
    })

  keepPriming(job)

  const wanted = items
    .filter((brief) => peekRussianName(brief.mediaId) === null)
    .map((brief) => brief.mediaId)

  try {
    for (let from = 0; from < wanted.length; from += TITLE_CHUNK) {
      if (mine !== feedRun) return

      await prefetchRussianNames(wanted.slice(from, from + TITLE_CHUNK))
      if (mine !== feedRun) return

      drawFeed()
    }
  } catch (e) {
    Logger('WARN', 'Главная: названия ленты добрать не вышло', e)
  }
}

/** Полки витрины: каждая встаёт сама по готовности. Три полки каталога
    делят один запрос, поэтому приезжают вместе, а не одна за другой. */
function loadRecs(): void {
  const mine = ++recsRun
  staged.clear()
  recs.value = []
  activeDefs = shelfDefs()
  recsPending.value = activeDefs.length > 0

  const tasks = activeDefs.map((def) =>
    shelfFill(def.key, SHELF_FETCH)
      .then((items) => {
        if (mine !== recsRun || items.length === 0) return
        staged.set(def.key, items)
        publish()
        void warmRecShelf(mine, def.key)
      })
      .catch((e) => {
        Logger('WARN', `Главная: полка «${def.key}» не доехала`, e)
      }),
  )

  void Promise.allSettled(tasks).then(() => {
    if (mine === recsRun) recsPending.value = false
  })
}

/** Добирает очередную порцию ленты. Обход помнит страницу и показанные
    номера, поэтому «Показать ещё» не приводит повторов. */
async function growFeed(mine: number): Promise<void> {
  const run = feedKeep.run
  if (run === null || feedBusy.value) return

  feedBusy.value = true

  try {
    await waitForRecs()
    if (mine !== feedRun) return
    const reserved = new Set(recs.value.flatMap((shelf) => shelf.rows.map((row) => row.mediaId)))
    const got = await feedMore(run, FEED_WANT, reserved)
    if (mine !== feedRun) return

    // Обложки приехали вместе с ответом: кладём их в общую память даром, иначе списки и карточки полезут за тем же самым второй раз.
    for (const brief of got) rememberBrief(brief)

    feedKeep.items = [...feedKeep.items, ...got]
    feedDone.value = run.done
    drawFeed()

    void warmFeed(mine, got)
  } catch (e) {
    Logger('WARN', 'Главная: лента подбора не доехала', e)
  } finally {
    if (mine === feedRun) feedBusy.value = false
  }
}

/** Заводит ленту под нынешний отбор. Набранное переживает уход на карточку:
    возврат к сотне постеров не должен начинаться с первой страницы. */
function startFeed(): void {
  const mine = ++feedRun
  const key = pickKey(homePick.value)

  if (feedKeep.key === key && feedKeep.run !== null && feedKeep.items.length > 0) {
    feedDone.value = feedKeep.run.done
    drawFeed()
    return
  }

  dropFeed()
  feedKeep.key = key
  feedKeep.run = newFeed({ ...homePick.value })
  feedRows.value = []
  feedDone.value = false
  void growFeed(mine)
}

/** Кнопка «Показать ещё». */
function onMore(): void {
  void growFeed(feedRun)
}

/** Добирает полку после отметки: отметка убирает плитку, а не полку — ядро отдаёт следующую из запаса;
 *  номер добора отсекает прежний ответ. */
function refill(mine: number, key: ShelfName): void {
  const run = (refillRun.get(key) ?? 0) + 1
  refillRun.set(key, run)

  void shelfFill(key, SHELF_FETCH)
    .then((items) => {
      if (mine !== recsRun || refillRun.get(key) !== run || items.length === 0) return

      staged.set(key, items)
      publish()
      void warmRecShelf(mine, key)
    })
    .catch((e) => {
      Logger('WARN', `Главная: полка «${key}» не добралась`, e)
    })
}

/** Прячет аниме из витрины и ленты: из памяти сразу, в хранилище — вдогонку, и запись ждётся,
 *  иначе добор вернул бы отмеченное. */
function hideOne(mediaId: number): void {
  const mine = recsRun

  void (async () => {
    await hideRec(mediaId)

    const hit: ShelfName[] = []
    for (const [key, items] of staged) {
      const at = items.findIndex((brief) => brief.mediaId === mediaId)
      if (at < 0) continue

      items.splice(at, 1)
      hit.push(key)
    }

    if (mine !== recsRun) return
    publish()

    const inFeed = feedKeep.items.findIndex((brief) => brief.mediaId === mediaId)
    if (inFeed >= 0) {
      feedKeep.items.splice(inFeed, 1)
      drawFeed()
    }

    for (const key of hit) refill(mine, key)
  })()
}

/** Чип жанра под шапкой: быстрый отбор без меню. */
function toggleGenre(genre: string): void {
  const pick = homePick.value
  homePick.value = {
    ...pick,
    genres: pick.genres.includes(genre)
      ? pick.genres.filter((item) => item !== genre)
      : [...pick.genres, genre],
  }
}

/** Снимает одно условие отбора. */
function dropChip(chip: PickChip): void {
  const pick = homePick.value

  if (chip.kind === 'genre') {
    homePick.value = { ...pick, genres: pick.genres.filter((item) => item !== chip.value) }
    return
  }
  if (chip.kind === 'tag') {
    homePick.value = { ...pick, tags: pick.tags.filter((item) => item !== chip.value) }
    return
  }
  if (chip.kind === 'format') {
    homePick.value = { ...pick, formats: pick.formats.filter((item) => item !== chip.value) }
    return
  }

  homePick.value = { ...pick, yearFrom: null, yearTo: null }
}

/** Сброс отбора: витрина возвращается к пяти полкам. */
function resetPick(): void {
  homePick.value = emptyPick()
}

/** Вертикальное колесо над лентой жанров сдвигает её горизонтально: без этого ряд читается обрезанным. */
function onGenreWheel(e: WheelEvent): void {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  const target = e.currentTarget as HTMLElement | null
  if (!target) return
  e.preventDefault()
  target.scrollLeft += e.deltaY
}

/** Меню отдало готовый отбор целиком. */
function onApply(pick: CatalogPick): void {
  homePick.value = pick
  sheetOpen.value = false
}

function open(mediaId: number): void {
  navigate('media', { id: String(mediaId) })
}

/** Открытие окна правки прямо с плитки: титул для шапки и номер записи. */
function openEdit(row: { mediaId: number; title: string }): void {
  editName.value = row.title
  editLookDraft.value = lookOf(row.mediaId)
  editId.value = row.mediaId
}

function closeEdit(): void {
  editId.value = 0
}

/** Облик для новой записи: имя и метка 18+ берутся у своей записи или у брифа каталога; сведения
 *  для баннера (вид, год, серии) — там же, длина серии у брифа нет. */
function lookOf(mediaId: number): EntryLook | undefined {
  const known = [...staged.values()].flat().find((brief) => brief.mediaId === mediaId)
  const brief = known ?? feedKeep.items.find((item) => item.mediaId === mediaId)
  const own = getEntry(mediaId)
  if (own !== undefined) {
    return {
      romaji: own.romaji,
      english: own.english,
      isAdult: own.isAdult,
      format: own.format,
      seasonYear: own.seasonYear,
      episodes: own.episodes ?? brief?.episodes ?? null,
      airingEpisode: brief?.airingEpisode ?? null,
      duration: own.duration ?? brief?.duration ?? null,
    }
  }

  if (brief === undefined) return undefined

  return {
    romaji: brief.romaji,
    english: brief.english,
    isAdult: brief.isAdult,
    format: brief.format,
    seasonYear: brief.seasonYear,
    episodes: brief.episodes,
    airingEpisode: brief.airingEpisode,
  }
}

/** Пересборка показов после правки: метки плиток и состав своей полки. Календарь не трогаем. */
function redrawAll(): void {
  ownEntries = ownWatching()
  redrawOwn()
  publish()
  drawFeed()
}

/** Кладёт одну правку в память и пересобирает показы синхронно и без сети. */
function sendEdit(kind: EntryEdit, value: string | number): void {
  if (editId.value === 0) return

  try {
    editEntry(editId.value, kind, value, editLookDraft.value)
    editStamp.value += 1
    redrawAll()
  } catch (e) {
    trouble.value = describe(e)
  }
}

function onEditStatus(value: string): void {
  sendEdit('status', value)
}

/** Убрать тайтл из списка из окна правки: запись с параметрами исчезает, и список, и статистика
 * теряют
 * его сразу. На сервере AniList запись остаётся — правки оттуда никогда не уезжали. */
function onEditRemove(): void {
  if (editId.value === 0) return

  try {
    // Облик не нужен: удаление забирает запись целиком, а подпись для журнала берётся из неё самой.
    editEntry(editId.value, 'remove', null)
    editStamp.value += 1
    redrawAll()
  } catch (e) {
    trouble.value = describe(e)
  }

  closeEdit()
}

function onEditScore(value: number): void {
  sendEdit('score', value)
}

function onEditProgress(value: number): void {
  sendEdit('progress', value)
}

function onEditRepeat(value: number): void {
  sendEdit('repeat', value)
}

function onEditStarted(value: string): void {
  sendEdit('startedAt', value)
}

function onEditCompleted(value: string): void {
  sendEdit('completedAt', value)
}

function onEditNotes(value: string): void {
  sendEdit('notes', value)
}

function toLists(): void {
  navigate('lists')
}

function toSearch(): void {
  navigate('search')
}

function toSettings(): void {
  navigate('settings')
}

onMounted(() => {
  startLightLines()
  deviationTimer.value = window.setInterval(triggerSakuraDeviation, 30000)
  // Россыпь считается по месту, а не по числу: её ставит наблюдатель за размером плашки.
  layoutSpray()
  if (typeof ResizeObserver !== 'undefined' && heyPlate.value !== null) {
    sprayEye = new ResizeObserver(() => layoutSpray())
    sprayEye.observe(heyPlate.value)
  }

  void (async () => {
    try {
      // Подъём снимка без сети: главная должна открываться и при лежащем API.
      await initCollection()
    } catch (e) {
      trouble.value = describe(e)
      busy.value = false
      return
    }

    busy.value = false
    buildOwn()
    loadRecs()
    startFeed()
  })()
})

onBeforeUnmount(() => {
  if (deviationTimer.value !== null) window.clearInterval(deviationTimer.value)
  deviationTimer.value = null
  lightTimers.forEach((timer) => clearTimeout(timer))
  lightTimers.length = 0
  sprayEye?.disconnect()
  sprayEye = null
  lookRun++
  titleRun++
  playRun++
  recsRun++
  feedRun++
  if (heroTimer !== null) clearTimeout(heroTimer)
  heroTimer = null
  dropSeen()

  // Очередь живёт дольше экрана: неснятая подписка держала бы всю витрину в памяти и пересобирала её на каждый ответ чужого экрана.
  stopPlayWatch()
})

// Страж busy не пускает пересборку до подъёма снимка; ключ отбора, а не объект: копия с теми же условиями не должна гонять сеть заново.
watch(
  () => pickKey(homePick.value),
  () => {
    if (busy.value) return

    // Прежняя витрина уходит целиком, и недоспрошенная пачка вместе с ней: новые полки поднимут свои плитки сами, когда встанут в окно.
    dropSeen()
    loadRecs()
    startFeed()
  },
)
</script>

<template>
  <section class="am-page">
    <section
      v-if="!picked"
      class="am-hero"
      :role="heroCurrentReady ? 'button' : undefined"
      :tabindex="heroCurrentReady ? 0 : -1"
      :style="{
        '--am-hero-image': heroBrief ? `url(${heroImages[heroBrief.mediaId] ?? ''})` : 'none',
      }"
      @click="heroCurrentReady && heroBrief && open(heroBrief.mediaId)"
      @keydown.enter.prevent="heroCurrentReady && heroBrief && open(heroBrief.mediaId)"
      @keydown.space.prevent="heroCurrentReady && heroBrief && open(heroBrief.mediaId)"
    >
      <div v-if="!heroCurrentReady" class="am-hero__loading"><span class="am-hero__spinner" /></div>
      <div v-else-if="heroBrief && heroRow" :key="heroBrief.mediaId" class="am-hero__body">
        <h1
          class="am-hero__title"
          :class="{
            'am-hero__title--long': (heroTitle?.russian ?? heroRow.title).length > 42,
            'am-hero__title--xlong': (heroTitle?.russian ?? heroRow.title).length > 68,
          }"
        >
          {{ heroTitle?.russian ?? peekRussianName(heroBrief.mediaId) ?? heroRow.title }}
        </h1>
        <div class="am-hero__facts">
          <span v-if="heroBrief.averageScore !== null" class="am-hero__score">
            ★ {{ (heroBrief.averageScore / 10).toFixed(1) }}
          </span>
          <span v-if="heroBrief.seasonYear">{{ heroBrief.seasonYear }}</span>
          <span v-if="heroBrief.format">{{ formatWord(heroBrief.format) }}</span>
          <span v-if="heroBrief.episodes">{{ heroBrief.episodes }} серий</span>
          <span v-if="heroBrief.isAdult" class="am-hero__adult">18+</span>
        </div>
        <p v-if="heroCard?.genres.length" class="am-hero__genres">
          {{ heroCard.genres.map((genre) => genreWord(genre) ?? genre).join(' · ') }}
        </p>
        <div v-if="heroTitle?.description ?? heroCard?.description" class="am-hero__description">
          {{ plainHeroDescription(heroTitle?.description ?? heroCard?.description) }}
        </div>
      </div>
      <div
        class="am-hero__navigation"
        role="group"
        aria-label="Слайды баннера"
        @click.stop
        @keydown.stop
      >
        <button
          class="am-hero__arrow"
          type="button"
          aria-label="Предыдущий слайд"
          :disabled="heroTarget(-1) === null"
          @click="changeHero(-1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
        </button>
        <div class="am-hero__dots" aria-hidden="true">
          <span
            v-for="(item, index) in heroItems"
            :key="item.mediaId"
            :class="{ 'am-hero__dot--on': item.mediaId === heroId }"
            :data-slide="index"
          />
        </div>
        <button
          class="am-hero__arrow"
          type="button"
          aria-label="Следующий слайд"
          :disabled="heroTarget(1) === null"
          @click="changeHero(1)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      </div>
    </section>

    <div ref="heyPlate" class="am-hey">
      <span class="am-hey__lines" aria-hidden="true">
        <span
          v-for="(line, index) in lightLines"
          :key="index"
          class="am-hey__line"
          :style="{
            left: `${line.left}%`,
            width: `${line.width}px`,
            opacity: line.opacity,
            transform: `rotate(${line.rotate}deg)`,
            transitionDuration: `${line.duration}s`,
            '--am-line-duration': `${line.duration}s`,
            '--am-line-flash': line.flash ? '1' : '0',
          }"
        />
      </span>
      <!-- Россыпь занимает всю плашку и проходит за текстом и календарём. -->
      <span class="am-hey__spray" aria-hidden="true">
        <span
          v-for="grain in grains"
          :key="grain.key"
          class="am-hey__grain"
          :class="[
            `am-hey__grain--${grain.depth}`,
            deviation?.key === grain.key ? `am-hey__grain--${deviation.action}` : '',
          ]"
          :style="{
            left: `${grain.left}px`,
            top: `${grain.top}px`,
            width: `${grain.size}px`,
            height: `${grain.tall}px`,
            '--am-hey-turn': `${grain.turn}deg`,
            '--am-hey-rot': `${grain.rot}deg`,
            '--am-hey-fx': `${grain.fx}px`,
            '--am-hey-fy': `${grain.fy}px`,
            '--am-hey-tx': `${grain.tx}px`,
            '--am-hey-ty': `${grain.ty}px`,
            '--am-hey-dur': `${grain.dur}s`,
            '--am-hey-delay': `${grain.delay}s`,
          }"
        >
          <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
        </span>
      </span>

      <div class="am-hey__text">
        <h2 class="am-hey__title">
          <span class="am-hey__seed"><SakuraMark /></span>
          <span>{{ splash }}</span>
        </h2>

        <div class="am-hey__acts">
          <button class="am-btn am-btn--soft" type="button" @click="toLists">Мои списки</button>
          <button class="am-btn am-btn--ghost" type="button" @click="toSearch">Найти аниме</button>
        </div>
      </div>

      <!-- Календарик в правой половине плашки. Отдельной карточкой он занимал целый ряд и
           читался как ещё один блок; здесь он встаёт в одну композицию с приветствием. -->
      <div class="am-hey__side">
        <ActivityYear bare />
      </div>
    </div>

    <p v-if="trouble" class="am-error">{{ trouble }}</p>

    <!-- Календарь выхода выше отбора: он отвечает на вопрос, ради которого приложение открывают завтра. -->
    <section v-if="calendarDays.length > 0" class="am-cal">
      <div class="am-cal__bar">
        <h2 class="am-h2">Выход серий</h2>

        <div class="am-seg" role="group" aria-label="Чья неделя">
          <button
            v-for="item in CALENDAR_SCOPES"
            :key="item.key"
            v-tip="item.hint"
            class="am-seg__btn"
            :class="{ 'am-seg__btn--on': calendarScope === item.key }"
            type="button"
            :aria-pressed="calendarScope === item.key"
            @click="setCalendarScope(item.key, calendarIds)"
          >
            {{ item.title }}
          </button>
        </div>

        <span class="am-bar__gap" />
        <span class="am-cal__span">{{ calendarSpan }}</span>
      </div>

      <div class="am-cal__strip" role="group" aria-label="Дни недели">
        <button
          v-for="day in calendarDays"
          :key="day.key"
          v-tip="day.title"
          class="am-cal__day"
          :class="{
            'am-cal__day--on': day.key === calendarDay?.key,
            'am-cal__day--today': day.today,
            'am-cal__day--past': day.past,
          }"
          type="button"
          :aria-label="day.title"
          :aria-pressed="day.key === calendarDay?.key"
          @click="pickDay(day.key)"
        >
          <!-- Розетки по краям: клетка широкая и низкая, а читать в ней нечего, кроме числа
               и точки, так что место занимает декор. Виден он только на выбранном дне —
               см. .am-cal__rose в стилях. Та же геометрия, что у плиток статистики и в россыпи
               на главной; пара симметрична, а поворот у каждого дня свой. -->
          <span class="am-cal__rose am-cal__rose--l" aria-hidden="true">
            <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
          </span>
          <span class="am-cal__rose am-cal__rose--r" aria-hidden="true">
            <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
          </span>

          <span class="am-cal__word">{{ day.word }}</span>
          <span class="am-cal__num">{{ day.num }}</span>
          <span
            class="am-cal__dot"
            :class="{ 'am-cal__dot--on': day.rows.length > 0 }"
            aria-hidden="true"
          />
        </button>
      </div>

      <p v-if="calendarBusy && (calendarDay?.rows.length ?? 0) === 0" class="am-cal__note">
        Спрашиваю расписание…
      </p>

      <p v-else-if="calendarFailed" class="am-cal__note">Расписание не пришло — проверьте связь.</p>

      <!-- День — полка постеров с боковой прокруткой, а не список строк: иначе суббота вытесняла
           полки за край. Метку доступности календарь добывает сам всем днём, поэтому v-seen нет. -->
      <ul v-else-if="dayRows.length > 0" class="am-rail am-cal__rail">
        <MediaTile
          v-for="row in dayRows"
          :key="row.key"
          :title="row.title"
          :facts="row.facts"
          :cover="row.cover"
          :color="row.color"
          :play="row.play"
          @open="open(row.mediaId)"
        />
      </ul>

      <!-- Пустой день — пустое состояние со знаком. -->
      <p v-else class="am-cal__note am-cal__note--none">
        <span class="am-cal__mark"><EmptyMark name="calendar" /></span>
        <span>В этот день выходов нет.</span>
      </p>
    </section>

    <!-- Ряд отбора: кнопка меню, быстрые жанры и сброс; внутренний ряд — для центровки. -->
    <div class="am-sift">
      <button class="am-btn am-sift__open" type="button" @click="sheetOpen = true">
        Фильтры
        <span v-if="pickCount > 0" class="am-sift__num">{{ pickCount }}</span>
      </button>

      <div class="am-choose" @wheel="onGenreWheel">
        <div class="am-choose__row">
          <button
            v-for="genre in genreList"
            :key="genre"
            class="am-chip"
            :class="{ 'am-chip--on': homePick.genres.includes(genre) }"
            type="button"
            @click="toggleGenre(genre)"
          >
            {{ genreWord(genre) ?? genre }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="picked" class="am-now">
      <button
        v-for="chip in pickChips"
        :key="chip.key"
        class="am-chip am-chip--on"
        type="button"
        @click="dropChip(chip)"
      >
        {{ chip.title }}
        <span class="am-now__off" aria-hidden="true">×</span>
      </button>

      <button class="am-btn am-btn--ghost" type="button" @click="resetPick">Сбросить</button>
    </div>

    <div v-if="busy" class="am-shelf">
      <ul class="am-rail">
        <li v-for="n in HOLD_COUNT" :key="n" class="am-hold">
          <span class="am-skeleton am-hold__art" />
          <span class="am-skeleton am-hold__line" />
        </li>
      </ul>
    </div>

    <template v-else>
      <!-- v-seen на плитке: метку доступности спрашиваем только про то, что попало в окно. -->
      <section v-if="ownRows.length > 0" class="am-shelf am-shelf--mine">
        <div class="am-bar">
          <h2 class="am-h2 am-shelf__head">
            <SakuraMark class="am-shelf__mine" />
            Продолжаю смотреть
          </h2>
          <span class="am-bar__gap" />
          <button class="am-btn am-btn--ghost" type="button" @click="toLists">К спискам</button>
        </div>

        <ul class="am-rail">
          <MediaTile
            v-for="row in ownRows"
            :key="row.mediaId"
            v-seen="() => onTileSeen(row.mediaId)"
            :title="row.title"
            :facts="row.facts"
            :cover="row.cover"
            :color="row.color"
            :mark="row.mark"
            :own="row.own"
            :done="row.done"
            :soon="row.soon"
            :play="row.play"
            :adult="row.adult"
            :regulated="row.regulated"
            editable
            @open="open(row.mediaId)"
            @edit="openEdit(row)"
          />
        </ul>
      </section>

      <section v-for="shelf in recs" :key="shelf.key" class="am-shelf">
        <div class="am-bar">
          <h2 class="am-h2">{{ shelf.title }}</h2>
        </div>

        <ul class="am-rail">
          <MediaTile
            v-for="row in shelf.rows"
            :key="row.mediaId"
            v-seen="() => onTileSeen(row.mediaId)"
            :title="row.title"
            :facts="row.facts"
            :cover="row.cover"
            :color="row.color"
            :score="row.score"
            :mark="row.mark"
            :repeat="row.repeat"
            :note="row.note"
            :own="row.own"
            :done="row.done"
            :soon="row.soon"
            :play="row.play"
            :adult="row.adult"
            :regulated="row.regulated"
            editable
            hidable
            @open="open(row.mediaId)"
            @hide="hideOne(row.mediaId)"
            @edit="openEdit(row)"
          />
        </ul>
      </section>

      <!-- Лента подбора: тот же вид плиток, но сеткой и без конца. -->
      <section v-if="feedShown" class="am-shelf">
        <div class="am-bar">
          <h2 class="am-h2">{{ feedTitle }}</h2>
        </div>

        <ul v-if="feedRows.length > 0" class="am-grid">
          <MediaTile
            v-for="row in feedRows"
            :key="row.mediaId"
            v-seen="() => onTileSeen(row.mediaId)"
            :title="row.title"
            :facts="row.facts"
            :cover="row.cover"
            :color="row.color"
            :score="row.score"
            :mark="row.mark"
            :repeat="row.repeat"
            :note="row.note"
            :own="row.own"
            :done="row.done"
            :soon="row.soon"
            :play="row.play"
            :adult="row.adult"
            :regulated="row.regulated"
            editable
            hidable
            @open="open(row.mediaId)"
            @hide="hideOne(row.mediaId)"
            @edit="openEdit(row)"
          />
        </ul>

        <ul v-else-if="feedBusy" class="am-grid">
          <li v-for="n in HOLD_COUNT" :key="n" class="am-hold">
            <span class="am-skeleton am-hold__art" />
            <span class="am-skeleton am-hold__line" />
          </li>
        </ul>

        <div v-else class="am-empty">
          <span class="am-empty__mark"><EmptyMark name="sieve" /></span>
          <span>По такому отбору ничего не нашлось.</span>
          <span>Снимите пару условий — подбор станет шире.</span>

          <div class="am-empty__acts">
            <button class="am-btn" type="button" @click="resetPick">Сбросить отбор</button>
          </div>
        </div>

        <div v-if="!feedDone && feedRows.length > 0" class="am-more">
          <button class="am-btn am-btn--soft" type="button" :disabled="feedBusy" @click="onMore">
            {{ feedBusy ? 'Грузим…' : 'Показать ещё' }}
          </button>
        </div>
      </section>

      <div
        v-if="!recsPending && !feedShown && ownRows.length === 0 && recs.length === 0"
        class="am-empty"
      >
        <span class="am-empty__mark"><EmptyMark name="tray" /></span>
        <span>Свой список пуст — добавьте тайтлы или импортируйте список.</span>
        <span>Когда сеть вернётся, здесь появятся рекомендации.</span>

        <div class="am-empty__acts">
          <button class="am-btn" type="button" @click="toSearch">Найти аниме</button>
          <button class="am-btn am-btn--ghost" type="button" @click="toSettings">
            Перенести список с AniList
          </button>
        </div>
      </div>
    </template>

    <FilterSheet :open="sheetOpen" :pick="homePick" @close="sheetOpen = false" @apply="onApply" />

    <!-- То же окно, что на карточке и в списках: метку ставят с плитки, не заходя в тайтл. -->
    <Transition name="am-sheet">
      <EntrySheet
        v-if="editRow"
        :title="editName"
        :status="editStatus"
        :score10="editRow.score10"
        :progress="editRow.progress"
        :parts-total="editParts"
        :ongoing="editOngoing"
        :repeat="editRow.repeat"
        :started-at="editRow.startedAt"
        :completed-at="editRow.completedAt"
        :notes="editRow.notes"
        @close="closeEdit"
        @status="onEditStatus"
        @remove="onEditRemove"
        @score="onEditScore"
        @progress="onEditProgress"
        @repeat="onEditRepeat"
        @started-at="onEditStarted"
        @completed-at="onEditCompleted"
        @notes="onEditNotes"
      />
    </Transition>
  </section>
</template>

<style scoped>
.am-hero__loading,
.am-home-hero__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  background: var(--am-panel);
}
.am-hero__spinner,
.am-home-hero__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgb(var(--am-accent-rgb) / 0.22);
  border-top-color: var(--am-accent);
  border-radius: 50%;
  animation: am-hero-spin 0.8s linear infinite;
}
@keyframes am-hero-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Приветствие: первое, что видно при запуске. Форма — лист, а не карточка:
   один угол срезан и полоса перестаёт быть прямоугольником среди прямоугольников.
   Половины две: слева приветствие, справа календарик активности. Высота сетки от ширины
   окна не зависит: клетка задана в пикселях, а где полосы недостаёт — доска прокручивается
   вбок. Нижняя граница колонок не задана: полосы разной высоты, и общее дно стянуло бы
   плашку по короткой. */
.am-hey {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  /* Половин может быть и одна: в узкое окно календарик перестаёт помещаться рядом
     с приветствием и уходит под него, а не сжимается в нечитаемую полосу. */
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: clamp(12px, 1.6vw, 20px);
  /* Отступ по вертикали мал нарочно: высота плашки принадлежит календарику, а он берёт размер
     клетки от своих пикселей — сорок пикселей поля ужимали бы плашку, а не год. */
  padding: clamp(14px, 1.7vw, 22px) clamp(20px, 3vw, 40px);
  background: var(--am-glass);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-leaf);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur-strong)) saturate(1.5);
}

/* Календарик встаёт рядом с приветствием, только когда под год хватает ширины: у сетки пятьдесят
   три колонки, и на узкой половине квадраты выродились бы в крапины — при равных долях на окне в
   тысячу пикселей квадрат выходил четыре пикселя. Ниже порога он уходит под приветствие и
   занимает всю полосу. Доля календарику почти вдвое: он берёт высоту от ширины своих колонок, а
   плашке высота нужна ради него, а не ради полей. */
@media (min-width: 1240px) {
  .am-hey {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.8fr);
  }
}

/* Слева приветствие столбцом: фраза сверху, кнопки под ней. */
.am-hey__text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 74ch;
}

/* Правая половина. Сжиматься ей нельзя: клетке года задан размер в пикселях, и на сжатой
   половине сетка превращалась бы в прокрутку без конца. Зато по высоте она тянется на всю
   плашку: высоту полосы задаёт самая высокая половина, и без растяжения календарик вставал бы
   по центру, оставляя под собой и над собой пустоту. */
.am-hey__side {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-self: stretch;
  min-width: 0;
}

.am-hey__lines {
  position: absolute;
  inset: -20% -12%;
  z-index: 0;
  pointer-events: none;
}

.am-hey__line {
  position: absolute;
  top: -12%;
  bottom: -12%;
  width: 34px;
  opacity: 0.42;
  background: linear-gradient(
    180deg,
    transparent,
    rgb(var(--am-accent-rgb) / 0.9) 38%,
    rgb(var(--am-accent-2-rgb) / 0.5) 62%,
    transparent
  );
  filter: blur(9px);
  transform: rotate(14deg);
  transition:
    left var(--am-line-duration, 4s) cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity var(--am-line-duration, 4s) ease,
    transform var(--am-line-duration, 4s) ease;
}

.am-hey__line::before {
  position: absolute;
  inset: 0;
  content: '';
  background: inherit;
  opacity: 0;
  filter: blur(4px);
  animation: am-hey-line-flash 9s ease-in-out infinite;
}

@keyframes am-hey-line-flash {
  0%,
  78%,
  100% {
    opacity: 0;
  }
  82% {
    opacity: var(--am-line-flash);
  }
  86% {
    opacity: 0.18;
  }
}

.am-hey__grain svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentcolor;
}

/* Россыпь. Сами цветки ставит расчёт (screens/home-spray.ts): их число
   выходит из свободного места, оттого здесь только глубины и движение. */
.am-hey__spray {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.am-hey__grain {
  position: absolute;
  color: rgb(var(--am-accent-2-rgb));
  filter: drop-shadow(0 0 8px rgb(var(--am-accent-2-rgb) / 0.24));
  animation: am-hey-drift var(--am-hey-dur) var(--am-ease-soft) var(--am-hey-delay) infinite
    alternate;
}

/* Три глубины: крупные бледные сзади, мелкие плотные спереди. */
.am-hey__grain--far {
  opacity: 0.1;
  filter: blur(2px) drop-shadow(0 0 10px rgb(var(--am-accent-2-rgb) / 0.2));
}

.am-hey__grain--mid {
  opacity: 0.18;
}

.am-hey__grain--near {
  opacity: 0.26;
}

/* Редкая девиантность: один цветок на короткое время нарушает общий ритм. */
.am-hey__grain--fly {
  animation:
    am-hey-drift 2.6s var(--am-ease) both,
    am-hey-grain-fly 2.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.am-hey__grain--shake {
  animation:
    am-hey-drift 2.6s var(--am-ease) both,
    am-hey-grain-shake 0.16s linear infinite;
}

.am-hey__grain--spin {
  animation:
    am-hey-drift 2.6s var(--am-ease) both,
    am-hey-grain-spin 2.6s linear both;
}

@keyframes am-hey-grain-fly {
  0% {
    translate: 0 0;
    opacity: 0.26;
  }
  38% {
    translate: 80vw -10vh;
    opacity: 0.08;
  }
  100% {
    translate: 0 0;
    opacity: 0;
  }
}

@keyframes am-hey-grain-shake {
  0%,
  100% {
    translate: 0 0;
  }
  25% {
    translate: -3px 2px;
  }
  50% {
    translate: 3px -2px;
  }
  75% {
    translate: -2px -3px;
  }
}

@keyframes am-hey-grain-spin {
  to {
    rotate: 540deg;
  }
}

/* Lain получает слабый CRT-шум и редкие красные импульсы внутри световых линий. */
html[data-am-family='lain'] .am-hey__line {
  isolation: isolate;
}

html[data-am-family='lain'] .am-hey__line::after {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background:
    repeating-linear-gradient(0deg, transparent 0 3px, rgb(var(--am-accent-rgb) / 0.08) 4px),
    repeating-linear-gradient(90deg, transparent 0 7px, rgb(var(--am-accent-2-rgb) / 0.05) 8px);
  mix-blend-mode: screen;
  animation: am-lain-spot-noise 2.8s steps(5, end) infinite;
}

html[data-am-family='lain'] .am-hey__line:nth-child(2)::after,
html[data-am-family='lain'] .am-hey__line:nth-child(4)::after {
  background:
    radial-gradient(circle at 62% 44%, rgb(var(--am-accent-2-rgb) / 0.36), transparent 18%),
    repeating-linear-gradient(0deg, transparent 0 3px, rgb(var(--am-accent-rgb) / 0.08) 4px);
  animation: am-lain-spot-flare 7.5s steps(7, end) infinite;
}

@keyframes am-lain-spot-noise {
  0%,
  100% {
    opacity: 0.35;
    transform: translate(0);
  }
  47% {
    opacity: 0.6;
    transform: translate(2px, -1px);
  }
  49% {
    opacity: 0.2;
    transform: translate(-1px, 1px);
  }
}

@keyframes am-lain-spot-flare {
  0%,
  72%,
  100% {
    opacity: 0;
  }
  76% {
    opacity: 0.85;
  }
  79% {
    opacity: 0.18;
  }
  82% {
    opacity: 0.55;
  }
}

/* Цветок плывёт и покачивается: с поворотом смещение читается плывущим лепестком, а не пятном. */
@keyframes am-hey-drift {
  from {
    transform: translate3d(var(--am-hey-fx), var(--am-hey-fy), 0)
      rotate(calc(var(--am-hey-turn) - var(--am-hey-rot)));
  }
  to {
    transform: translate3d(var(--am-hey-tx), var(--am-hey-ty), 0)
      rotate(calc(var(--am-hey-turn) + var(--am-hey-rot)));
  }
}

/* Одна строка: случайная фраза реестра, а не постоянный заголовок. */
.am-hey__title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: clamp(24px, 2.6vw, 34px);
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

/* Знак в строке наследует цвет и размер: --am-sakura-size — свойство,
   а не правило, поэтому оно доезжает и до знака внутри компонента. */
.am-hey__seed {
  flex: none;
  display: flex;
  --am-sakura-size: 0.62em;
  color: rgb(var(--am-accent-2-rgb));
}

.am-hey__acts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* Календарь выхода. Стекло то же, что у полосы отбора: обе стоят на одном
   экране и обе — служебные полосы, а не содержимое витрины. */
.am-cal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  background: var(--am-glass);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-xl);
  outline: 1px solid var(--am-line);
  outline-offset: -1px;
  box-shadow: inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur)) saturate(1.4);
}

/* Строки по центру, а не по базовой линии: переключатель области показа вставал бы не туда. */
.am-cal__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.am-cal__span {
  font-size: 12.5px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

/* Полоса дней — сеткой, а не флексом: семь клеток разной ширины читались бы
   рядом кнопок, а не календарём. */
.am-cal__strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.am-cal__day {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  padding: 7px 4px 6px;
  font: inherit;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid transparent;
  border-radius: var(--am-r-m);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease),
    opacity var(--am-fast) var(--am-ease);
  /* Свой контекст: розетки лежат под текстом (z-index: -1) и уходят за скруглённый угол
     клетки, поэтому видно только бледный край цветка — как на плитках статистики. */
  position: relative;
  isolation: isolate;
  overflow: hidden;
  --am-cal-turn: -18deg;
  /* Насколько розетка спрятана за краем клетки, пока день не выбран. −72 % её ширины:
     розетка свисает за край на 17 % клетки, и внутри остаётся ровно 37 % — против 68 %
     её ширины, так что −72 % уводит цветок наружу целиком, с запасом на скруглённый
     угол. В долях от клетки число было бы неточным при сужении окна. */
  --am-cal-rose-in: -72%;
}

/* Поворот свой у каждого дня: семь одинаковых рамок читались бы штампом, а не календарём. */
.am-cal__day:nth-child(7n + 2) {
  --am-cal-turn: -34deg;
}
.am-cal__day:nth-child(7n + 3) {
  --am-cal-turn: 14deg;
}
.am-cal__day:nth-child(7n + 4) {
  --am-cal-turn: -48deg;
}
.am-cal__day:nth-child(7n + 5) {
  --am-cal-turn: 32deg;
}
.am-cal__day:nth-child(7n + 6) {
  --am-cal-turn: -6deg;
}

/* Розетка подложкой. Размер и сдвиг — доли клетки, а не пиксели: на полной ширине клетка
   около 180 пикселей и в неё входит середина розетки в 96 пикселей со сдвигом в 30 — там,
   где лепестки гуще всего. При сужении окна клетки становятся уже, и та же розетка в
   пикселях доезжала бы до их середины, ложась прямо под число; долями она уходит за край
   ровно на половину при любом размере. Потолок — те же 96 пикселей, и сдвиг упирается в те
   же 30: без них доля росла бы вместе с клеткой, и на полном экране цветок растягивался
   в пятно шириной в полклетки. */
.am-cal__rose {
  position: absolute;
  top: 50%;
  z-index: -1;
  width: min(54%, 96px);
  aspect-ratio: 1;
  color: var(--am-sakura);
  /* В покое розетки нет вовсе: цветы нужны как отметка выбранного дня, а семь пар
     в ряд читались бы как украшение полосы, а не как «здесь вы смотрите». Прозрачностью
     и сдвигом, а не v-if: разметка не пересобирается при каждом переходе, а сам
     выезд из-за края иначе был бы мгновенным — цветок появился бы на месте, а не
     приехал. */
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--am-mid) var(--am-ease),
    transform var(--am-mid) var(--am-ease);
}

/* Розетка тянется на обёртку и красится её же краской: без этого svg остался бы
   со своей, пустой, геометрией и под обёрткой не было бы видно ничего. */
.am-cal__rose svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentcolor;
}

/* Сдвиг стоит перед поворотом: transform применяется справа налево, и при обратном
   порядке розетка уезжала бы вдоль своей, повёрнутой оси — на −48deg это заметная
   диагональ, а не выезд из края. */
.am-cal__rose--l {
  left: max(-17%, -30px);
  transform: translateY(-50%) translateX(var(--am-cal-rose-in)) rotate(var(--am-cal-turn));
}

.am-cal__rose--r {
  right: max(-17%, -30px);
  transform: translateY(-50%) translateX(calc(-1 * var(--am-cal-rose-in)))
    rotate(calc(-1 * var(--am-cal-turn)));
}

.am-cal__day:nth-child(4n + 2) .am-cal__rose {
  color: var(--am-accent);
}
.am-cal__day:nth-child(4n + 3) .am-cal__rose {
  color: var(--am-accent-2);
}
.am-cal__day:nth-child(4n + 4) .am-cal__rose {
  color: var(--am-good);
}

/* Розетка выезжает на выбранном дне: клетка отвечает на нажатие не одной рамкой. Левая
   уезжает из левого края, правая — из правого, поэтому сдвиг у них знаками разный, а
   в ноль отправляет одно и то же правило на клетке. Наведения здесь нет намеренно —
   иначе цветок приезжал бы под курсором на любой из семи клеток, и отметки «выбран
   этот день» не оставалось бы. Поворот у розетки свой у каждого дня, так что при
   переходе выбора цветок приезжает ещё и с другим наклоном. */
.am-cal__day--on {
  --am-cal-rose-in: 0px;
}

.am-cal__day--on .am-cal__rose {
  opacity: 0.42;
}

.am-cal__day:hover {
  color: var(--am-text);
  background: var(--am-hover);
}

/* Прошедший день тише будущего: вышедшее ждёт, а не случится. */
.am-cal__day--past {
  opacity: 0.62;
}

.am-cal__day--past:hover {
  opacity: 1;
}

/* Сегодня отмечено всегда, даже когда выбран другой день: отойдя на пятницу,
   человек иначе потерял бы, где он сам. */
.am-cal__day--today .am-cal__num {
  color: var(--am-accent);
}

/* Выбранный день возвращает полную силу: иначе выбранный прошедший день был бы бледнее невыбранного
   будущего. */
.am-cal__day--on {
  color: var(--am-text);
  opacity: 1;
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}

.am-cal__word {
  font-size: 11px;
  color: var(--am-faint);
}

.am-cal__num {
  font-size: 17px;
  font-weight: 650;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}

/* Точка под числом — есть ли выходы: точку видно глазом по полосе, а число пришлось бы читать. */
.am-cal__dot {
  width: 5px;
  height: 5px;
  border-radius: var(--am-r-cap);
  background: transparent;
}

.am-cal__dot--on {
  background: var(--am-accent);
}

/* Полка под полосой: отступы теснее общих — вложенные поля дали бы двойной зазор, а сверху десять:
   прокрутка обрезала бы приподнятую плитку. */
.am-cal__rail {
  gap: 12px;
  padding: 10px 4px 8px;
}

.am-cal__note {
  margin: 0;
  padding: 4px 2px;
  font-size: 12.5px;
  color: var(--am-faint);
}

/* Пустой день: знак и слова в одну строку; ожидание и отказ остаются простым текстом — знак там
   был бы ложью. */
.am-cal__note--none {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Кегль знака: 16 вместо общих 34, иначе крупный знак раздул бы строку примечания; меньше — штрих
   выходил тоньше пикселя. */
.am-cal__mark {
  flex: none;
  font-size: 16px;
}

/* Ряд отбора: кнопка меню слева, лента жанров занимает остальное; min-width: 0 обязателен — иначе
   прокрутчик распирает флекс. */
.am-sift {
  display: flex;
  gap: 10px;
  align-items: center;
}

.am-sift__open {
  flex: 0 0 auto;
}

.am-sift__num {
  padding: 0 7px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--am-bg);
  background: linear-gradient(135deg, var(--am-accent), var(--am-accent-2));
  border-radius: var(--am-r-cap);
  font-variant-numeric: tabular-nums;
}

/* Жанры одной лентой: переносом они уводили первую полку за сгиб. Края растворяются маской от самого
   края; скроллбар тонкой полоской — без него лента выглядела мёртвой. */
.am-choose {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  padding: 2px 0 4px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--am-fg-dim) transparent;
  mask-image: linear-gradient(90deg, #000, #000 calc(100% - 28px), transparent);
  overscroll-behavior-x: contain;
}

.am-choose::-webkit-scrollbar {
  height: 4px;
}

.am-choose::-webkit-scrollbar-thumb {
  background: var(--am-fg-dim);
  border-radius: 2px;
}

.am-choose::-webkit-scrollbar-track {
  background: transparent;
}

/* Колесо мыши прокручивает ленту горизонтально: без этого лента читается обрезанной. */
.am-choose {
  scroll-snap-type: x proximity;
}

.am-choose__row > * {
  scroll-snap-align: start;
}

/* Центровка автоотступами: центрованный флекс срезал бы первые жанры, когда лента шире экрана. */
.am-choose__row {
  display: flex;
  gap: 8px;
  width: max-content;
  margin-inline: auto;
  flex-shrink: 0;
}

.am-choose .am-chip {
  flex: 0 0 auto;
}

/* Что сейчас в отборе: снимается по одному нажатием на сам чип. */
.am-now {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.am-now__off {
  margin-left: 2px;
  font-size: 13px;
  opacity: 0.7;
}

/* Кнопки в пустом состоянии: выход есть сразу, а не в совете текстом. */
.am-empty__acts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 6px;
}

/* «Показать ещё» по центру под сеткой: у края страницы кнопку
   приходилось бы искать глазами после каждой порции. */
.am-more {
  display: flex;
  justify-content: center;
  padding: 6px 0 10px;
}

.am-shelf {
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: am-shelf-in var(--am-slow) var(--am-ease) both;
}

/* Крупная карточка первого экрана: картинка остаётся фоном, текст читается на затемнённой левой части. */
.am-hero {
  position: relative;
  height: 330px;
  overflow: hidden;
  cursor: pointer;
  isolation: isolate;
  background: var(--am-panel);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-xl);
  box-shadow:
    inset 0 1px 0 var(--am-edge),
    var(--am-sh-1);
  animation: am-hero-in 0.72s var(--am-ease) both;
  transition:
    border-color var(--am-mid) var(--am-ease),
    transform var(--am-mid) var(--am-ease);
}

/* Фон и затемнение разнесены по слоям: прозрачные градиенты в background создавали заметный шов. */
.am-hero::before,
.am-hero::after {
  position: absolute;
  inset: 1px;
  pointer-events: none;
  content: '';
}

.am-hero::before {
  z-index: 0;
  background: var(--am-hero-image) center / cover no-repeat;
  opacity: 0.82;
}

.am-hero::after {
  z-index: 0;
  background:
    linear-gradient(
      90deg,
      var(--am-panel) 0%,
      var(--am-panel) 22%,
      color-mix(in srgb, var(--am-panel) 78%, transparent) 48%,
      color-mix(in srgb, var(--am-panel) 30%, transparent) 72%,
      transparent 100%
    ),
    linear-gradient(180deg, transparent 42%, var(--am-bg) 100%);
}

@keyframes am-hero-in {
  from {
    opacity: 0.35;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.am-hero:hover,
.am-hero:focus-visible {
  border-color: var(--am-accent);
  transform: translateY(-2px);
}

.am-hero:focus-visible {
  outline: 2px solid rgb(var(--am-accent-rgb) / 0.7);
  outline-offset: 4px;
}

.am-hero__body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  width: min(58%, 700px);
  height: 330px;
  overflow: hidden;
  box-sizing: border-box;
  padding: 34px 38px;
  animation: am-hero-copy-in 0.72s var(--am-ease) both;
  transition:
    opacity 0.42s var(--am-ease),
    transform 0.42s var(--am-ease);
}

.am-hero__body--fade {
  opacity: 0;
  transform: translateX(-10px);
}

@keyframes am-hero-copy-in {
  from {
    opacity: 0;
    transform: translateX(-14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.am-hero__eyebrow {
  padding: 6px 10px;
  color: var(--am-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--am-accent-soft);
  border: 1px solid rgb(var(--am-accent-rgb) / 0.42);
  border-radius: var(--am-r-s);
}

.am-hero__title {
  max-width: 690px;
  display: -webkit-box;
  max-height: 2.16em;
  margin: 10px 0 14px;
  overflow: hidden;
  color: var(--am-text);
  font-size: clamp(26px, 3.2vw, 48px);
  line-height: 1.08;
  letter-spacing: -0.035em;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  text-overflow: ellipsis;
}

.am-hero__title--long {
  font-size: clamp(24px, 2.6vw, 40px);
}

.am-hero__title--xlong {
  font-size: clamp(21px, 2.1vw, 34px);
}

.am-hero__facts,
.am-hero__genres {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 0;
  color: var(--am-dim);
  font-size: 13px;
}

.am-hero__score,
.am-hero__adult {
  padding: 3px 7px;
  color: var(--am-on-accent);
  font-weight: 700;
  background: var(--am-accent);
  border-radius: var(--am-r-s);
}

.am-hero__adult {
  color: #fff;
  background: var(--am-accent-2);
}

.am-hero__genres {
  margin-top: 14px;
}

.am-hero__description {
  display: -webkit-box;
  max-width: 620px;
  height: 65px;
  margin: 14px 0 0;
  overflow: hidden;
  color: var(--am-dim);
  font-size: 14px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  text-overflow: ellipsis;
}

.am-hero__navigation {
  position: absolute;
  right: 24px;
  top: 20px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--am-mid) var(--am-ease);
}

.am-hero:hover .am-hero__navigation,
.am-hero:focus-within .am-hero__navigation {
  opacity: 1;
  pointer-events: auto;
}
.am-hero__dots {
  display: flex;
  gap: 6px;
  align-items: center;
}
.am-hero__arrow {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  cursor: pointer;
  color: var(--am-text);
  background: var(--am-glass-deep);
  border: 1px solid rgb(var(--am-accent-rgb) / 0.38);
  border-radius: var(--am-r-cap);
}
.am-hero__arrow svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 2;
}
.am-hero__arrow:hover:not(:disabled) {
  color: var(--am-accent);
  border-color: var(--am-accent);
}
.am-hero__arrow:focus-visible {
  outline: 2px solid var(--am-accent);
  outline-offset: 3px;
}
.am-hero__arrow:disabled {
  cursor: default;
  opacity: 0.3;
}

.am-hero__dots span {
  width: 6px;
  height: 6px;
  background: var(--am-faint);
  border-radius: 50%;
  transition:
    transform var(--am-mid) var(--am-ease),
    background-color var(--am-mid) var(--am-ease);
}

.am-hero__dots .am-hero__dot--on {
  background: var(--am-accent);
  transform: scale(1.45);
}

@keyframes am-shelf-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Своя полка важнее советов каталога, поэтому лежит на стекле:
   раньше все полки были одного веса и глаз не знал, где своё. */
.am-shelf--mine {
  padding: 16px 18px 8px;
  background: var(--am-glass);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-drop);
  box-shadow: inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur)) saturate(1.4);
}

/* Заголовок полки с акцентной засечкой: шесть одинаковых заголовков
   подряд читались сплошным текстом. */
.am-shelf .am-h2 {
  display: flex;
  gap: 10px;
  align-items: center;
}

.am-shelf .am-h2 {
  /* Засечка перед заголовком была украшением без смысла: убрана. */
}

.am-shelf--mine .am-h2 {
  /* Сакура остаётся знаком «своё»: подробнее у самой сакуры ниже. */
}

.am-shelf__mine {
  /* 1em рядом с кеглем 19 пикселей — сакура чуть ниже строки: её лепестки
     выше букв на 0.4 пикселя, и вровень она смотрелась бы крупной. */
  width: 14px;
  height: 14px;
  color: var(--am-sakura);
}

.am-rail {
  justify-content: start;
}

.am-hold {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.am-hold__art {
  display: block;
  aspect-ratio: 2 / 3;
}

.am-hold__line {
  display: block;
  width: 72%;
  height: 12px;
  border-radius: var(--am-r-s);
}

/* На узком экране кнопка отбора уходит над лентой жанров: рядом им тесно,
   и лента сжималась до двух чипов. */
@media (max-width: 560px) {
  .am-hero__body {
    width: 100%;
    height: 280px;
    padding: 26px 22px;
    background: linear-gradient(
      90deg,
      var(--am-panel),
      color-mix(in srgb, var(--am-panel) 76%, transparent)
    );
  }

  .am-hero {
    height: 280px;
  }

  .am-hero__title {
    font-size: 28px;
  }

  .am-hero__description {
    -webkit-line-clamp: 2;
  }

  .am-sift {
    flex-wrap: wrap;
  }

  .am-choose {
    flex-basis: 100%;
  }
}
</style>
