<script setup lang="ts">
// Вкладка «Статистика»: сводка по своему списку и графики. Числа считает stats-count.ts по памяти коллекции —
// ни запроса, ни ожидания. Чего нет в памяти, экран ведёт добором по складу обликов.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Геометрия гистограмм (кривая по верхам, деления шкалы) — в общем модуле: рисующий их компонент не должен тянуться в код экрана.
import { niceTicks, pointsForBars, smoothAreaPath, smoothPath } from '../charts'

import { eachEntry, initCollection, watchCollection } from '@/core/collection'
import { hydrateLooks, lookKnown, warmLooks } from '@/core/media-looks'
import { Logger } from '@/utils/logger'

import EmptyMark from '../components/EmptyMark.vue'
import StatsPlot from '../components/StatsPlot.vue'

// Розетка подложки плиток та же, что у россыпи на главной: копия пути разошлась бы с знаком.
import { SAKURA_ROSETTE, SAKURA_ROSETTE_BOX } from '../sakura'

import {
  arcDash,
  arcShift,
  buildStats,
  emptyStats,
  formatNumber,
  looklessIds,
  RING_TURN,
  sectorPath,
  splitLegend,
  type StatsSummary,
} from './stats-count'

/** Сколько плиток-заглушек показать, пока снимок поднимается с диска: столько же, сколько настоящих. */
const HOLD_TILES = 6

/** Что показывает кольцо по видам: просмотренное или весь список. */
type FormatScope = 'watched' | 'all'

const FORMAT_SCOPES: ReadonlyArray<{ key: FormatScope; title: string; tip: string }> = [
  { key: 'watched', title: 'Просмотренное', tip: 'Виды просмотренных аниме' },
  { key: 'all', title: 'Весь список', tip: 'Виды всего списка, включая планы' },
]

/** Сколько тайтлов спрашиваем у сети за раз: столько же везёт одна страница обликов. */
const LOOK_CHUNK = 50

/** Вкладки метрики гистограммы «Год просмотра». */
type YearMetric = 'titles' | 'hours' | 'score'

interface YearTabChoice {
  key: YearMetric
  title: string
}

const YEAR_TABS: YearTabChoice[] = [
  { key: 'titles', title: 'Просмотрено аниме' },
  { key: 'hours', title: 'Просмотрено часов' },
  { key: 'score', title: 'Средняя оценка' },
]

/**
 * Метрики у двух гистограмм свои: оси у них разные, и общий переключатель дёргал бы чужой ряд за спиной человека. Смотрит он «Год просмотра», «Год выпуска» живёт по своей надписи.
 */
const viewMetric = ref<YearMetric>('titles')
const releaseMetric = ref<YearMetric>('titles')

/** Короткие названия месяцев: в подписи под столбиком помещается только такое. */
const MONTH_NAMES = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

/** Идёт ли подъём снимка. До него чисел нет вовсе, и показывать нули значило бы врать. */
const busy = ref(true)

const stats = ref<StatsSummary>(emptyStats())

/** Цвет дуги и точки легенды: закладка называет класс, а цвета живут в теме. */
function sliceClass(key: string): string {
  return `am-stats__arc--${key.toLowerCase()}`
}

/** Проценты для легенды: целые — дробные спорили бы с числами рядом. */
function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}

/** Оценка одним знаком: «7,5» читается, «7.500000000001» — нет. */
function scoreText(value: number): string {
  return value > 0 ? value.toFixed(1).replace('.', ',') : '—'
}

/** Дни одним знаком с запятой: тот же вид, что у прочих дробных чисел экрана. */
function decimalText(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/** Подсказка сектора и строки легенды: кто это и сколько. Без названия кольцо не читается. */
function sliceTip(slice: { title: string; count: number; share: number }): string {
  return `${slice.title}: ${formatNumber(slice.count)} · ${percent(slice.share)}`
}

/** Сколько долей показывает легенда кольца. На широком окне — все: больше восьми не бывает (шесть
 * видов и семь статусов AniList плюс «неизвестно»), хвост «Ещё N · …» запас на девятый. Ниже — по три крупнейших. */
const LEGEND_LIMIT = 8
const COMPACT_LIMIT = 3

/** Широкое окно: та же граница, что у боковой легенды в оформлении (@media 1900px). Числам ширина
 * не нужна —
 * она решает, сколько долей помещается в свободную высоту рядом с кольцом. */
const LAYOUT_QUERY = '(min-width: 1900px)'

const wideLayout = ref(
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : window.matchMedia(LAYOUT_QUERY).matches,
)

/** Смена раскладки: порог легенды — computed, и доли пересчитываются сами. */
function onLayoutChange(event: MediaQueryList | MediaQueryListEvent): void {
  wideLayout.value = event.matches
}

/** Доли легенды: на широком окне все, в компактной раскладке — три крупнейших и хвост. */
const legendLimit = computed(() => (wideLayout.value ? LEGEND_LIMIT : COMPACT_LIMIT))

/** Легенды колец: крупнейшие доли по убыванию. */
const statusLegend = computed(() => splitLegend(stats.value.statuses, legendLimit.value))

/** Кольцо по видам живёт по выбранной вкладке: своя доля и свой знаменатель у каждой. */
const formatSlices = computed(() =>
  formatScope.value === 'watched' ? stats.value.formatsWatched : stats.value.formats,
)
const formatLegend = computed(() => splitLegend(formatSlices.value, legendLimit.value))

/** Корень экрана: по его ширине считаются столбцы плиток. */
const root = ref<HTMLElement | null>(null)

/** Ширина плитки, с которой она ещё переносится; то же число лежит в minmax у CSS ниже. */
const TILE_BASIS = 196

/** Сколько плиток в ряду: столько, чтобы последний ряд встал ровно, без пустой клетки. */
const tileCols = ref(3)

/** Смотритель за шириной окна: без него расчёт столбцов сделался бы одноразовым. */
let tilesObserver: ResizeObserver | null = null

/** Подписка на раскладку: уход с экрана её снимает. */
let layoutWatch: MediaQueryList | null = null

/**
 * Столбцы плиток: сначала сколько влезает, потом ряды делятся поровну — и в каждом ряду клетки делят всю ширину, пустых мест не остаётся ни при какой ширине окна.
 */
function restyleTiles(): void {
  const box = root.value
  if (box === null) return

  const list = box.querySelector<HTMLElement>('.am-stats__tiles')
  if (list === null) return

  const count = list.children.length
  if (count === 0) return

  const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0
  const fit = Math.max(1, Math.floor((list.clientWidth + gap) / (TILE_BASIS + gap)))
  const rows = Math.ceil(count / fit)
  tileCols.value = Math.max(1, Math.ceil(count / rows))
}

/** Какая вкладка кольца по видам выбрана: выбор живёт только на время экрана. */
const formatScope = ref<FormatScope>('watched')

/** Сколько аниме попало в кольцо по видам: подпись под числом убрана, и кольцо читается легендой. */
const formatsKnown = computed(() => {
  const total = formatScope.value === 'watched' ? stats.value.titlesWatched : stats.value.titles
  const unknown = formatSlices.value.find((slice) => slice.key === 'UNKNOWN')
  return total - (unknown?.count ?? 0)
})

/** Идёт ли добор обликов: пока он идёт, кольцо и часы достраиваются сами. */
const looksBusy = ref(false)

/** Номер добора: правка списка начинает свой, уход с экрана отменяет идущий. */
let looksRun = 0

/** Идущий добор и просьба повторить: правки списка сыплются подряд, второй проход сразу не нужен. */
let looksTask: Promise<void> | null = null
let looksAgain = false

/** Добор обликов: сперва склад — он лежит у человека и не стоит ни одного запроса, — потом сеть
 * пачками. Без склада первое открытие вкладки шло бы в сеть за каждым аниме списка. Вид и длина серии едут вместе. */
function fillLooks(): void {
  if (looksTask !== null) {
    looksAgain = true
    return
  }

  const run = (looksRun += 1)
  const task = runLooks(run)

  looksTask = task
  void task.finally(() => {
    if (looksTask !== task) return

    looksTask = null
    looksBusy.value = false

    if (!looksAgain) return
    looksAgain = false
    fillLooks()
  })
}

async function runLooks(run: number): Promise<void> {
  try {
    const wanted = looklessIds()
    if (wanted.length === 0) return

    looksBusy.value = true

    await hydrateLooks(wanted)
    if (run !== looksRun) return

    stats.value = buildStats()

    const rest = looklessIds()
    for (let from = 0; from < rest.length; from += LOOK_CHUNK) {
      if (run !== looksRun) return

      const chunk = rest.slice(from, from + LOOK_CHUNK)
      await warmLooks(chunk)
      if (run !== looksRun) return

      stats.value = buildStats()

      // Ни один номер пачки не стал известен — ответа не было: спрашивать остальное незачем.
      if (!chunk.some((mediaId) => lookKnown(mediaId))) break
    }
  } catch (e) {
    // Отказ разметку не роняет: кольцо и часы покажут то, что уже собрано.
    Logger('ERROR', 'Облики не добрались', e)
  }
}

/** Сколько серий в среднем приходится на аниме; пустой список — ноль, а не деление на ноль. */
const perTitle = computed(() => {
  const source = stats.value
  return source.titles > 0 ? source.episodes / source.titles : 0
})

/**
 * Подсказка к плитке дней. Часы считаются по известной длине серии, а у части аниме её нет — такие серии в сумму не входят. Без этой оговорки «20,8 дня» читалось бы как полный счёт.
 */
const daysTip = computed(() => {
  const left = stats.value.episodesNoLength
  if (left === 0) return 'Часы посчитаны по длине каждой серии из данных AniList'

  return `Не учтено ${formatNumber(left)} серий: у этих аниме AniList не знает длину серии. Часы оттого меньше правды.`
})

/** Подсказка к плитке просмотренных: вкладка «Просмотренное» через два кольца от неё, и без
 * подсказки человек
 * их не свяжет — обе считают одно и то же число. */
const watchedTip = computed(
  () =>
    'Начата хотя бы одна серия. Этим же числом считается вкладка «Просмотренное» у кольца по видам',
)

/**
 * Подсказка к счёту серий. Наше число — сумма progress по списку, ровно та же величина, что и на сайте; расходятся они могут только по устаревшему снимку, и об этом стоит сказать словами.
 */
const episodesTip = computed(() => {
  if (lastEdit.value === null) return 'Счёт по своему списку — та же величина, что у сайта'
  return `Последняя правка в списке — ${lastEdit.value}. С тех пор на сайте могли досмотреть: число здесь устареет.`
})

/**
 * Самая свежая метка правки в списке, по-русски. Пусто — меток нет вовсе (список собран вручную), и тогда сравнивать с сайтом нечего: подсказка об этом и говорит.
 */
const lastEdit = computed(() => {
  let newest = 0
  for (const entry of eachEntry()) if (entry.updatedAt > newest) newest = entry.updatedAt
  if (newest <= 0) return null

  const date = new Date(newest)
  const month = MONTH_NAMES[date.getMonth() - 1] ?? String(date.getMonth())
  return `${date.getDate()} ${month} ${date.getFullYear()}`
})

/**
 * Строка одного столбика для StatsPlot. Высота приходит долей от потолка шкалы, а не от самой высокой колонки: иначе пик всегда упирался бы в край поля, а деления сетки читались бы неверно.
 */
interface PlotRow {
  key: string
  label: string
  value: number
  valueText: string
  tip: string
  /** Год для раскрытия; 0 — столбик не раскрывается. */
  year: number
}

/** Данные для StatsPlot: круглые деления, доли от потолка и честная кривая по верхам столбиков. */
interface PlotData {
  bars: {
    key: string
    label: string
    valueText: string
    share: number
    tip: string
    year: number
  }[]
  ticks: { value: number; text: string }[]
  line: string
  area: string
}

function buildPlot(
  rows: PlotRow[],
  tickText: (value: number) => string = formatNumber,
  fixedMax = 0,
): PlotData {
  const top = fixedMax > 0 ? fixedMax : Math.max(0, ...rows.map((row) => row.value))
  const ticks = niceTicks(top)
  const ceiling = ticks[ticks.length - 1] ?? 1

  const bars = rows.map((row) => ({
    key: row.key,
    label: row.label,
    valueText: row.valueText,
    share: ceiling > 0 ? Math.min(1, row.value / ceiling) : 0,
    tip: row.tip,
    year: row.year,
  }))

  const points = pointsForBars(bars)
  return {
    bars,
    ticks: ticks.map((value) => ({ value, text: value === 0 ? '0' : tickText(value) })),
    line: smoothPath(points),
    area: smoothAreaPath(points, 1000),
  }
}

/** Пустой график: оценок не поставили или годов нет — рисовать нечего. */
const EMPTY_PLOT: PlotData = { bars: [], ticks: [], line: '', area: '' }

/** Подпись деления шкалы под метрику: у часов своя единица, у оценки — балл из десяти. */
function metricTickText(metric: YearMetric, value: number): string {
  if (metric === 'hours') return `${formatNumber(value)} ч`
  if (metric === 'score') return decimalText(value)
  return formatNumber(value)
}

/** Подпись значения столбика под метрику. */
function metricValueText(metric: YearMetric, value: number): string {
  if (metric === 'titles') return value > 0 ? formatNumber(value) : ''
  if (metric === 'hours') {
    return value > 0 ? (value < 10 ? `${decimalText(value)} ч` : `${formatNumber(value)} ч`) : ''
  }
  return value > 0 ? scoreText(value) : '—'
}

/** Гистограмма оценок 1–10: сколько записей на каждый балл. Розовая краска — у неё одной: синий и
 * фиолетовый
 * заняты годами, а средняя оценка и так стоит плиткой наверху. */
const scorePlot = computed(() => {
  if (stats.value.rated === 0) return EMPTY_PLOT
  return buildPlot(
    stats.value.scores.map((bar) => ({
      key: `s${bar.score}`,
      label: String(bar.score),
      value: bar.count,
      valueText: bar.count > 0 ? formatNumber(bar.count) : '',
      tip: `Оценка ${bar.score}: записей ${formatNumber(bar.count)}`,
      year: 0,
    })),
  )
})

/**
 * Гистограмма «Год выпуска». Ось — год выхода аниме, а не год просмотра, поэтому ряд другой: сортировка кота может быть с восьмидесятых, а досмотрено всё в этом году.
 */
const releasePlot = computed(() => {
  const list = stats.value.releases
  if (list.length === 0) return EMPTY_PLOT

  const metric = releaseMetric.value
  const rows: PlotRow[] = list.map((bar) => {
    const value = metric === 'titles' ? bar.titles : metric === 'hours' ? bar.hours : bar.meanScore
    return {
      key: `r${bar.year}`,
      label: String(bar.year),
      value,
      valueText: metricValueText(metric, value),
      tip:
        metric === 'hours'
          ? `${bar.year} год: ≈ ${decimalText(bar.hours)} ч (серий: ${formatNumber(bar.episodes)})`
          : metric === 'score'
            ? `${bar.year} год: средняя оценка ${bar.meanScore > 0 ? scoreText(bar.meanScore) : 'нет'} (${formatNumber(bar.titles)} аниме)`
            : `${bar.year} год: аниме ${formatNumber(bar.titles)}, серий ${formatNumber(bar.episodes)}`,
      year: 0,
    }
  })

  return buildPlot(rows, (value) => metricTickText(metric, value), metric === 'score' ? 10 : 0)
})

/** Раскрытый год: ноль — весь ряд по годам, иначе месяцы этого года. */
const drilledYear = ref(0)

/** Ряд, который рисует гистограмма года: годы или месяцы раскрытого года. */
type YearRow = { label: string; titles: number; episodes: number; hours: number; meanScore: number }

/** Строки раскрытого года; пусто — раскрывать нечего, экран показывает годы. */
const yearRows = computed<YearRow[]>(() => {
  const year = stats.value.years.find((b) => b.year === drilledYear.value)
  if (year === undefined) return []

  return year.months.map((month) => ({
    label: MONTH_NAMES[month.month - 1] ?? String(month.month),
    titles: month.titles,
    episodes: month.episodes,
    hours: month.hours,
    meanScore: month.meanScore,
  }))
})

/** Раскрыт ли год: от него зависит и подпись под гистограммой, и курсор у столбиков. */
const drilled = computed(() => yearRows.value.length > 0)

/** Сменить год: тот же год закрывается, любой другой открывается. */
function drillTo(year: number): void {
  drilledYear.value = drilledYear.value === year ? 0 : year
}

/** Гистограмма «Год просмотра»: годы или месяцы раскрытого года, по метрике тумблера. */
const yearPlot = computed(() => {
  const metric = viewMetric.value
  const list: YearRow[] = drilled.value
    ? yearRows.value
    : stats.value.years.map((b) => ({
        label: String(b.year),
        titles: b.titles,
        episodes: b.episodes,
        hours: b.hours,
        meanScore: b.meanScore,
      }))

  if (list.length === 0) return EMPTY_PLOT

  const rows: PlotRow[] = list.map((row, at) => {
    const value = metric === 'titles' ? row.titles : metric === 'hours' ? row.hours : row.meanScore
    return {
      key: drilled.value ? `m${at}` : `y${at}`,
      label: row.label,
      value,
      valueText: metricValueText(metric, value),
      tip:
        metric === 'hours'
          ? `${row.label}: ≈ ${decimalText(row.hours)} ч (серий: ${formatNumber(row.episodes)})`
          : metric === 'score'
            ? `${row.label}: средняя оценка ${row.meanScore > 0 ? scoreText(row.meanScore) : 'нет'} (${formatNumber(row.titles)} аниме)`
            : `${row.label}: аниме ${formatNumber(row.titles)}, серий ${formatNumber(row.episodes)}`,
      // Раскрытый год повторно не раскрывается: месяцы только показывают.
      year: drilled.value ? 0 : Number(row.label),
    }
  })

  return buildPlot(rows, (value) => metricTickText(metric, value), metric === 'score' ? 10 : 0)
})

/** Отказ подписки на правки списка: зовётся при уходе с экрана. */
let stopWatching: (() => void) | null = null

onMounted(async () => {
  // Столбцы считаются сразу и пересчитываются на каждую смену ширины окна.
  restyleTiles()
  if (typeof ResizeObserver !== 'undefined' && root.value !== null) {
    tilesObserver = new ResizeObserver(restyleTiles)
    tilesObserver.observe(root.value)
  }

  // Раскладка окна: под кольцом легенда сворачивается в три строки с хвостом.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    layoutWatch = window.matchMedia(LAYOUT_QUERY)
    onLayoutChange(layoutWatch)
    layoutWatch.addEventListener('change', onLayoutChange)
  }

  // Список поднимается здесь же: без ожидания сводка была бы нулевой. Ошибка подъёма окно не роняет — сводка останется пустой, а причина уйдёт в журнал.
  try {
    await initCollection()
  } catch (e: unknown) {
    Logger('ERROR', 'Статистика не дождалась списка', e)
  }

  stats.value = buildStats()
  busy.value = false

  // Добор обликов идёт своим ходом: числа и оба кольца уже на экране.
  fillLooks()

  // Правка списка меняет сводку сама: числа, доли и годы считаются из памяти в тот же миг.
  stopWatching = watchCollection(() => {
    stats.value = buildStats()
    fillLooks()
  })
})

onBeforeUnmount(() => {
  tilesObserver?.disconnect()
  tilesObserver = null

  layoutWatch?.removeEventListener('change', onLayoutChange)
  layoutWatch = null

  stopWatching?.()
  stopWatching = null

  // Идущий добор обликов отпускаем: экран закрыт, отвечать уже некому.
  looksRun += 1
  looksAgain = false
})
</script>

<template>
  <section ref="root" class="am-page">
    <div v-if="busy" class="am-stats__grid">
      <ul class="am-stats__tiles">
        <li v-for="n in HOLD_TILES" :key="n" class="am-stats__tile">
          <span class="am-skeleton" />
        </li>
      </ul>
    </div>

    <div v-else-if="stats.titles === 0" class="am-empty">
      <span class="am-empty__mark"><EmptyMark name="chart" /></span>
      <span>Нет данных для статистики</span>
    </div>

    <template v-else>
      <div class="am-stats__grid">
        <ul
          class="am-stats__tiles"
          :style="{ gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))` }"
        >
          <li class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ formatNumber(stats.titles) }}</span>
            <span class="am-stats__name">Аниме в списке</span>
            <span class="am-stats__sub">
              завершено {{ formatNumber(stats.completed) }}, смотрю
              {{ formatNumber(stats.running) }}
            </span>
          </li>

          <li v-tip="watchedTip" class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ formatNumber(stats.titlesWatched) }}</span>
            <span class="am-stats__name">Просмотрено аниме</span>
            <span class="am-stats__sub">с хотя бы одной серией</span>
          </li>

          <li v-tip="episodesTip" class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ formatNumber(stats.episodes) }}</span>
            <span class="am-stats__name">Серий просмотрено</span>
            <span class="am-stats__sub">{{ decimalText(perTitle) }} серий на аниме</span>
          </li>

          <li v-tip="daysTip" class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ decimalText(stats.days) }}</span>
            <span class="am-stats__name">Дней за просмотром</span>
            <span class="am-stats__sub">≈ {{ formatNumber(stats.hours) }} ч экранного времени</span>
          </li>

          <li class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ scoreText(stats.meanScore) }}</span>
            <span class="am-stats__name">Средняя оценка</span>
            <span class="am-stats__sub">по {{ formatNumber(stats.rated) }} записям с оценкой</span>
          </li>

          <li class="am-stats__tile">
            <span class="am-stats__tile-flower" aria-hidden="true">
              <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
            </span>
            <span class="am-stats__value">{{ formatNumber(stats.titles - stats.rated) }}</span>
            <span class="am-stats__name">Без оценки</span>
            <span class="am-stats__sub">оценено {{ formatNumber(stats.rated) }}</span>
          </li>
        </ul>

        <section class="am-panel am-stats__card am-stats__card--status">
          <div class="am-bar am-stats__head">
            <h3 class="am-h3">Распределение по статусам</h3>
            <span class="am-bar__gap" />
          </div>

          <div class="am-stats__ring-wrap">
            <svg class="am-stats__ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle class="am-stats__ring-bg" cx="60" cy="60" r="44" />
              <path
                v-for="slice in stats.statuses"
                :key="`hit-${slice.key}`"
                class="am-stats__hit"
                focusable="false"
                :d="sectorPath(slice.offset, slice.share)"
                v-tip="sliceTip(slice)"
              />
              <!-- Доли повёрнуты к верху кольца здесь, а не поворотом всего полотна:
                   иначе сектор под курсором уезжает от краски на четверть оборота. -->
              <g :transform="RING_TURN">
                <circle
                  v-for="slice in stats.statuses"
                  :key="slice.key"
                  class="am-stats__arc"
                  :class="sliceClass(slice.key)"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="arcDash(slice.share)"
                  :stroke-dashoffset="arcShift(slice.offset)"
                />
              </g>
            </svg>

            <span class="am-stats__ring-num">
              <span class="am-stats__ring-value">{{ formatNumber(stats.titles) }}</span>
              <span class="am-stats__ring-name">аниме</span>
            </span>
          </div>

          <ul class="am-stats__legend">
            <li
              v-for="slice in statusLegend.head"
              :key="slice.key"
              v-tip="sliceTip(slice)"
              class="am-stats__legend-row"
            >
              <span class="am-stats__dot" :class="sliceClass(slice.key)" aria-hidden="true" />
              <span class="am-stats__legend-name">{{ slice.title }}</span>
              <span class="am-stats__legend-num">{{ formatNumber(slice.count) }}</span>
              <span class="am-stats__legend-share">{{ percent(slice.share) }}</span>
            </li>
          </ul>

          <p v-if="statusLegend.tail" class="am-stats__note am-stats__note--tail">
            Ещё {{ statusLegend.tail.parts }} · {{ formatNumber(statusLegend.tail.count) }} ·
            {{ percent(statusLegend.tail.share) }}
          </p>
        </section>

        <section class="am-panel am-stats__card am-stats__card--formats">
          <div class="am-bar am-stats__head">
            <h3 class="am-h3">Распределение по форматам</h3>
            <span class="am-bar__gap" />
            <div class="am-seg" role="group" aria-label="Что показывает кольцо по видам">
              <button
                v-for="scope in FORMAT_SCOPES"
                :key="scope.key"
                v-tip="scope.tip"
                class="am-seg__btn"
                :class="{ 'am-seg__btn--on': formatScope === scope.key }"
                type="button"
                :aria-pressed="formatScope === scope.key"
                @click="formatScope = scope.key"
              >
                {{ scope.title }}
              </button>
            </div>
          </div>

          <div class="am-stats__ring-wrap">
            <svg class="am-stats__ring" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle class="am-stats__ring-bg" cx="60" cy="60" r="44" />
              <path
                v-for="slice in formatSlices"
                :key="`hit-${slice.key}`"
                class="am-stats__hit"
                focusable="false"
                :d="sectorPath(slice.offset, slice.share)"
                v-tip="sliceTip(slice)"
              />
              <g :transform="RING_TURN">
                <circle
                  v-for="slice in formatSlices"
                  :key="slice.key"
                  class="am-stats__arc"
                  :class="sliceClass(slice.key)"
                  cx="60"
                  cy="60"
                  r="44"
                  :stroke-dasharray="arcDash(slice.share)"
                  :stroke-dashoffset="arcShift(slice.offset)"
                />
              </g>
            </svg>
            <span class="am-stats__ring-num">
              <span class="am-stats__ring-value">{{ formatNumber(formatsKnown) }}</span>
            </span>
          </div>

          <ul class="am-stats__legend">
            <li
              v-for="slice in formatLegend.head"
              :key="slice.key"
              v-tip="sliceTip(slice)"
              class="am-stats__legend-row"
            >
              <span class="am-stats__dot" :class="sliceClass(slice.key)" aria-hidden="true" />
              <span class="am-stats__legend-name">{{ slice.title }}</span>
              <span class="am-stats__legend-num">{{ formatNumber(slice.count) }}</span>
              <span class="am-stats__legend-share">{{ percent(slice.share) }}</span>
            </li>
          </ul>

          <p v-if="formatLegend.tail" class="am-stats__note am-stats__note--tail">
            Ещё {{ formatLegend.tail.parts }} · {{ formatNumber(formatLegend.tail.count) }} ·
            {{ percent(formatLegend.tail.share) }}
          </p>

          <p v-if="looksBusy" class="am-stats__note">Загрузка данных о сериях…</p>
        </section>
      </div>

      <section class="am-panel am-stats__card am-stats__card--wide">
        <h3 class="am-h3">Оценки</h3>

        <StatsPlot v-bind="scorePlot" tone="sakura" />
      </section>

      <section v-if="stats.years.length > 0" class="am-panel am-stats__card am-stats__card--wide">
        <div class="am-bar am-stats__head">
          <h3 class="am-h3">{{ drilled ? `Месяцы ${drilledYear}` : 'Год просмотра' }}</h3>
          <button v-if="drilled" class="am-stats__back" type="button" @click="drilledYear = 0">
            ← К годам
          </button>
          <span class="am-bar__gap" />
          <div class="am-seg" role="group" aria-label="Метрика по годам">
            <button
              v-for="tab in YEAR_TABS"
              :key="tab.key"
              class="am-seg__btn"
              :class="{ 'am-seg__btn--on': viewMetric === tab.key }"
              type="button"
              :aria-pressed="viewMetric === tab.key"
              @click="viewMetric = tab.key"
            >
              {{ tab.title }}
            </button>
          </div>
        </div>

        <!-- Прокрутку и притухание краёв берёт на себя компонент: ряду не влезает, и он уезжает. -->
        <StatsPlot v-bind="yearPlot" @pick="drillTo" />
      </section>
      <section
        v-if="stats.releases.length > 0"
        class="am-panel am-stats__card am-stats__card--wide"
      >
        <div class="am-bar am-stats__head">
          <h3 class="am-h3">Год выпуска</h3>
          <span class="am-bar__gap" />
          <!-- Переключатель метрик один на обе гистограммы: два разных выборя рядом читались бы
               как «здесь одно, там другое», а считают они одно и то же по разным осям. -->
          <div class="am-seg" role="group" aria-label="Метрика по годам выпуска">
            <button
              v-for="tab in YEAR_TABS"
              :key="tab.key"
              class="am-seg__btn"
              :class="{ 'am-seg__btn--on': releaseMetric === tab.key }"
              type="button"
              :aria-pressed="releaseMetric === tab.key"
              @click="releaseMetric = tab.key"
            >
              {{ tab.title }}
            </button>
          </div>
        </div>

        <StatsPlot v-bind="releasePlot" tone="violet" />
      </section>
    </template>
  </section>
</template>

<style scoped>
/* Плитки без стекла и размытия: их тут десяток, а blur в каждой считался бы кадром.
    auto-fit ниже — запас на первый кадр и скелет; рабочие столбцы ставит разметка (tileCols),
    деля ряды поровну, чтобы пустых клеток не было ни при какой ширине окна. */
.am-stats__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(196px, 1fr));
  gap: var(--am-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.am-stats__tile {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  min-height: 104px;
  padding: 14px 16px;
  /* Надписи по центру: у числа и подписи разная ширина, и слева от них пустовало. */
  text-align: center;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
  /* Цветок-подложка лежит под текстом (плитка своим контекстом держит его внутри) и уходит
     за угол плитки (обрезка) — виден только бледный край цветка. */
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

/* Цветок под числом: та же розетка, что в россыпи на главной (sakura.ts), срезанная углом.
   Цвет и поворот берутся по номеру плитки: четыре тона палитры темы по кругу, соседние плитки
   в ряду не совпадают — ряд не читается штампом. Новых цветов не заводим: цвет колец там несёт
   смысл, и цвет у плиток читался бы как то же правило, хотя правила нет. */
.am-stats__tile-flower {
  position: absolute;
  right: -34px;
  bottom: -38px;
  z-index: -1;
  width: 104px;
  height: 104px;
  color: var(--am-sakura);
  opacity: 0.16;
  pointer-events: none;
  transform: rotate(-24deg);
}

.am-stats__tile-flower svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentcolor;
}

.am-stats__tile:nth-child(4n + 2) .am-stats__tile-flower {
  color: var(--am-accent);
  transform: rotate(14deg);
}

.am-stats__tile:nth-child(4n + 3) .am-stats__tile-flower {
  color: var(--am-accent-2);
  transform: rotate(-8deg);
}

.am-stats__tile:nth-child(4n + 4) .am-stats__tile-flower {
  color: var(--am-good);
  transform: rotate(32deg);
}

/* Заглушки подъёма снимка занимают плитку целиком: иначе экран дёрнулся бы на первом числе. */
.am-stats__tile .am-skeleton {
  height: 100%;
  min-height: 76px;
}

.am-stats__value {
  font-size: clamp(26px, 2.4vw, 34px);
  font-weight: 680;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.am-stats__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--am-dim);
}

.am-stats__sub {
  margin-top: auto;
  font-size: 12px;
  color: var(--am-faint);
}

/* Верх экрана — три зоны в один ряд: кольцо статусов слева, плитки с числами посередине,
   кольцо форматов справа. Плитки отдельной строкой были бы широким рядом без содержимого,
   а по краям от колец на полноэкранном окне зияла пустота. Число зон нечётное, а плиток
   шесть — мозаика встаёт ровно, и полупустой клетки не бывает ни при какой ширине. */
.am-stats__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--am-gap);
  /* Низ один на весь ряд: start оставлял бы три разные высоты, и под плитками зияла бы полоса
     пустоты. Зоны тянутся до самой высокой, а кто короче — добирает содержимым, см. ниже. */
  align-items: stretch;
}

/* Ряд в три колонки — от 1180 px: кольцо с легендой нужно не меньше 330 px, плиткам — 196,
   а промежутки и padding страницы съедают ещё около сотни. Уже на 1280 px это влезает. */
@media (min-width: 1180px) {
  .am-stats__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
  }

  /* Плитки доходят до низа своего места, а не висят кольцом вверху: их ряды делят высоту
     зоны поровну. Число рядов известно разметке (restyleTiles), поэтому растягиваются все
     строки сразу, а не первая — иначе низ мозаики уехал бы вверх. */
  .am-stats__tiles {
    align-content: stretch;
    grid-auto-rows: minmax(104px, 1fr);
  }

  /* Внутри плитки число и подпись встают по центру: подпись с margin-top: auto уехала бы
     на самый низ, и в растянутой плитке между ними зияла бы дыра. */
  .am-stats__tiles .am-stats__tile {
    justify-content: center;
  }

  .am-stats__tiles .am-stats__sub {
    margin-top: 0;
  }
}

/* Порядок в разметке — плитки, потом оба кольца: на узком окне он и виден, и прежний,
   узкое окно ничего не меняет. В широком режиме левое кольцо встаёт в первую колонку, а плитки
   уходят в среднюю, поэтому именно ему нужен отрицательный order — на узком он был бы лишним. */
@media (min-width: 1180px) {
  .am-stats__card--status {
    order: -1;
  }
}

/* Кольцо с легендой в ряд для широкого окна — в самом конце файла, после всех базовых правил
   карточки. Медиазапрос не даёт специфичности: при равных селекторах решает порядок, и базовые
   display: flex у .am-stats__card и 236px у кольца, стоящие ниже по файлу, победили бы grid и
   новые размеры. Поэтому блок перенесён вниз — см. конец файла. Головы колец на половине экрана
   выравнивает блок при .am-stats__head: там селекторы длиннее, и порядок уже не важен. */
.am-stats__card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Широкая карточка: обе гистограммы во всю горизонтальную плоскость внизу экрана. */
.am-stats__card--wide {
  width: 100%;
}

/* Голова карточки — та же строка у обоих колец: у правого в ней ещё и переключатель видов,
   и без этого он выше, а кольца вставали на разные высоты. Пустое am-bar__gap держит высоту
   капсулы (min-height 30px у кнопок), а align-items центрирует заголовок в этой строке.
   Где строки не хватает, головы выравнивает блок ниже — по нему видно, откуда берётся высота. */
.am-stats__head {
  gap: 12px;
  min-height: 30px;
  align-items: center;
}

/* Половина экрана (кольца в ряд, до 1900 px): у правой карточки в голове ещё вкладки видов, и,
   не влезая рядом с заголовком, они уезжают на вторую строку — кольцо уезжает вместе с ними,
   а соседнее остаётся выше. Голова обеих карточек берёт высоту двух таких строк: капсула
   вкладок — 38 px (кнопка 30, паддинг 3 и рамка 1 с каждой стороны, как в теме), зазор головы —
   12 px. Пустой am-bar__gap держит высоту первой строки и в левой карточке: вкладок там нет, и
   без него её заголовок встал бы выше соседнего. */
@media (min-width: 1180px) and (max-width: 1899px) {
  .am-stats__card--status .am-stats__head,
  .am-stats__card--formats .am-stats__head {
    /* Содержимое прижато к верху: с растяжением единственная строка заняла бы всю голову,
       и заголовок уехал бы к её середине — ниже соседнего. */
    align-content: flex-start;
    min-height: 88px;
  }

  .am-stats__card--status .am-stats__head > .am-bar__gap,
  .am-stats__card--formats .am-stats__head > .am-bar__gap {
    height: 38px;
  }
}

/* Возврат к годам: тот же сегмент, но отдельной кнопкой — ряд столбиков трогать не нужно. */
.am-stats__back {
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
}

.am-stats__back:hover {
  color: var(--am-text);
  background: var(--am-fill-2);
}

.am-stats__head .am-seg {
  max-width: 100%;
  overflow-x: auto;
}

/* Области графиков мышью не выделяются: клик по кольцу, легенде или столбику оставлял бы на
   краске прямоугольник выделения. Подсказка по наведению и раскрытие года по клику не задеты.
   Сами столбики не выделяются в компоненте: у него своя область видимости. */
.am-stats__ring-wrap,
.am-stats__legend {
  user-select: none;
}

.am-stats__ring-wrap {
  position: relative;
  display: grid;
  place-items: center;
  width: 236px;
  height: 236px;
  margin: 0 auto;
}

/* Полотно колец: без поворота — доли повёрнуты внутри (RING_TURN), а сектор под курсором стоит
   в тех же координатах: повёрнутое целиком, оно уводит подсказку на чужую долю. */
.am-stats__ring {
  width: 100%;
  height: 100%;
  /* События полотно не ловит: клик по нему не должен ничего выделять и забирать фокус — ловят их
     невидимые сектора .am-stats__hit, для подсказки они и нарисованы. */
  pointer-events: none;
}

.am-stats__ring-bg {
  fill: none;
  stroke: var(--am-fill-2);
  stroke-width: 16;
}

/* Цвет доли задаётся её ключом в одном месте: дуга кольца и точка легенды читают один токен. */
.am-stats__arc {
  fill: none;
  stroke: var(--am-slice, var(--am-faint));
  stroke-width: 16;
  /* Курсор ловит сектор под дугой: обводка не должна перехватывать наведение. */
  pointer-events: none;
  transition: stroke-dasharray var(--am-mid) var(--am-ease);
}

/* Сектор под курсором: прозрачный по покою, под наведением — светлеет и зовёт подпись. */
.am-stats__hit {
  fill: transparent;
  cursor: help;
  /* Полотно выключило события себе, сектор возвращает их себе: подсказка приходит по наведению. */
  pointer-events: auto;
  transition: fill var(--am-fast) var(--am-ease);
  /* Ни выделения, ни фокуса: и то и другое Chromium рисует рамкой вокруг сектора, а на кольце
     это прямоугольник поверх краски. Правило на обёртке до содержимого SVG не доходит. */
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}

.am-stats__hit:hover {
  fill: color-mix(in srgb, var(--am-text) 12%, transparent);
}

.am-stats__arc--current {
  --am-slice: var(--am-accent);
}

.am-stats__arc--repeating {
  --am-slice: var(--am-accent-2);
}

.am-stats__arc--planning {
  --am-slice: var(--am-faint);
}

.am-stats__arc--completed {
  --am-slice: var(--am-good);
}

.am-stats__arc--paused {
  --am-slice: var(--am-warn);
}

.am-stats__arc--dropped {
  --am-slice: var(--am-bad);
}

.am-stats__arc--unknown {
  --am-slice: var(--am-dim);
}

/* Форматы: свой ряд цветов; «неизвестно» — тот же токен, что и у статусов. */
.am-stats__arc--tv {
  --am-slice: var(--am-accent);
}

.am-stats__arc--tv_short {
  --am-slice: color-mix(in srgb, var(--am-accent) 55%, var(--am-dim));
}

.am-stats__arc--movie {
  --am-slice: var(--am-accent-2);
}

.am-stats__arc--special {
  --am-slice: var(--am-good);
}

.am-stats__arc--ova {
  --am-slice: var(--am-warn);
}

.am-stats__arc--ona {
  --am-slice: var(--am-bad);
}

.am-stats__arc--music {
  --am-slice: var(--am-faint);
}

.am-stats__ring-num {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: center;
  pointer-events: none;
}

.am-stats__ring-value {
  font-size: 32px;
  font-weight: 680;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.am-stats__ring-name {
  font-size: 11.5px;
  color: var(--am-faint);
}

.am-stats__legend {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.am-stats__legend-row {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 10px;
  align-items: center;
  font-size: 12.5px;
}

.am-stats__dot {
  width: 10px;
  height: 10px;
  background: var(--am-slice, var(--am-faint));
  border-radius: var(--am-r-cap);
}

.am-stats__legend-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-stats__legend-num,
.am-stats__legend-share {
  font-variant-numeric: tabular-nums;
}

.am-stats__legend-num {
  color: var(--am-dim);
}

.am-stats__legend-share {
  min-width: 38px;
  color: var(--am-faint);
  text-align: right;
}

/* Половина и полный экран: легенда читается строкой — числа встают сразу за названием, а между
   ними тире: «Завершено — 120 · 45%» вместо «Завершено          120   45%». Столбец названия
   перестал тянуться (minmax(0, auto) вместо 1fr), промежутки строки поджаты с 10 до 8 px, и
   числа больше не улетают к правому краю карточки.
   justify-content: start держит строку по содержимому: без него auto-столбцы растянулись бы и
   развели числа обратно. */
@media (min-width: 1180px) {
  /* Легенда — отдельный блок: под кольцом или в стороне от него. Стоит по середине своей
     области: строки собраны по содержимому (max-content), и пустота делится на оба края, а не
     копится справа. Кегль крупнее компактного — рядом с большим кольцом 12.5px читались мелко. */
  .am-stats__legend {
    align-self: center;
    justify-self: center;
    width: max-content;
    max-width: 100%;
  }

  .am-stats__legend-row {
    grid-template-columns: 12px minmax(0, auto) auto auto;
    justify-content: start;
    gap: 8px;
    font-size: 14px;
  }

  /* Точка растёт вместе с кеглем: на фоне 14px текста прежние 10px читались крошкой. */
  .am-stats__dot {
    width: 12px;
    height: 12px;
  }

  /* Тире вместо пустоты перед числом: строка читается как «Завершено — 120 · 45%». Название
     длиннее строки — тире и числа остаются на виду, а многоточие берёт имя на себя. */
  .am-stats__legend-num::before {
    content: '— ';
  }

  /* Доля отделена тем же «·», что у хвоста легенды и подсказок, и жмётся к счётчику: min-width
     в 38 px и правый край были нужны колонке чисел, а не строке. */
  .am-stats__legend-share {
    min-width: 0;
    text-align: left;
  }

  .am-stats__legend-share::before {
    content: '· ';
  }
}

.am-stats__note {
  margin: 0;
  font-size: 12px;
  color: var(--am-faint);
}

/* Хвост легенды отделён тонкой чертой: без неё строка «Ещё 3 · 7 · 18%» читалась
   как продолжение предыдущей и приписывалась к третьему сектору. */
.am-stats__note--tail {
  /* auto прижимает хвост к низу карточки: карточки в ряду равны, а без этого пустота зияла
     бы под хвостом в той, где секторов больше. */
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--am-line-soft);
  font-variant-numeric: tabular-nums;
}

/* Широкое окно: кольцо и легенда встают в один ряд, потому что карточка наконец широкая на оба.
   До 1900 px легенде рядом с кольцом места нет — её строки («ТВ-короткометражное» с числом и
   долей) уходили бы в многоточие, — и там держим прежнюю композицию: кольцо, под ним легенда.
   Левое кольцо уходит к левому краю карточки и растёт, правое — к правому, а освободившуюся
   середину занимает легенда.

   Блок стоит в конце файла намеренно: медиазапрос не добавляет специфичности, при равных
   селекторах решает порядок. Выше по файлу базовые display: flex у карточки, 236px у кольца и
   столбцы сетки с 1180 px перебили бы и grid, и новые размеры. */
@media (min-width: 1900px) {
  /* Крайние зоны шире средней: кольцу с легендой в ряд нужно больше ширины, чем ряду плиток,
     а средняя доля держит мозаику ровной — плиток шесть, и полупустой клетки не бывает. */
  .am-stats__grid {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.1fr);
  }

  .am-stats__card--status,
  .am-stats__card--formats {
    display: grid;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    column-gap: 20px;
    /* Карточка мерит себя сама: рост кольца привязан к её ширине, а не к окну — на широком
       экране страница упирается в потолок ширины, и окно о запасе уже ничего не говорит. */
    container-type: inline-size;
  }

  /* Голова — одна строка у обоих колец: у левой только заголовок, у правой ещё вкладки, и без
     общей высоты кольца вставали на разные высоты. */
  .am-stats__card--status .am-stats__head,
  .am-stats__card--formats .am-stats__head {
    min-height: 38px;
  }

  /* Левое кольцо прижато к левому краю, легенда — вправо от него. */
  .am-stats__card--status {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'head head'
      'ring legend'
      'note note';
  }

  /* Зеркально: у правого кольца легенда слева, само кольцо — у правого края. */
  .am-stats__card--formats {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'head head'
      'legend ring'
      'note note';
  }

  .am-stats__card--status .am-stats__head,
  .am-stats__card--formats .am-stats__head {
    grid-area: head;
  }

  /* Кольцо прижато к краю колонки, а не к центру: auto-колонка по ширине кольца, но
     margin: 0 auto оставил бы его посередине, то есть ровно там, где оно было. */
  .am-stats__card--status .am-stats__ring-wrap,
  .am-stats__card--formats .am-stats__ring-wrap {
    grid-area: ring;
    margin: 0;
  }

  .am-stats__card--status .am-stats__legend,
  .am-stats__card--formats .am-stats__legend {
    grid-area: legend;
  }

  /* Подписи во всю ширину карточки: в ячейке кольца они встали бы узкой колонкой, а две
     подряд (хвост и «добираю виды») заняли бы одну ячейку и наложились. align-self вместо
     margin-top: auto — карточка здесь сетка, и auto в её третий ряд не загоняет подпись вниз. */
  .am-stats__card--status .am-stats__note,
  .am-stats__card--formats .am-stats__note {
    grid-column: 1 / -1;
    align-self: end;
  }

  .am-stats__card--status .am-stats__note--tail,
  .am-stats__card--formats .am-stats__note--tail {
    margin-top: 0;
  }

  /* Кольцо шире прежних 236px: освободившаяся ширина карточки и есть причина роста, а не
     отдельный потолок. Число в центре — обычный текст, а не часть viewBox, поэтому
     под кольцо увеличено и оно, иначе 32px на таком кольце читались бы мелко. Дальше кольцо
     растёт по ширине самой карточки — см. пороги ниже. */
  .am-stats__ring-wrap {
    width: 300px;
    height: 300px;
  }

  .am-stats__ring-value {
    font-size: 40px;
  }
}

/* Рост кольца по ширине карточки: 300 px кольца требуют легенды рядом, её самая длинная строка
   («ТВ-короткометражное» с числом и долей) занимает около 220 px, плюс 20 px промежутка — отсюда
   пороги. Контейнер объявлен выше, в широком окне: на половине экрана кольцо живёт по прежнему
   размеру, и эти правила там не срабатывают. */
@container (min-width: 600px) {
  .am-stats__ring-wrap {
    width: 330px;
    height: 330px;
  }

  .am-stats__ring-value {
    font-size: 44px;
  }
}

@container (min-width: 680px) {
  .am-stats__ring-wrap {
    width: 380px;
    height: 380px;
  }

  .am-stats__ring-value {
    font-size: 50px;
  }
}
</style>
