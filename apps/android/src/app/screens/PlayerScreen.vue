<script setup lang="ts">
// Своя панель, а не родная полоса: та не красится темой и не проходит пультом. Театр в body, иначе рельс и шапка просвечивают сквозь кадр. Адрес подписан на часы.
import {
  computed,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type FunctionalComponent,
} from 'vue'

import { Logger } from '@/utils/logger'

import { pushBackStop } from '../back-stop'

import EmptyMark from '../components/EmptyMark.vue'
import SakuraMark from '../components/SakuraMark.vue'
import { isWeakPlatform } from '../platform'
import { currentRoute } from '../router'
import { SAKURA_PETAL, SAKURA_TURNS } from '../sakura'

import { attachPlayback, type DeadKind, type Playback } from './player-hls'
import {
  CALM_DELAY_MS,
  JUMP_SEC,
  NORMAL_RATE,
  RATES,
  STEP_SEC,
  VOLUME_STEP,
  moveFocus,
  type PlayerIntent,
  peekRate,
  peekVolume,
  rateLabel,
  readIntent,
  rememberRate,
  rememberVolume,
  stepRate,
} from './player-input'
import {
  finishSpot,
  flushWatchKeep,
  forgetSpot,
  peekShare,
  peekSpot,
  rememberSpot,
  splitSpot,
  spotKey,
  whenWatchReady,
  type WatchWhat,
} from './player-keep'
import { episodeLabel, usePlayer, voiceLine, type VoiceRow } from './player-view'

/** Знак кнопки — рисунок в квадрате 24×24, а не символ шрифта: у символов своя ширина и наплыв над
 * базовой
 * линией, и в кнопках они стояли вкривь. Два пути: d — заливка, line — обводка. */
const Icon: FunctionalComponent<{ d?: string; line?: string }> = (props) =>
  h('svg', { class: 'am-play__ico', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    props.d === undefined ? null : h('path', { d: props.d, fill: 'currentColor' }),
    props.line === undefined
      ? null
      : h('path', {
          d: props.line,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
  ])

/** Залитые знаки. Все нарисованы симметрично относительно центра квадрата. */
const SIGN = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  prev: 'M6 6h2.4v12H6zm12 0v12l-8.6-6z',
  next: 'M15.6 6H18v12h-2.4zM6 6l8.6 6L6 18z',
  rewind: 'M11.4 6v12L3 12zm9.6 0v12l-8.4-6z',
  ahead: 'M3 6l8.4 6L3 18zm9.6 0 8.4 6-8.4 6z',
  sound: 'M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z',
  againHead: 'M12 1.2l3.4 2.8L12 6.8z',
} as const

/** Обведённые знаки: тонкие фигуры заливкой читаются пятном. */
const LINE = {
  waves: 'M15.2 9.2a4 4 0 0 1 0 5.6M18 6.8a7.6 7.6 0 0 1 0 10.4',
  cross: 'M15.6 9.6l4.8 4.8m0-4.8-4.8 4.8',
  full: 'M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5',
  small: 'M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5',
  again: 'M20 12a8 8 0 1 1-8-8',
  tick: 'M5 12.5l4.5 4.5L19 7.5',
  left: 'M15 5l-7 7 7 7',
  // Край списка: стрелка в упор к черте.
  first: 'M6.5 6h11M12 19V9M7.5 14l4.5-5 4.5 5',
  last: 'M6.5 18h11M12 5v10M7.5 10l4.5 5 4.5-5',
} as const

/** Кнопка панели: подпись, знак и что делать. Разметка из этого списка одна.
 * `off` — кнопке нечего делать, `on` — её умение включено прямо сейчас. */
interface Key {
  tip: string
  sign?: string
  line?: string
  main?: boolean
  off?: boolean
  on?: boolean
  run: () => void
}

/** Сколько держится плашка продолжения. Дальше она мешает смотреть. */
const RESUME_SHOW_MS = 7000

/** За сколько до конца подписи просим новый адрес. Запас больше проверки срока в ядре:
 * там речь о том, годится ли ссылка к запуску, а здесь — чтобы замена прошла под живым потоком. */
const RENEW_AHEAD_MS = 180000

/** Как часто смотрим на часы ссылки. Реже секунд не нужно: счёт идёт на минуты. */
const RENEW_TICK_MS = 20000

/** Сколько молчаливых промахов терпим, прежде чем сказать человеку. */
const RENEW_TRIES = 3

const videoEl = ref<HTMLVideoElement | null>(null)
const rootEl = ref<HTMLElement | null>(null)

/** Постер кадра на время загрузки: у площадок первый сегмент HLS бывает значком «Play», и человек
 * решает, что плеер сломан. Размеры совпадают с рамкой кадра (16:9, 960×540): браузер постер не масштабирует. */
const videoPoster = (() => {
  const W = 960
  const H = 540
  const SCALE = 3.82
  const petals = SAKURA_TURNS.map(
    (turn) =>
      `<path d="${SAKURA_PETAL}" transform="rotate(${turn} 16 16) translate(16 16) scale(0.9075 1.7467) translate(-16 -16)"/>`,
  ).join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="rgb(6,8,12)"/>` +
    `<g transform="translate(${W / 2} ${H / 2}) scale(${SCALE}) translate(-16 -16)" fill="#ffffff">` +
    `${petals}</g></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
})()

/** Где мы сейчас по времени: число меняется раз в секунду, не чаще. */
const at = ref(0)

/** Длина серии и край буфера: от них рисуются обе полосы. */
const total = ref(0)
const ready = ref(0)

const playing = ref(false)

/// Слабая ли платформа. На ней плеер открывается сразу театром: отдельного шага «развернуть» с пульта не сделаешь.
const lite = isWeakPlatform()

/** Громкость кадра. На пульте — всегда наибольшая: своего регулятора на телевизоре нет и быть не
 * должно,
 * системная громкость приставки и так на пульте, а второй регулятор делит её на двоих. */
const volume = ref(lite ? 1 : peekVolume())
const muted = ref(false)

/** Скорость видеоряда. Своя, а не родная полоса: та в WebView2 не красится. */
const rate = ref(peekRate())

/** Кадр во весь экран: театр в body и полный экран окна оболочки. */
const wide = ref(lite)

/** Панель уехала: несколько секунд тишины и только во время игры. */
const calm = ref(false)

/** Указатель на панели: пока он там, тишина не считается. */
const deckHot = ref(false)

/** Какое меню панели открыто. Одно за раз: два перекрывали бы друг друга. Списки озвучки
 * и серий — тоже меню, и на пульте только так: отдельным ящиком они требовали отдельного входа. */
const menu = ref<'' | 'quality' | 'rate' | 'voices' | 'episodes'>('')

/** Кнопка, раскрывшая меню: закрытие возвращает на неё фокус. */
let menuFrom: HTMLElement | null = null

/** Шаг «Назад» на время меню: аппаратная кнопка закрывает меню, а не плеер. */
let dropMenuStop: (() => void) | null = null

/** Шаг «Назад» на время всего экрана: выход в карточку, а не по истории. */
let dropExitStop: (() => void) | null = null

/** Кадр встал посреди серии: сеть не поспевает, но ошибки ещё нет. */
const stalled = ref(false)

/** Идёт молчаливая замена ссылки: наружу от неё только колесо ожидания. */
const renewOn = ref(false)

/** Доля полосы под указателем, -1 — указателя на ней нет. */
const hoverShare = ref(-1)

/** С какой секунды продолжили. Ноль — начали сначала, плашки не будет. */
const resumeAt = ref(0)

const mediaId = computed<number>(() => {
  const raw = Number(currentRoute.value.params.id ?? '')
  return Number.isFinite(raw) && raw > 0 ? raw : 0
})

const {
  busy,
  trouble,
  mainTitle,
  cover,
  voices,
  voiceKey,
  episodes,
  episode,
  stream,
  qualities,
  current,
  sourceLabel,
  hasNext,
  load,
  pickVoice,
  pickEpisode,
  pickHeight,
  nextEpisode,
  refresh,
  renew,
  openCard,
} = usePlayer(mediaId)

/** Связь с hls.js живёт всю жизнь экрана: буферы тяжёлые. */
let playback: Playback | null = null

/** Ключ места остановки того, что сейчас открыто. */
let spot = ''

/** Снимок для истории: что записать рядом с меткой. Ключ здесь главнее состояния экрана:
 * метку пишут и тогда, когда выбор уже уехал дальше, а номер серии и озвучка берутся из ключа. */
function aboutSpot(key: string): WatchWhat {
  const parts = splitSpot(key)
  const label =
    parts === null ? '' : (voices.value.find((v) => v.key === parts.voiceKey)?.label ?? '')

  return { title: mainTitle.value, cover: cover.value, voiceLabel: label }
}

/** Таймер тишины, после которого панель уезжает с кадра. */
let calmTimer = 0

/** Таймер плашки продолжения. */
let resumeTimer = 0

/** Присмотр за сроком ссылки: живёт столько же, сколько экран. */
let renewTimer = 0

/** Сколько раз подряд новая ссылка не пришла. */
let renewMisses = 0

/** Человек хочет, чтобы шло. Не то же, что `playing`: пауза от движка — обрыв потока,
 * смена источника, конец буфера — сюда не пишется. Иначе замена адреса оставляла бы кадр стоять. */
let meant = false

/** Выбранная озвучка: из неё и подпись, и счёт серий. */
const voiceRow = computed<VoiceRow | null>(
  () => voices.value.find((v) => v.key === voiceKey.value) ?? null,
)

const voiceLabel = computed<string>(() => voiceRow.value?.label ?? '')

/** Подзаголовок: источник, озвучка со счётом серий и серия одной строкой. */
const subLine = computed<string>(() => {
  const parts = [sourceLabel.value]
  if (voiceRow.value !== null) parts.push(voiceLine(voiceRow.value))
  const ep = current.value
  if (ep !== null) parts.push(episodeLabel(ep))
  return parts.filter((p) => p !== '').join(' · ')
})

/** Заслонка нужна, пока кадра нет: чёрный прямоугольник ничего не говорит. */
const veil = computed<boolean>(() => busy.value || trouble.value !== '' || stream.value === null)

/** Что написано на заслонке. Случаев без ссылки три, и путать их нельзя: при смене озвучки
 * серия выбрана и ждёт ссылки, а «Серия не выбрана» читалось как сброс выбора. */
const veilWord = computed<string>(() => {
  if (trouble.value !== '') return trouble.value
  if (busy.value) return 'Ищу источники…'
  if (stream.value !== null) return ''
  if (episodes.value.length === 0) return 'У этой озвучки нет готовых серий.'
  return 'Беру ссылку на серию…'
})

/** Колесо крутится и в ожидании ссылки: без него экран выглядел замёрзшим. */
const veilSpin = computed<boolean>(
  () => trouble.value === '' && (busy.value || stream.value === null),
)

/** Колесо посреди кадра: буфер не поспевает или мы молча меняем адрес. Второе человеку
 * выглядит тем же самым, и объяснять тут нечего. */
const waiting = computed<boolean>(() => stalled.value || renewOn.value)

/** Подпись кнопки качества: то, что играет сейчас. */
const qualityNow = computed<string>(
  () => qualities.value.find((quality) => quality.on)?.label ?? 'Качество',
)

/** Подпись кнопки озвучки: та, что играет сейчас. */
const voiceNow = computed<string>(() => (voiceLabel.value === '' ? 'Озвучка' : voiceLabel.value))

/** Кнопка пропуска: показывается только внутри своего отрезка. */
const skip = computed<{ label: string; to: number } | null>(() => {
  const ep = current.value
  if (ep === null) return null

  const now = at.value
  const opening = ep.opening
  if (opening && now >= opening.startSec && now < opening.stopSec - 1) {
    return { label: 'Пропустить заставку', to: opening.stopSec }
  }

  const ending = ep.ending
  if (ending && now >= ending.startSec && now < ending.stopSec - 1) {
    return { label: 'Пропустить титры', to: ending.stopSec }
  }

  return null
})

/** Предыдущая серия — ближайшая снизу, а не номер минус один: бывают дыры. */
const prevNumber = computed<number>(() => {
  const below = episodes.value.filter((row) => row.number < episode.value)
  return below.length === 0 ? 0 : (below[below.length - 1]?.number ?? 0)
})

/** Целые секунды для подписей доступности: дроби читалке ни к чему. */
const totalWhole = computed<number>(() => Math.round(total.value))

function shareOf(seconds: number): number {
  if (total.value <= 0) return 0
  return Math.min(100, Math.max(0, (seconds / total.value) * 100))
}

const shareAt = computed<number>(() => shareOf(at.value))
const shareReady = computed<number>(() => shareOf(ready.value))
const volumeShare = computed<number>(() => (muted.value ? 0 : volume.value * 100))

/** Доля просмотренного у серии в полке. Считается на каждой перерисовке: метки лежат
 * обычным объектом, а не ref, зато полоска обновляется вместе с часами. */
function seenShare(number: number): number {
  return Math.round(peekShare(spotKey(mediaId.value, voiceKey.value, number)) * 100)
}

/** Громкость и звук ставим на тег сами: своя панель — свой источник правды. */
function applySound(): void {
  const el = videoEl.value
  if (el === null) return

  el.volume = volume.value
  el.muted = muted.value
}

/** Скорость ставим в оба поля. defaultPlaybackRate обязателен: алгоритм загрузки нового
 * ресурса сбрасывает playbackRate именно к нему, и без этой строки скорость терялась. */
function applyRate(): void {
  const el = videoEl.value
  if (el === null) return

  el.defaultPlaybackRate = rate.value
  el.playbackRate = rate.value
}

function setVolume(next: number): void {
  const value = Math.min(1, Math.max(0, Math.round(next * 100) / 100))
  volume.value = value
  muted.value = value === 0
  rememberVolume(value)
  applySound()
}

function setRate(next: number): void {
  rate.value = next
  rememberRate(next)
  applyRate()
  wake()
}

function toggleMute(): void {
  muted.value = !muted.value

  // Снять глушение при нулевой громкости нечем: поднимаем на один шаг.
  if (!muted.value && volume.value === 0) {
    setVolume(VOLUME_STEP)
    return
  }

  applySound()
}

/** Выбор озвучки закрывает меню: выбор сделан, список больше не нужен. */
function takeVoice(key: string): void {
  pickVoice(key)
  menu.value = ''
}

/** Выбор серии закрывает меню — ровно так же, как выбор озвучки. */
function takeEpisode(number: number): void {
  pickEpisode(number)
  menu.value = ''
}

/** Край списка серий. У длинных тайтлов больше тысячи серий, и дойти до конца стрелками нельзя:
 * одно нажатие — одна строка. Список остаётся открытым: прыжок ещё не выбор серии. */
function jumpEpisode(side: 'start' | 'end'): void {
  const box = rootEl.value?.querySelector<HTMLElement>('[data-zone="menu"]')
  if (box === null || box === undefined) return

  const rows = Array.from(box.querySelectorAll<HTMLElement>('button.am-play__opt'))
  const aim = side === 'start' ? rows[0] : rows[rows.length - 1]
  if (aim === undefined) return

  box.scrollTop = side === 'start' ? 0 : box.scrollHeight
  aim.focus()
}

/** Раскрывает меню панели и запоминает кнопку, которая его раскрыла: строка списка
 * уезжает вместе с меню, и фокус вернуть было бы некуда. */
function openMenu(name: 'quality' | 'rate' | 'voices' | 'episodes', event: Event): void {
  if (menu.value === name) {
    menu.value = ''
    return
  }

  menu.value = name
  menuFrom = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
}

/** Меню само ставит фокус на выбранную строку и забирает его назад при закрытии: без этого списки
 * были
 * недостижимы с пульта — шаг вверх от кнопки водил фокус по рядам панели, но не в список. */
watch(menu, (now) => {
  if (now === '') {
    dropMenuStop?.()
    dropMenuStop = null

    const back = menuFrom
    menuFrom = null
    if (back !== null && back.isConnected) back.focus()
    return
  }

  dropMenuStop = pushBackStop(function () {
    menu.value = ''
    return true
  })

  void nextTick(() => {
    const box = rootEl.value?.querySelector<HTMLElement>('[data-zone="menu"]')
    if (box === null || box === undefined) return

    const rows = Array.from(box.querySelectorAll<HTMLElement>('button.am-play__opt'))
    const on = rows.find((row) => row.classList.contains('am-play__opt--on'))
    const aim = on ?? rows[0]
    aim?.focus()
  })
})

/** Кнопка панели, на которой фокус стоял последней. */
let deckHit: HTMLElement | null = null

function onDeckFocus(event: Event): void {
  const el = event.target
  if (el instanceof HTMLElement) deckHit = el
}

/** Заслонка уезжает — фокус возвращается туда, где его оставили: узел, ставший `display: none`,
 * фокус не
 * держит, и он достаётся пустоте. Выбор озвучки или серии накрывает панель заслонкой. */
watch(veil, (now) => {
  if (now) return

  void nextTick(() => {
    const back = deckHit
    if (back !== null && back.isConnected && back.offsetParent !== null) {
      back.focus()
      return
    }

    const deck = rootEl.value?.querySelector<HTMLElement>('.am-play__deck')
    deck?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
  })
})

/** Время в кадре: 7:05 и 1:07:05. Часы появляются, только когда они есть. */
function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = String(Math.floor((whole % 3600) / 60))
  const rest = String(whole % 60).padStart(2, '0')

  return hours > 0 ? `${hours}:${minutes.padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

/** Время под указателем на полосе: подпись всплывает над ним. */
const hoverText = computed<string>(() => clockText((hoverShare.value / 100) * total.value))

/** Длительность серии короткой строкой; неизвестная не выдумывается. */
function timeText(seconds: number | undefined): string {
  if (seconds === undefined || seconds <= 0) return ''
  return `${Math.round(seconds / 60)} мин`
}

/** Плашка «продолжили с…»: живёт несколько секунд и уходит сама. */
function showResume(from: number): void {
  if (resumeTimer !== 0) window.clearTimeout(resumeTimer)
  resumeTimer = 0
  resumeAt.value = from > 0 ? Math.floor(from) : 0
  if (resumeAt.value === 0) return

  resumeTimer = window.setTimeout(() => {
    resumeTimer = 0
    resumeAt.value = 0
  }, RESUME_SHOW_MS)
}

/** Открывает манифест. Та же серия — продолжаем с текущей секунды: так идут и смена качества,
 * и молчаливая замена протухшего адреса. Секунду спрашиваем и у тега, и у своих часов. */
function start(url: string): void {
  const el = videoEl.value
  if (el === null || playback === null) return

  const key = spotKey(mediaId.value, voiceKey.value, episode.value)
  const same = key === spot
  const from = same ? Math.max(el.currentTime, at.value) : peekSpot(key)
  const andPlay = same ? meant : true

  spot = key
  playback.open(url, from, andPlay)
  applyRate()

  // Про смену качества плашка молчит: место не менялось, менялась картинка.
  if (!same) showResume(from)
}

/** Поднялась заслонка — кадру играть нечего. Порядок важен: сначала пишем место остановки,
 * для этого нужны живые секунда и длина, и только потом гасим тег. Ключ забывается последним. */
function stopFrame(): void {
  const el = videoEl.value
  if (el !== null && spot !== '') {
    rememberSpot(spot, Math.floor(el.currentTime), total.value, aboutSpot(spot))
  }

  playback?.close()
  spot = ''

  at.value = 0
  total.value = 0
  ready.value = 0
  playing.value = false
  stalled.value = false
  resumeAt.value = 0
  hoverShare.value = -1
  meant = false

  // Замена ссылки под погашенным кадром смысла не имеет: заслонка сама спросит новую, и промахи считаются заново.
  renewOn.value = false
  renewMisses = 0

  if (resumeTimer !== 0) {
    window.clearTimeout(resumeTimer)
    resumeTimer = 0
  }

  // Панель возвращается на место: иначе после заслонки она осталась бы уехавшей до первого движения мыши.
  calm.value = false
  menu.value = ''
}

/** Сколько жизни осталось у нынешней ссылки. Бесконечность — срока нет вовсе. */
function linkLeft(): number {
  const ends = stream.value?.expiresAt ?? null
  return ends === null ? Number.POSITIVE_INFINITY : ends - Date.now()
}

/** Молча берёт новый адрес. Заслонка не поднимается и часы не сбрасываются: когда адрес
 * приезжает, наблюдатель за ссылкой зовёт start(), а тот садится на ту же секунду. */
async function renewLink(why: string): Promise<boolean> {
  if (renewOn.value) return false

  renewOn.value = true

  try {
    const ok = await renew()

    if (ok) {
      renewMisses = 0
      Logger('INFO', `Плеер: ссылка заменена молча (${why})`)
      return true
    }

    renewMisses += 1
    Logger('WARN', `Плеер: новая ссылка не пришла (${why}), промах ${renewMisses}`)
    return false
  } finally {
    renewOn.value = false
  }
}

/** Присмотр за сроком. Адрес меняем заранее, пока старый ещё играет: замена стоит секунды ожидания,
 * а промах по сроку — чёрного экрана посреди серии. Сказать человеку есть о чём ровно в одном случае. */
function watchLink(): void {
  if (veil.value || renewOn.value) return

  const left = linkLeft()
  if (left === Number.POSITIVE_INFINITY || left > RENEW_AHEAD_MS) return

  void renewLink('срок на исходе').then((ok) => {
    if (ok) return
    if (linkLeft() > 0 || renewMisses < RENEW_TRIES) return

    trouble.value = 'Источник перестал давать ссылки на эту серию.'
  })
}

/** Поток встал. Мёртвый адрес — норма нашей добычи, а не отказ: берём новый и продолжаем
 * с той же секунды. Жалоба здесь подняла бы заслонку, а с ней ушли бы и кадр, и место в серии. */
async function onStreamDead(text: string, kind: DeadKind): Promise<void> {
  if (kind === 'link' && renewMisses < RENEW_TRIES) {
    if (await renewLink('поток оборвался')) return
  }

  trouble.value = text
}

/** «Сначала»: человек не согласен с меткой. Забываем её, чтобы не спорить. */
function doRestart(): void {
  if (veil.value) return

  resumeAt.value = 0
  if (resumeTimer !== 0) {
    window.clearTimeout(resumeTimer)
    resumeTimer = 0
  }

  if (spot !== '') forgetSpot(spot)

  const el = videoEl.value
  if (el === null) return

  el.currentTime = 0
  at.value = 0
  wake()
}

/** Край буфера вокруг текущей секунды: остальные куски полосе неинтересны. */
function onProgress(): void {
  const el = videoEl.value
  if (el === null) return

  const now = el.currentTime
  for (let i = 0; i < el.buffered.length; i += 1) {
    if (el.buffered.start(i) <= now && now <= el.buffered.end(i)) {
      ready.value = el.buffered.end(i)
      return
    }
  }

  ready.value = now
}

function onTime(): void {
  const el = videoEl.value
  if (el === null) return

  const now = Math.floor(el.currentTime)
  if (now === at.value) return

  at.value = now
  onProgress()
  if (spot !== '') rememberSpot(spot, now, total.value, aboutSpot(spot))
}

/** Длина у HLS приезжает позже кадра, и бесконечность тоже бывает. */
function onMeta(): void {
  const el = videoEl.value
  if (el === null) return

  total.value = Number.isFinite(el.duration) ? el.duration : 0
  applySound()
  applyRate()
}

/** Конец серии: следующая сама. Смотренное забывается: оно пройдено. */
function onEnded(): void {
  // Метка уходит, а в истории серия встаёт целой: досмотренное не должно стоять там оборванным на предпоследней секунде.
  if (spot !== '') finishSpot(spot, total.value, aboutSpot(spot))
  if (hasNext.value) nextEpisode()
}

function onPlay(): void {
  playing.value = true
  stalled.value = false
  meant = true
  wake()
}

function onPause(): void {
  playing.value = false
  calm.value = false
}

/** Кадр встал посреди серии. Своё колесо здесь обязательно: без него встают и кадр,
 * и панель, и человеку кажется, что приложение умерло. */
function onWaiting(): void {
  stalled.value = true
}

function onRolling(): void {
  stalled.value = false
}

function doToggle(): void {
  const el = videoEl.value
  if (el === null || veil.value) return

  wake()

  if (!el.paused) {
    meant = false
    el.pause()
    return
  }

  meant = true

  void el.play().catch((e: unknown) => {
    Logger('WARN', 'Плеер: запуск не случился', e)
  })
}

/** Перемотка от текущего места, не вылезая за края серии. */
function nudge(delta: number): void {
  const el = videoEl.value
  if (el === null || veil.value) return

  const edge = total.value > 0 ? total.value - 0.5 : el.currentTime + Math.abs(delta)
  el.currentTime = Math.min(edge, Math.max(0, el.currentTime + delta))
  at.value = Math.floor(el.currentTime)
  wake()
}

/** Прыжок на долю серии: так говорит полоса, когда её тянут мышью. */
function seekShare(share: number): void {
  const el = videoEl.value
  if (el === null || veil.value || total.value <= 0) return

  el.currentTime = Math.min(total.value - 0.5, Math.max(0, share * total.value))
  at.value = Math.floor(el.currentTime)
}

function doSkip(): void {
  const el = videoEl.value
  const jump = skip.value
  if (el === null || veil.value || jump === null) return

  el.currentTime = jump.to
  wake()
}

function doPrev(): void {
  if (prevNumber.value > 0) pickEpisode(prevNumber.value)
}

/** Выбор закрывает своё меню сам: меню, которое надо гасить, раздражает. */
function takeHeight(height: number): void {
  menu.value = ''
  pickHeight(height)
}

function takeRate(next: number): void {
  menu.value = ''
  setRate(next)
}

/** Доля ширины, на которую пришёлся указатель. */
function shareOfPointer(event: PointerEvent): number {
  const line = event.currentTarget
  if (!(line instanceof HTMLElement)) return 0

  const box = line.getBoundingClientRect()
  if (box.width <= 0) return 0

  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
}

function onLineDown(event: PointerEvent): void {
  const line = event.currentTarget
  if (line instanceof HTMLElement) line.setPointerCapture(event.pointerId)

  wake()
  seekShare(shareOfPointer(event))
}

/** Пролёт мыши над полосой показывает время под указателем, нажатая кнопка — ещё и
 * перематывает. Одно событие на оба дела: врозь они считали бы одну долю дважды за движение. */
function onLineMove(event: PointerEvent): void {
  const share = shareOfPointer(event)
  hoverShare.value = share * 100

  if (event.buttons === 0) return

  wake()
  seekShare(share)
}

function onLineOut(): void {
  hoverShare.value = -1
}

/** Полоса времени забирает стрелки вдоль себя: пока фокус на ней, влево и вправо
 * перематывают, а уйти с неё можно вверх и вниз. */
function onLineKey(event: KeyboardEvent): void {
  const key = event.key
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return

  event.preventDefault()
  event.stopPropagation()

  const step = key === 'ArrowLeft' ? -1 : 1
  nudge(step * (event.shiftKey ? JUMP_SEC : STEP_SEC))
}

function onVolumeDown(event: PointerEvent): void {
  const line = event.currentTarget
  if (line instanceof HTMLElement) line.setPointerCapture(event.pointerId)

  wake()
  setVolume(shareOfPointer(event))
}

function onVolumeMove(event: PointerEvent): void {
  if (event.buttons === 0) return

  wake()
  setVolume(shareOfPointer(event))
}

function onVolumeKey(event: KeyboardEvent): void {
  const key = event.key
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return

  event.preventDefault()
  event.stopPropagation()
  wake()
  setVolume(volume.value + (key === 'ArrowLeft' ? -VOLUME_STEP : VOLUME_STEP))
}

/** Любой ввод возвращает панель и заново заводит отсчёт тишины. */
function wake(): void {
  calm.value = false
  if (calmTimer !== 0) window.clearTimeout(calmTimer)
  calmTimer = window.setTimeout(sleep, CALM_DELAY_MS)
}

/** Панель уезжает только во время игры и только когда её никто не держит: на паузе она
 * нужна на месте, под указателем — тем более, а с открытым списком уехала бы вместе с ним. */
function sleep(): void {
  calmTimer = 0
  if (!playing.value || veil.value) return
  if (deckHot.value || menu.value !== '') return

  // Панель прячется, а фокус остаётся на месте: панель возвращается от любого нажатия, и фокус на спрятанной кнопке — это «панель вернётся туда, где её оставили».
  calm.value = true
}

/** Пускает ли рамка приложения к себе фокус. В театре кадр лежит в body поверх рамки: рельс и шапка
 * под ним
 * не видны, но фокус принимали бы. `inert` убирает рамку из обхода вовсе. */
function holdShell(next: boolean): void {
  const shell = document.getElementById('app')
  if (shell !== null) shell.inert = next
}

/** Два шага в одном. Порядок обязателен: сначала Vue переносит узел в body и раскладывает
 * театр, и только потом окно меняет размер — иначе первый кадр после нажатия дёргается. */
async function setWide(next: boolean): Promise<void> {
  wide.value = next
  wake()

  if (!next) menu.value = ''

  // Метку снимаем до переноса узла: внутри рамки плеер — её ребёнок, и замок закрыл бы его самого.
  if (!next) holdShell(false)

  await nextTick()
  if (next) holdShell(true)
}

function doFullscreen(): void {
  // На пульте кадра вне полного экрана не бывает: складывать нечего, а клавиша «f» с компьютера здесь не нажимается.
  if (lite) return
  void setWide(!wide.value)
}

/** Нажатие мимо меню закрывает его: так ведёт себя любое меню. */
function onDown(event: PointerEvent): void {
  if (menu.value === '') return

  const aim = event.target
  if (aim instanceof Element && aim.closest('.am-play__pick') !== null) return

  menu.value = ''
}

/** «Назад»: сначала закрываем открытое, потом театр и только потом экран. НА ПУЛЬТЕ ТЕАТР НЕ
 * СКЛАДЫВАЕТСЯ:
 * на телевизоре плеер встаёт во весь экран сразу, и шаг «сложить кадр» тут лишний. */
function doExit(): void {
  if (menu.value !== '') {
    menu.value = ''
    return
  }

  if (wide.value && !lite) {
    void setWide(false)
    return
  }

  openCard()
}

/** Левый кластер: серии, перемотка и пуск. Порядок тот же, что у всех плееров. */
const leftKeys = computed<Key[]>(() => [
  { tip: 'Предыдущая серия', sign: SIGN.prev, off: prevNumber.value === 0, run: doPrev },
  { tip: 'Назад 10 секунд', sign: SIGN.rewind, run: () => nudge(-STEP_SEC) },
  {
    tip: playing.value ? 'Пауза' : 'Смотреть',
    sign: playing.value ? SIGN.pause : SIGN.play,
    main: true,
    run: doToggle,
  },
  { tip: 'Вперёд 10 секунд', sign: SIGN.ahead, run: () => nudge(STEP_SEC) },
  { tip: 'Следующая серия', sign: SIGN.next, off: !hasNext.value, run: nextEpisode },
])

/** Правый кластер: два пути кадра из окна и полный экран. Полный экран всегда последний.
 * Картинки в картинке в списке нет, когда движок её не умеет. Кнопки ссылки здесь больше нет. */
const rightKeys = computed<Key[]>(() => {
  const keys: Key[] = []

  // На пульте кнопки размера кадра нет: плеер всегда во весь экран, а сложенный кадр — тот промежуточный вид, от которого ушли.
  if (!lite) {
    keys.push({
      tip: wide.value ? 'Свернуть кадр' : 'Во весь экран',
      line: wide.value ? LINE.small : LINE.full,
      run: doFullscreen,
    })
  }

  return keys
})

/** Одно место, где желание превращается в действие. */
function act(intent: PlayerIntent): void {
  // Под заслонкой играть нечего: пускаем выход, размер кадра и трансляцию — системной панели кадр не нужен, она зеркалит весь экран. Клавиши доходят с окна, и спрятанная панель их не держит.
  if (veil.value && intent !== 'exit' && intent !== 'fullscreen') return

  switch (intent) {
    case 'toggle':
      doToggle()
      return
    case 'seekBack':
      nudge(-STEP_SEC)
      return
    case 'seekAhead':
      nudge(STEP_SEC)
      return
    case 'jumpBack':
      nudge(-JUMP_SEC)
      return
    case 'jumpAhead':
      nudge(JUMP_SEC)
      return
    case 'louder':
      setVolume(volume.value + VOLUME_STEP)
      return
    case 'quieter':
      setVolume(volume.value - VOLUME_STEP)
      return
    case 'mute':
      toggleMute()
      return
    case 'slower':
      setRate(stepRate(rate.value, -1))
      return
    case 'faster':
      setRate(stepRate(rate.value, 1))
      return
    case 'prevEpisode':
      doPrev()
      return
    case 'nextEpisode':
      if (hasNext.value) nextEpisode()
      return
    case 'skip':
      doSkip()
      return
    case 'fullscreen':
      doFullscreen()
      return
    case 'exit':
      doExit()
      return
    default:
      // Стрелки сюда не доходят: их разбирает moveFocus.
      return
  }
}

/** Стрелка вне панели на пульте значит «вести фокус», а не «громче»: на компьютере стрелки вне
 * панели крутят громкость и перемотку, там мышь наводит сама, на пульте громкость и перемотка лежат на панели. */
const ARROW_FOCUS: Partial<Record<PlayerIntent, PlayerIntent>> = {
  seekBack: 'focusLeft',
  seekAhead: 'focusRight',
  louder: 'focusUp',
  quieter: 'focusDown',
}

/** Признак «нажатие, вернувшее панель, ещё отпускается». Ставится в onKey, когда панель
 * была спрятана, и снимается первым же keyup — см. onKey. */
let swallowUp = false

/** Клавиатура и пульт: слушаем окно, потому что фокус бывает нигде. */
function onKey(event: KeyboardEvent): void {
  if (mediaId.value === 0) return

  // Спрятанная панель: первое нажатие только её возвращает. Прячется прозрачностью, а не display, и Enter на живой кнопке под фокусом сработал бы. Заслонка не в счёт: под ней своя кнопка.
  const hidden = calm.value && !veil.value
  wake()
  if (hidden) {
    // Кнопка нажимается по-разному: Enter — на keydown, пробел — на keyup. Гасим и тот и другой, иначе первое нажатие, вернувшее панель, всё равно нажало бы кнопку пробелом.
    swallowUp = true
    event.preventDefault()
    return
  }

  // Панель возвращается от всякого нажатия, а не только от понятного: в тишине фокус стоит на её кнопке.
  const here = document.activeElement
  const inList = here instanceof HTMLElement && here.closest('[data-zone]') !== null
  const read = readIntent(event, inList)
  if (read === null) return

  const intent = (lite && !inList ? ARROW_FOCUS[read] : undefined) ?? read

  event.preventDefault()

  if (intent.startsWith('focus')) {
    const root = rootEl.value
    // Панель возвращается из тишины реактивной правкой: сразу после wake() её кнопки ещё спрятаны, и ставить на них фокус нельзя.
    if (root !== null) {
      void nextTick(() => {
        moveFocus(root, intent)
      })
    }
    return
  }

  act(intent)
}

/** Отпускание после «нажатия, вернувшего панель». Пробел нажимает кнопку не на keydown,
 * а на keyup, и одного preventDefault в onKey мало: здесь гасится сам keyup. */
function onKeyUp(event: KeyboardEvent): void {
  if (!swallowUp) return
  swallowUp = false
  event.preventDefault()
}

onMounted(() => {
  const el = videoEl.value
  if (el !== null) {
    playback = attachPlayback(el, {
      onFatal: (text, kind) => {
        void onStreamDead(text, kind)
      },
    })

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnded)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('progress', onProgress)
    el.addEventListener('waiting', onWaiting)
    el.addEventListener('playing', onRolling)
    el.addEventListener('seeked', onRolling)
    applySound()
    applyRate()
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerdown', onDown)

  // Присмотр за сроком ссылки. Часы у неё свои, и узнать о её смерти из оборвавшегося потока — значит узнать слишком поздно.
  renewTimer = window.setInterval(watchLink, RENEW_TICK_MS)

  // Метки нужны и полке серий, и первому кадру: просим их пораньше.
  void whenWatchReady()
  void load()

  // На телевизоре экран открылся сразу театром, минуя setWide: запираем рамку под кадром сами, после переноса узла в body.
  if (wide.value) void nextTick(() => holdShell(true))

  // Аппаратная «Назад» достаётся оболочке раньше страницы, и без записи она листала историю сама. Запись ставится последней на экран, а меню записываются поверх неё: «Назад» сначала закрывает меню.
  dropExitStop = pushBackStop(function () {
    doExit()
    return true
  })
})

// Новый адрес — новое аниме: экран не пересобирается, грузим сами.
watch(mediaId, () => {
  playback?.close()
  spot = ''
  at.value = 0
  total.value = 0
  ready.value = 0
  playing.value = false
  stalled.value = false
  resumeAt.value = 0
  menu.value = ''
  meant = false
  void load()
})

// Заслонка поднялась — гасим кадр. Одна проверка на все три причины: поиск источников, ожидание ссылки и отказ потока.
watch(veil, (on) => {
  if (on) stopFrame()
})

watch(
  () => stream.value?.preferred.url ?? '',
  (url) => {
    if (url !== '') start(url)
  },
)

// Прокрутка страницы под театром: колесо мыши уводило бы её вслепую, и, выйдя из полного экрана, человек оказался бы не там.
watch(wide, (on) => {
  document.body.style.overflow = on ? 'hidden' : ''
})

onBeforeUnmount(() => {
  const el = videoEl.value
  if (el !== null) {
    if (spot !== '') {
      rememberSpot(spot, Math.floor(el.currentTime), total.value, aboutSpot(spot))
    }
    el.removeEventListener('timeupdate', onTime)
    el.removeEventListener('ended', onEnded)
    el.removeEventListener('play', onPlay)
    el.removeEventListener('pause', onPause)
    el.removeEventListener('durationchange', onMeta)
    el.removeEventListener('progress', onProgress)
    el.removeEventListener('waiting', onWaiting)
    el.removeEventListener('playing', onRolling)
    el.removeEventListener('seeked', onRolling)
  }

  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerdown', onDown)
  if (calmTimer !== 0) window.clearTimeout(calmTimer)
  if (resumeTimer !== 0) window.clearTimeout(resumeTimer)
  if (renewTimer !== 0) {
    window.clearInterval(renewTimer)
    renewTimer = 0
  }
  document.body.style.overflow = ''

  // Отложенная запись уход с экрана не переживёт: просим записать сейчас.
  flushWatchKeep()

  holdShell(false)

  // Запись «Назад» снимается до ухода: иначе экран, уже закрытый, принял бы нажатие, доставшееся следующему.
  dropMenuStop?.()
  dropMenuStop = null
  dropExitStop?.()
  dropExitStop = null

  playback?.close()
  playback = null
})
</script>

<template>
  <section class="am-page">
    <div v-if="mediaId === 0" class="am-empty">
      <span class="am-empty__mark"><EmptyMark name="question" /></span>
      <span>Смотреть нечего: в адресе нет номера аниме.</span>
      <span>Откройте карточку и нажмите «Смотреть».</span>
    </div>

    <!-- В театре узел уезжает в body: рамка приложения перестаёт быть его предком, и её стёкла в кадр больше не попадают. -->
    <Teleport to="body" :disabled="!wide">
      <div
        v-if="mediaId !== 0"
        ref="rootEl"
        class="am-play"
        :class="{
          'am-play--wide': wide,
          'am-play--calm': calm,
          'am-play--lite': lite,
          'am-play--veil': veil,
        }"
        @pointermove="wake"
      >
        <div class="am-play__main">
          <div class="am-play__head" data-zone="head">
            <button class="am-play__back" type="button" @click="doExit">
              <Icon :line="LINE.left" />
              <span class="am-play__back-word">Карточка</span>
            </button>

            <div class="am-play__title">
              <h2 class="am-play__name">{{ mainTitle }}</h2>
              <p v-if="subLine" class="am-play__sub">{{ subLine }}</p>
            </div>
          </div>

          <div class="am-play__stage" @dblclick="doFullscreen">
            <video
              ref="videoEl"
              class="am-play__frame"
              :poster="videoPoster"
              playsinline
              preload="metadata"
            ></video>

            <button
              v-if="!veil"
              class="am-play__tap"
              type="button"
              :aria-label="playing ? 'Пауза' : 'Смотреть'"
              @click="doToggle"
            ></button>

            <!-- Центр кадра. Оба знака центрует сетка обёртки, а не сдвиг трансформацией: кольцу нужен свой
     поворот, и два разных списка трансформаций браузер сводил в одну матрицу — знак уезжал. Колесо главнее паузы. -->
            <div v-if="!veil" class="am-play__mid" aria-hidden="true">
              <span v-if="waiting" class="am-play__wait" />

              <span v-else-if="!playing" class="am-play__hold">
                <Icon :d="SIGN.play" />
              </span>
            </div>

            <div v-if="veil" class="am-play__veil">
              <span v-if="veilSpin" class="am-play__spin" aria-hidden="true">
                <SakuraMark />
              </span>
              <p v-if="veilWord" class="am-play__word">{{ veilWord }}</p>
              <!-- Своя зона: под заслонкой панель спрятана, и без неё до единственной живой кнопки стрелкой не дойти. -->
              <button
                v-if="trouble && !busy"
                class="am-play__act"
                type="button"
                data-zone="veil"
                @click="refresh"
              >
                Переспросить
              </button>
            </div>

            <!-- Плашка продолжения: сообщает и тут же даёт передумать. -->
            <div v-if="resumeAt > 0 && !veil" class="am-play__resume">
              <span>Продолжили с {{ clockText(resumeAt) }}</span>
              <button
                class="am-play__resume-key"
                type="button"
                data-zone="resume"
                @click="doRestart"
              >
                Сначала
              </button>
            </div>

            <button
              v-if="skip && !veil"
              class="am-play__skip"
              type="button"
              data-zone="skip"
              @click="doSkip"
            >
              {{ skip.label }}
            </button>

            <div
              v-show="!veil"
              class="am-play__deck"
              data-zone="bar"
              @focusin="onDeckFocus"
              @pointerenter="deckHot = true"
              @pointerleave="deckHot = false"
            >
              <!-- Полоса времени своей строкой во всю ширину: в общем ряду она сжималась до обрубка между кнопками.
     Своя зона обхода: ряд кнопок стоит под ней, и в одной зоне с полосой до него было не дойти (player-input.ts). -->
              <div class="am-play__seek" data-zone="seek">
                <div
                  class="am-play__line"
                  tabindex="0"
                  role="slider"
                  aria-label="Время серии"
                  :aria-valuemin="0"
                  :aria-valuemax="totalWhole"
                  :aria-valuenow="at"
                  :aria-valuetext="clockText(at)"
                  @pointerdown="onLineDown"
                  @pointermove="onLineMove"
                  @pointerleave="onLineOut"
                  @keydown="onLineKey"
                  @keydown.space.prevent.stop="doToggle"
                  @keydown.enter.prevent.stop="doToggle"
                >
                  <span class="am-play__buf" :style="{ width: shareReady + '%' }" />
                  <span class="am-play__fill" :style="{ width: shareAt + '%' }" />
                  <span class="am-play__knob" :style="{ left: shareAt + '%' }" />
                </div>

                <span
                  v-if="hoverShare >= 0 && total > 0"
                  class="am-play__bubble"
                  :style="{ left: hoverShare + '%' }"
                  aria-hidden="true"
                  >{{ hoverText }}</span
                >
              </div>

              <div class="am-play__row">
                <div class="am-play__clip">
                  <button
                    v-for="key in leftKeys"
                    :key="key.tip"
                    class="am-play__key"
                    :class="{ 'am-play__key--main': key.main === true }"
                    type="button"
                    :aria-label="key.tip"
                    :disabled="key.off === true"
                    @click="key.run()"
                  >
                    <Icon :d="key.sign" :line="key.line" />
                  </button>

                  <!-- Ползунок раскрывается по наведению: постоянная полоса рядом с кнопкой звука занимала место молча.
     На пульте наведения нет, поэтому там ползунка нет вовсе: кадр играет на полную, а тише делает приставка. -->
                  <div class="am-play__sound">
                    <button
                      class="am-play__key"
                      type="button"
                      :aria-label="muted ? 'Включить звук' : 'Заглушить'"
                      @click="toggleMute"
                    >
                      <Icon :d="SIGN.sound" :line="muted ? LINE.cross : LINE.waves" />
                    </button>

                    <div
                      v-if="!lite"
                      class="am-play__vol"
                      tabindex="0"
                      role="slider"
                      aria-label="Громкость"
                      :aria-valuemin="0"
                      :aria-valuemax="100"
                      :aria-valuenow="volumeShare"
                      @pointerdown="onVolumeDown"
                      @pointermove="onVolumeMove"
                      @keydown="onVolumeKey"
                    >
                      <span class="am-play__vol-fill" :style="{ width: volumeShare + '%' }" />
                      <span class="am-play__vol-knob" :style="{ left: volumeShare + '%' }" />
                    </div>
                  </div>

                  <span class="am-play__clock">
                    {{ clockText(at) }}
                    <span class="am-play__clock-all">/ {{ clockText(total) }}</span>
                  </span>
                </div>

                <div class="am-play__clip am-play__clip--end">
                  <!-- Скорость списком, а не ползунком: доли вроде 1,15× на ползунке ловятся только случайно. -->
                  <div class="am-play__pick">
                    <ul v-if="menu === 'rate'" class="am-play__menu" data-zone="menu">
                      <li v-for="value in RATES" :key="value">
                        <button
                          class="am-play__opt"
                          :class="{ 'am-play__opt--on': value === rate }"
                          type="button"
                          @click="takeRate(value)"
                        >
                          <span class="am-play__opt-tick">
                            <Icon v-if="value === rate" :line="LINE.tick" />
                          </span>
                          <span>{{ value === NORMAL_RATE ? 'Обычная' : rateLabel(value) }}</span>
                        </button>
                      </li>
                    </ul>

                    <button
                      class="am-play__key am-play__key--word"
                      :class="{ 'am-play__key--on': rate !== NORMAL_RATE }"
                      type="button"
                      :aria-expanded="menu === 'rate'"
                      @click="openMenu('rate', $event)"
                    >
                      {{ rateLabel(rate) }}
                    </button>
                  </div>

                  <div v-if="qualities.length > 0" class="am-play__pick">
                    <ul v-if="menu === 'quality'" class="am-play__menu" data-zone="menu">
                      <li v-for="quality in qualities" :key="quality.height">
                        <button
                          class="am-play__opt"
                          :class="{ 'am-play__opt--on': quality.on }"
                          type="button"
                          @click="takeHeight(quality.height)"
                        >
                          <span class="am-play__opt-tick">
                            <Icon v-if="quality.on" :line="LINE.tick" />
                          </span>
                          <span>{{ quality.label }}</span>
                        </button>
                      </li>
                    </ul>

                    <button
                      class="am-play__key am-play__key--word"
                      type="button"
                      :aria-expanded="menu === 'quality'"
                      @click="openMenu('quality', $event)"
                    >
                      {{ qualityNow }}
                    </button>
                  </div>

                  <!-- Озвучка и серия — две разные кнопки, а не один ящик на двоих: в общем списке они мешали друг другу,
     а закрыть его можно было только повторным нажатием. Ящик справа остался компьютеру, где место есть. -->
                  <div v-if="lite && voices.length > 0" class="am-play__pick">
                    <ul v-if="menu === 'voices'" class="am-play__menu" data-zone="menu">
                      <li v-for="voice in voices" :key="voice.key">
                        <button
                          class="am-play__opt"
                          :class="{ 'am-play__opt--on': voice.key === voiceKey }"
                          type="button"
                          @click="takeVoice(voice.key)"
                        >
                          <span class="am-play__opt-tick">
                            <Icon v-if="voice.key === voiceKey" :line="LINE.tick" />
                          </span>
                          <span>{{ voiceLine(voice) }}</span>
                        </button>
                      </li>
                    </ul>

                    <button
                      class="am-play__key am-play__key--word"
                      type="button"
                      :aria-expanded="menu === 'voices'"
                      @click="openMenu('voices', $event)"
                    >
                      <span class="am-play__cut">{{ voiceNow }}</span>
                    </button>
                  </div>

                  <div v-if="lite && episodes.length > 0" class="am-play__pick am-play__pick--jump">
                    <ul v-if="menu === 'episodes'" class="am-play__menu" data-zone="menu">
                      <li v-for="item in episodes" :key="item.number">
                        <button
                          class="am-play__opt"
                          :class="{ 'am-play__opt--on': item.number === episode }"
                          type="button"
                          @click="takeEpisode(item.number)"
                        >
                          <span class="am-play__opt-tick">
                            <Icon v-if="item.number === episode" :line="LINE.tick" />
                          </span>
                          <span class="am-play__word-cut">
                            {{ item.number }}. {{ item.title ?? 'Серия' }}
                          </span>
                        </button>
                      </li>
                    </ul>

                    <!-- Края списка стоят отдельно, а не строкой внутри: внутри они уезжали бы вместе с прокруткой. -->
                    <div v-if="menu === 'episodes'" class="am-play__jump" data-zone="jump">
                      <button
                        class="am-play__jump-key"
                        type="button"
                        aria-label="Первая серия"
                        @click="jumpEpisode('start')"
                      >
                        <Icon :line="LINE.first" />
                      </button>

                      <button
                        class="am-play__jump-key"
                        type="button"
                        aria-label="Последняя серия"
                        @click="jumpEpisode('end')"
                      >
                        <Icon :line="LINE.last" />
                      </button>
                    </div>

                    <button
                      class="am-play__key am-play__key--word"
                      type="button"
                      :aria-expanded="menu === 'episodes'"
                      @click="openMenu('episodes', $event)"
                    >
                      {{ episode }}
                    </button>
                  </div>

                  <!-- Правые кнопки горят, когда их умение включено: кадр ушёл в окошко, трансляция нашла приёмник или уже идёт. -->
                  <button
                    v-for="key in rightKeys"
                    :key="key.tip"
                    class="am-play__key"
                    :class="{ 'am-play__key--on': key.on === true }"
                    type="button"
                    :aria-label="key.tip"
                    :aria-pressed="key.on"
                    @click="key.run()"
                  >
                    <Icon :d="key.sign" :line="key.line" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Списки колонкой справа. На пульте их нет: там те же списки раскрываются всплывающим меню
     со своих кнопок, а ящик отнял бы у кадра треть ширины. -->
        <aside v-if="!wide || !lite" class="am-play__side">
          <div class="am-play__box">
            <h3 class="am-play__h">Озвучка</h3>

            <ul v-if="voices.length > 0" class="am-play__list" data-zone="voices">
              <li v-for="voice in voices" :key="voice.key">
                <button
                  class="am-play__item"
                  :class="{ 'am-play__item--on': voice.key === voiceKey }"
                  type="button"
                  @click="pickVoice(voice.key)"
                >
                  <span class="am-play__word-cut">{{ voiceLine(voice) }}</span>
                  <span class="am-play__src">{{ voice.sourceLabel }}</span>
                </button>
              </li>
            </ul>

            <p v-else class="am-play__none">Озвучек нет.</p>
          </div>

          <div class="am-play__box">
            <h3 class="am-play__h">Серии</h3>

            <ul v-if="episodes.length > 0" class="am-play__list" data-zone="episodes">
              <li v-for="item in episodes" :key="item.number">
                <button
                  class="am-play__item"
                  :class="{ 'am-play__item--on': item.number === episode }"
                  type="button"
                  @click="pickEpisode(item.number)"
                >
                  <span class="am-play__num">{{ item.number }}</span>
                  <span class="am-play__word-cut">{{ item.title ?? 'Серия' }}</span>
                  <span v-if="timeText(item.durationSec)" class="am-play__time">
                    {{ timeText(item.durationSec) }}
                  </span>

                  <!-- Полоска просмотра: видно, где человек остановился, не открывая серию. -->
                  <span v-if="seenShare(item.number) > 0" class="am-play__seen" aria-hidden="true">
                    <span
                      class="am-play__seen-fill"
                      :style="{ width: seenShare(item.number) + '%' }"
                    />
                  </span>
                </button>
              </li>
            </ul>

            <p v-else class="am-play__none">Серий пока нет.</p>
          </div>
        </aside>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./player-screen.css"></style>
