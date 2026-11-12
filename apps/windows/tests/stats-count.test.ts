// Проверки сборки статистики просмотра (`app/screens/stats-count`): числа, доли и отбор показа.
// Модуль чистый, но считает по памяти коллекции — наполняем её записями снимка напрямую.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MediaBrief } from '@/api/anilist-media'
import {
  arcDash,
  arcShift,
  buildStats,
  episodeMinutes,
  formatNumber,
  looklessIds,
  RING_TURN,
  sectorPath,
  sliceAngle,
  splitLegend,
  watchTime,
} from '@/app/screens/stats-count'
// Геометрия графиков живёт отдельно от счёта: ею же пользуется компонент StatsPlot.vue.
import { niceTicks, pointsForBars, smoothAreaPath, smoothPath } from '@/app/charts'
import { dropEntry, putEntry } from '@/core/collection'
import { rememberBrief, type MediaLook } from '@/core/media-looks'
import { settings } from '@/core/settings'
import type { SnapshotEntry } from '@/core/snapshot'

/** Запись снимка целиком: пропущенное поле ломает сборку. */
function entry(mediaId: number, over: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    mediaId,
    malId: mediaId,
    status: 'COMPLETED',
    score10: 0,
    progress: 0,
    repeat: 0,
    startedAt: null,
    completedAt: null,
    notes: null,
    updatedAt: 0,
    isAdult: false,
    romaji: null,
    english: null,
    ...over,
  }
}

/** Что наполнили: убирается после каждой проверки, иначе числа поехали бы между ними. */
const seeded: number[] = []

function seed(rows: SnapshotEntry[]): void {
  for (const row of rows) {
    putEntry(row)
    seeded.push(row.mediaId)
  }
}

/** Облик тайтла в кэш: формат и оценка сообщества приходят только отсюда. */
function brief(mediaId: number, over: Partial<MediaBrief> = {}): void {
  rememberBrief({
    mediaId,
    malId: mediaId,
    type: 'ANIME',
    format: null,
    status: 'FINISHED',
    episodes: null,
    chapters: null,
    duration: null,
    seasonYear: null,
    averageScore: null,
    isAdult: false,
    tags: null,
    romaji: null,
    english: null,
    native: null,
    cover: null,
    color: null,
    airingEpisode: null,
    airingAt: null,
    ownEntry: null,
    ...over,
  })
}

beforeEach(() => {
  // Тумблер взрослого читается в момент вопроса, поэтому его достаточно выставить в объекте настроек.
  settings.showAdult = false
  seeded.length = 0
})

afterEach(() => {
  for (const mediaId of seeded) dropEntry(mediaId)
})

describe('formatNumber', () => {
  it('ставит разряды через пробел', () => {
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(1000)).toBe('1 000')
    expect(formatNumber(1234567)).toBe('1 234 567')
  })

  it('округляет до целого и не теряет знак', () => {
    expect(formatNumber(1234.6)).toBe('1 235')
    expect(formatNumber(0)).toBe('0')
  })
})

describe('watchTime', () => {
  it('на пустом списке даёт ноль, а не NaN', () => {
    expect(watchTime(0)).toEqual({ hours: 0, days: 0 })
  })

  it('переводит минуты в часы и дни', () => {
    // Сутки просмотра — 1440 минут.
    expect(watchTime(1440)).toEqual({ hours: 24, days: 1 })
    // 576 минут (24 серии по 24 минуты) — 9,6 часа.
    expect(watchTime(576)).toEqual({ hours: 9.6, days: 0.4 })
    // 2400 минут (сотня тех же серий) — сорок часов, без малого двое суток.
    expect(watchTime(2400)).toEqual({ hours: 40, days: 1.7 })
  })
})

describe('episodeMinutes', () => {
  it('берёт длину у записи, затем у склада, а без неё отдаёт ноль', () => {
    expect(episodeMinutes(entry(1, { duration: 90 }))).toBe(90)
    expect(episodeMinutes(entry(2, { duration: 4 }))).toBe(4)
    // Нет длины — нет и минут: недобор честнее придуманных чисел.
    expect(episodeMinutes(entry(3))).toBe(0)
    expect(episodeMinutes(entry(4, { duration: 0 }))).toBe(0)
    // Склад знает длину там, где запись молчит: так доезжают записи, обновлённые до этого поля.
    expect(episodeMinutes(entry(5), { duration: 12 } as MediaLook)).toBe(12)
  })
})

describe('buildStats', () => {
  it('на пустом списке отвечает нулями и пустыми графиками', () => {
    const stats = buildStats()

    expect(stats.titles).toBe(0)
    expect(stats.episodes).toBe(0)
    expect(stats.meanScore).toBe(0)
    expect(stats.statuses).toEqual([])
    expect(stats.years).toEqual([])
    expect(stats.formats).toEqual([])
    expect(stats.formatsWatched).toEqual([])
    // Гистограмма оценок есть всегда: десять колонок с нулями, иначе график исчезал бы целиком.
    expect(stats.scores).toHaveLength(10)
    expect(stats.scores.every((bar) => bar.count === 0 && bar.share === 0)).toBe(true)
  })

  it('считает серии и оценки по видимым записям', () => {
    seed([
      entry(1, { progress: 12, score10: 8, duration: 24 }),
      entry(2, { progress: 8, score10: 6, duration: 24 }),
    ])

    const stats = buildStats()

    expect(stats.titles).toBe(2)
    expect(stats.episodes).toBe(20)
    expect(stats.hours).toBe(8)
    expect(stats.rated).toBe(2)
    expect(stats.meanScore).toBe(7)
    expect(stats.hidden).toBe(0)
  })

  it('считает часы по длине каждой серии, а серии без длины не выдумывает', () => {
    seed([
      // Обычный сериал: 12 серий по 24 минуты.
      entry(1, { progress: 12, duration: 24 }),
      // Фильм в полтора часа: одна «серия» на всю длину.
      entry(2, { progress: 1, duration: 90 }),
      // Без известной длины — минут ноль, серия в часы не идёт.
      entry(3, { progress: 10 }),
    ])

    const stats = buildStats()

    // 12×24 + 1×90 = 378 минут = 6,3 часа; десятка без длины в сумме нет.
    expect(stats.episodes).toBe(23)
    expect(stats.hours).toBe(6.3)
    expect(stats.days).toBe(0.3)
    // Недобор назван числами: без него «6,3 часа» читалось бы как полный счёт.
    expect(stats.episodesNoLength).toBe(10)
  })

  it('прячет взрослое тем же тумблером, что и список, и называет, сколько спрятано', () => {
    seed([entry(1, { progress: 12 }), entry(2, { progress: 100, isAdult: true })])

    const hidden = buildStats()
    expect(hidden.titles).toBe(1)
    expect(hidden.episodes).toBe(12)
    expect(hidden.hidden).toBe(1)

    settings.showAdult = true
    const shown = buildStats()
    expect(shown.titles).toBe(2)
    expect(shown.episodes).toBe(112)
    expect(shown.hidden).toBe(0)
  })

  it('раскладывает закладки по порядку списка и считает доли кольца', () => {
    seed([entry(1), entry(2), entry(3, { status: 'CURRENT' }), entry(4, { status: null })])

    const stats = buildStats()

    expect(stats.statuses.map((slice) => slice.title)).toEqual([
      'Смотрю',
      'Просмотрено',
      'Без закладки',
    ])
    expect(stats.statuses.map((slice) => slice.count)).toEqual([1, 2, 1])
    // Смещение — начало доли: без него каждая дуга кольца начиналась бы сверху.
    expect(stats.statuses.map((slice) => slice.offset)).toEqual([0, 0.25, 0.75])
    expect(stats.statuses.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10)
    expect(stats.completed).toBe(2)
    expect(stats.running).toBe(1)
  })

  it('называет записи без вида: их и добирает экран', () => {
    seed([
      entry(1, { duration: 24, seasonYear: 2020 }),
      entry(2, { isAdult: true, duration: 24, seasonYear: 2020 }),
      entry(3, { duration: 24, seasonYear: 2020 }),
    ])
    brief(1, { format: 'TV', duration: 24, seasonYear: 2020 })
    // Взрослому виду не место в кольце: за него экран не спрашивает.
    settings.showAdult = false

    expect(looklessIds()).toEqual([3])

    // С пришедшим видом номер уходит из списка добычи: второй раз его не спросят.
    brief(3, { format: 'OVA', duration: 24, seasonYear: 2020 })
    expect(looklessIds()).toEqual([])
  })

  it('в список добычи попадает и запись без длины серии', () => {
    // Вид и год есть, длины нет ни в записи, ни на складе — облик экран всё равно доберёт.
    seed([entry(1, { format: 'TV', seasonYear: 2020 })])
    brief(1, { format: 'TV', seasonYear: 2020 })

    expect(looklessIds()).toEqual([1])
  })

  it('в список добычи попадает и запись без года выпуска', () => {
    // Год нужен оси второй гистограммы: без него запись в неё не попадёт, а добрать его нечем.
    seed([entry(1, { format: 'TV', duration: 24 })])
    brief(1, { format: 'TV', duration: 24 })

    expect(looklessIds()).toEqual([1])
  })

  it('кольцо по видам считает и по просмотренному, и по всему списку', () => {
    // Свои номера: склад обликов общий на весь файл, чужой вид подхватился бы сюда.
    seed([
      entry(931, { format: 'TV', progress: 12 }),
      entry(932, { format: 'TV', progress: 12 }),
      // Фильм в планах: в «всему списку» есть, в просмотренном — нет.
      entry(933, { format: 'MOVIE', progress: 0 }),
    ])

    const stats = buildStats()

    expect(stats.titles).toBe(3)
    expect(stats.titlesWatched).toBe(2)
    expect(stats.formats.map((slice) => slice.key)).toEqual(['TV', 'MOVIE'])
    expect(stats.formatsWatched.map((slice) => slice.key)).toEqual(['TV'])
    // У каждой вкладки свой знаменатель: доля «ТВ» в просмотренном всегда полная.
    expect(stats.formatsWatched[0]?.share).toBe(1)
    expect(stats.formats[0]?.share).toBeCloseTo(2 / 3, 10)
    // Сумма долей кольца всегда полная, даже когда в нём две записи из трёх.
    expect(stats.formats.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10)
  })

  it('раскладывает форматы по кольцу, а неизвестное уводит в конец', () => {
    seed([entry(1), entry(2), entry(3), entry(4)])
    brief(1, { format: 'TV' })
    brief(2, { format: 'TV' })
    brief(3, { format: 'MOVIE' })
    // Четвёртый без облика: формат по кэшу ему не выдумать.

    const stats = buildStats()

    expect(stats.formats.map((slice) => slice.key)).toEqual(['TV', 'MOVIE', 'UNKNOWN'])
    expect(stats.formats.map((slice) => slice.title)).toEqual(['ТВ', 'Фильм', 'Неизвестно'])
    expect(stats.formats.map((slice) => slice.count)).toEqual([2, 1, 1])
    // Смещения — начала долей: кольцо с них и рисуется.
    expect(stats.formats.map((slice) => slice.offset)).toEqual([0, 0.5, 0.75])
    expect(stats.formats.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10)
  })

  it('берёт вид из памяти списка, когда облика ещё нет', () => {
    // Вид приезжает со списком: без единого запроса кольцо уже полное.
    seed([
      entry(1, { format: 'ONA', duration: 24, seasonYear: 2020 }),
      entry(2, { format: 'TV', duration: 24, seasonYear: 2020 }),
    ])
    brief(2, { format: 'MOVIE', duration: 24, seasonYear: 2020 })

    const stats = buildStats()

    expect(stats.formats.map((slice) => slice.key)).toEqual(['ONA', 'TV'])
    // Взявший вид, длина и год уходят из списка добычи: склад спрашивать незачем.
    expect(looklessIds()).toEqual([])
  })

  it('считает часы по длине со склада, когда в записи её нет', () => {
    // Запись, обновлённая до появления длины, молчит; облик с ней уже на складе.
    seed([entry(1, { progress: 10 })])
    brief(1, { format: 'TV', duration: 24 })

    const stats = buildStats()

    // 10 × 24 = 240 минут = 4 часа: без склада эти часы были бы нулём.
    expect(stats.hours).toBe(4)
  })

  it('группирует просмотренное по году выпуска, а не по году просмотра', () => {
    // Свои номера не под 1–4: тесты делят склад обликов, и чужой год выпуска подхватился бы сюда.
    seed([
      // Вышло в 2011, досмотрено в 2024: ось тут — 2011.
      entry(901, { seasonYear: 2011, progress: 12, score10: 8, duration: 24 }),
      entry(902, { seasonYear: 2011, progress: 8, score10: 6, duration: 24 }),
      entry(903, { seasonYear: 2020, progress: 24, score10: 9, duration: 24 }),
      // Год выпуска есть, но смотреть никто не начал: в гистограмму «просмотрено» он не идёт.
      entry(904, { seasonYear: 2024, progress: 0, duration: 24 }),
    ])

    const stats = buildStats()

    expect(stats.releases.map((bar) => bar.year)).toEqual([2011, 2020])
    // 2011: два аниме, 20 серий, 8 часов, средняя (8+6)/2 = 7.
    expect(stats.releases[0]?.titles).toBe(2)
    expect(stats.releases[0]?.episodes).toBe(20)
    expect(stats.releases[0]?.hours).toBe(8)
    expect(stats.releases[0]?.meanScore).toBe(7)
    // 2020: одно аниме, 24 серии, 9,6 часа.
    expect(stats.releases[1]?.titles).toBe(1)
    expect(stats.releases[1]?.hours).toBe(9.6)
    // Никто не начинал — в ряд «просмотрено» он не попадает, и молчать об этом нельзя.
    expect(stats.episodesNoYear).toBe(0)
  })

  it('без года выпуска серии выпадают из гистограммы, и недобор назван', () => {
    seed([
      entry(911, { seasonYear: 2020, progress: 12, duration: 24 }),
      // Года нет ни в записи, ни в облике: в ряд такая запись не попадёт.
      entry(912, { seasonYear: null, progress: 20, duration: 24 }),
    ])

    const stats = buildStats()

    expect(stats.releases.map((bar) => bar.year)).toEqual([2020])
    expect(stats.releases[0]?.episodes).toBe(12)
    // Молчать об этом нельзя: иначе ряд выглядел бы полным.
    expect(stats.episodesNoYear).toBe(20)
    // Общий счёт серий при этом не меняется — гистограмма это подмножество.
    expect(stats.episodes).toBe(32)
  })

  it('года выпуска нет у записи, но есть у облика — берём оттуда', () => {
    seed([entry(921, { seasonYear: null, progress: 12, duration: 24 })])
    brief(921, { format: 'TV', duration: 24, seasonYear: 2015 })

    const stats = buildStats()

    expect(stats.releases.map((bar) => bar.year)).toEqual([2015])
    expect(stats.episodesNoYear).toBe(0)
  })

  it('строит гистограмму оценок от самой высокой колонки', () => {
    seed([entry(1, { score10: 8 }), entry(2, { score10: 8 }), entry(3, { score10: 6 })])

    const stats = buildStats()
    const at = (score: number) => stats.scores.find((bar) => bar.score === score)

    expect(stats.scores).toHaveLength(10)
    expect(at(8)?.count).toBe(2)
    expect(at(8)?.share).toBe(1)
    expect(at(6)?.count).toBe(1)
    expect(at(6)?.share).toBe(0.5)
    // Ноль оценки колонкой не считается: «оценки нет» — это не «оценка ноль».
    expect(at(1)?.count).toBe(0)
  })

  it('дробную оценку кладёт в ближайший столбик, а не отбрасывает вниз', () => {
    seed([
      entry(1, { score10: 5.5 }),
      entry(2, { score10: 6.5 }),
      entry(3, { score10: 9.5 }),
      entry(4, { score10: 9 }),
    ])

    const at = (score: number) => buildStats().scores.find((bar) => bar.score === score)?.count

    // Пол-балла идут к ближайшему целому: 5,5 к шестёрке, а 6,5 к семёрке.
    expect(at(6)).toBe(1)
    expect(at(7)).toBe(1)
    // Девять с половиной в столбике 9 не тонут: при отбрасывании вниз он был бы пуст.
    expect(at(10)).toBe(1)
    expect(at(9)).toBe(1)
  })

  it('оценку выше шкалы не заворачивает в десятку дважды', () => {
    // Мусор в снимке не должен ни потеряться, ни удвоиться в соседнем столбике.
    seed([entry(1, { score10: 11 })])

    const stats = buildStats()
    const total = stats.scores.reduce((sum, bar) => sum + bar.count, 0)

    expect(stats.scores[9]?.count).toBe(1)
    expect(total).toBe(1)
  })

  it('длинную историю не обрезает: все пятнадцать лет на месте', () => {
    // Раньше ряд знал только последние десять лет, и остальные молча пропали из гистограммы.
    const rows = Array.from({ length: 15 }, (_, at) =>
      entry(930 + at, { completedAt: `${2012 + at}-03-10`, progress: 2 }),
    )
    seed(rows)

    const stats = buildStats()

    expect(stats.years).toHaveLength(15)
    expect(stats.years[0]?.year).toBe(2012)
    expect(stats.years[14]?.year).toBe(2026)
  })

  it('длинный ряд по годам выпуска тоже не обрезается', () => {
    const rows = Array.from({ length: 15 }, (_, at) =>
      entry(950 + at, { seasonYear: 2005 + at, progress: 3, duration: 24 }),
    )
    seed(rows)

    expect(buildStats().releases).toHaveLength(15)
  })

  it('группирует завершённые по годам, а высоту берёт по сериям', () => {
    seed([
      entry(1, { completedAt: '2024-05-01', progress: 10, score10: 8, duration: 24 }),
      entry(2, { completedAt: '2024-11-02', progress: 10, score10: 6, duration: 24 }),
      entry(3, { completedAt: '2025-01-09', progress: 30, duration: 24 }),
      entry(4, { completedAt: null, progress: 5 }),
    ])

    const stats = buildStats()
    const shares = stats.years.map((bar) => bar.share)

    // Запись без даты завершения в годы не попадает: год ей неизвестен.
    expect(stats.years.map((bar) => bar.year)).toEqual([2024, 2025])
    expect(stats.years.map((bar) => bar.titles)).toEqual([2, 1])
    expect(stats.years.map((bar) => bar.episodes)).toEqual([20, 30])
    expect(stats.years.map((bar) => bar.hours)).toEqual([8, 12])
    expect(stats.years[0]?.meanScore).toBe(7)
    expect(stats.years[1]?.meanScore).toBe(0)
    expect(shares[1]).toBe(1)
    expect(shares[0]).toBeCloseTo(20 / 30, 10)
  })

  it('раскладывает год по месяцам: пустых месяцев в списке нет', () => {
    seed([
      entry(1, { completedAt: '2024-05-01', progress: 10, score10: 8, duration: 24 }),
      // Второе аниме того же мая — месяц считает и серии, и оценку вместе с ним.
      entry(2, { completedAt: '2024-05-20', progress: 6, score10: 6, duration: 24 }),
      entry(3, { completedAt: '2024-11-02', progress: 10, score10: 9, duration: 24 }),
    ])

    const year = buildStats().years[0]

    expect(year?.year).toBe(2024)
    expect(year?.months.map((month) => month.month)).toEqual([5, 11])
    // Май: 2 аниме, 16 серий, 6,4 часа, средняя (8+6)/2 = 7.
    expect(year?.months[0]?.titles).toBe(2)
    expect(year?.months[0]?.episodes).toBe(16)
    expect(year?.months[0]?.hours).toBe(6.4)
    expect(year?.months[0]?.meanScore).toBe(7)
    expect(year?.months[1]?.titles).toBe(1)
    // Сумма месяцев обязана совпасть с годом: разошлись бы — числа на двух вкладках врали бы врозь.
    expect(year?.months.reduce((sum, month) => sum + month.titles, 0)).toBe(year?.titles)
    expect(year?.months.reduce((sum, month) => sum + month.episodes, 0)).toBe(year?.episodes)
  })

  it('месяц без оценок даёт ноль, а не среднюю по пустоте', () => {
    seed([entry(1, { completedAt: '2024-05-01', progress: 10 })])

    expect(buildStats().years[0]?.months[0]?.meanScore).toBe(0)
  })
})

describe('spline generation', () => {
  it('на пустом списке точек или одной точке не строит путь', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([{ x: 10, y: 20 }])).toBe('')
    expect(smoothAreaPath([])).toBe('')
    expect(smoothAreaPath([{ x: 10, y: 20 }])).toBe('')
  })

  it('на двух и более точках строит кубическую кривую Безье', () => {
    const points = [
      { x: 100, y: 800 },
      { x: 300, y: 400 },
      { x: 500, y: 200 },
    ]
    const d = smoothPath(points)

    expect(d.startsWith('M 100.0 800.0 C ')).toBe(true)
    expect(d.includes('500.0 200.0')).toBe(true)

    const area = smoothAreaPath(points, 1000)
    expect(area.startsWith(d)).toBe(true)
    expect(area.endsWith('L 500.0 1000.0 L 100.0 1000.0 Z')).toBe(true)
  })

  it('рассчитывает координаты верхушек столбиков с учётом минимальной высоты', () => {
    const bars = [{ share: 0 }, { share: 0.5 }, { share: 1 }]
    const points = pointsForBars(bars)

    expect(points).toHaveLength(3)
    // 3 столбика: центры при x = ((i + 0.5) / 3) * 1000
    expect(points[0]?.x).toBeCloseTo((0.5 / 3) * 1000, 5)
    expect(points[1]?.x).toBeCloseTo((1.5 / 3) * 1000, 5)
    expect(points[2]?.x).toBeCloseTo((2.5 / 3) * 1000, 5)

    // При нуле — высота 0, y = 1000
    expect(points[0]?.y).toBe(1000)
    // При 50% — y = 1000 - 500 = 500
    expect(points[1]?.y).toBe(500)
    // При 100% — y = 1000 - 1000 = 0
    expect(points[2]?.y).toBe(0)
  })

  it('кривая не выходит из промежутка между соседними вершинами', () => {
    // Данные дискретные (годы, оценки): линия, проходящая между ними, читалась бы как правда,
    // поэтому ни одна точка кривой не вправе оказаться выше или ниже своих соседей.
    const points = [
      { x: 100, y: 900 },
      { x: 200, y: 500 },
      { x: 300, y: 700 },
      { x: 400, y: 100 },
      { x: 500, y: 600 },
    ]
    const d = smoothPath(points)
    const segments = d.split(' C ').slice(1)

    expect(segments).toHaveLength(points.length - 1)
    segments.forEach((segment, i) => {
      const a = points[i]?.y ?? 0
      const b = points[i + 1]?.y ?? 0
      // Две контрольные точки и конец сегмента — три числа Y на каждую «C».
      const heights = [...segment.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]))
      expect(heights).toHaveLength(3)
      for (const y of heights) {
        expect(y).toBeGreaterThanOrEqual(Math.min(a, b) - 0.1)
        expect(y).toBeLessThanOrEqual(Math.max(a, b) + 0.1)
      }
    })
  })
})

describe('круглые деления шкалы', () => {
  it('верхняя линия не ниже самой высокой колонки, шаг — из 1, 2, 5 или 10', () => {
    expect(niceTicks(26)).toEqual([0, 10, 20, 30])
    expect(niceTicks(9)).toEqual([0, 5, 10])
    expect(niceTicks(95)).toEqual([0, 25, 50, 75, 100])
    expect(niceTicks(10, 5)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('у пустого графика остаётся только нулевое деление', () => {
    expect(niceTicks(0)).toEqual([0])
  })

  it('верхнее деление всегда не ниже самой высокой колонки', () => {
    // 44 при шаге 20: без верхней линии пик упирался в край, а поле читалось бы как 40.
    expect(niceTicks(44)).toEqual([0, 20, 40, 60])
    for (const top of [1, 7, 26, 44, 95, 130, 1400]) {
      const ticks = niceTicks(top)
      expect(ticks[0]).toBe(0)
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(top)
    }
  })
})

describe('сектор кольца', () => {
  it('начинается сверху и замыкается по внутреннему радиусу', () => {
    const d = sectorPath(0, 0.25)

    // −90° — верх кольца: первый сектор начинается там, где его ждёт глаз.
    expect(d.startsWith('M 60.00 3.00')).toBe(true)
    // Две дуги — по внешнему радиусу и обратно по внутреннему — и замыкание.
    expect(d.match(/ A /g)).toHaveLength(2)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('сектор шире половины круга рисуется большой дугой', () => {
    expect(sectorPath(0, 0.25)).toContain('A 57 57 0 0 1')
    expect(sectorPath(0, 0.75)).toContain('A 57 57 0 1 1')
  })

  it('смотрит туда же, куда повёрнута краска: подсказка встаёт на свою долю', () => {
    // Дуги повёрнуты на RING_TURN от начала координат окружности — в верх кольца.
    expect(RING_TURN).toBe('rotate(-90 60 60)')
    expect(sliceAngle(0)).toBe(-90)

    // Начало сектора лежит на луче sliceAngle: сдвиг слоя подсказок на четверть оборота
    // показывал бы подсказку одной доли над другой.
    const hit = /^M ([-\d.]+) ([-\d.]+)/.exec(sectorPath(0.25, 0.25))
    const x = Number(hit?.[1])
    const y = Number(hit?.[2])
    const angle = (Math.atan2(y - 60, x - 60) * 180) / Math.PI

    expect(angle).toBeCloseTo(sliceAngle(0.25), 6)
  })
})

describe('дуги кольца', () => {
  /** Окружность радиуса 44 — та же, что нарисована в разметке. */
  const ring = 2 * Math.PI * 44

  it('длину доли считает по радиусу самой окружности', () => {
    expect(arcDash(1)).toBe(`${ring.toFixed(2)} 0.00`)
    expect(arcDash(0.25)).toBe(`${(ring * 0.25).toFixed(2)} ${(ring * 0.75).toFixed(2)}`)
  })

  it('смещает долю по кольцу назад', () => {
    expect(arcShift(0)).toBe('0.00')
    expect(arcShift(0.25)).toBe(`${(-ring * 0.25).toFixed(2)}`)
  })
})

describe('легенда кольца', () => {
  // Порядок задан нарочно не по убыванию: легенда обязана переставить сектора сама.
  const slices = [
    { title: 'В планах', count: 2, share: 0.1, offset: 0.8 },
    { title: 'Смотрю', count: 10, share: 0.5, offset: 0 },
    { title: 'Брошено', count: 2, share: 0.1, offset: 0.9 },
    { title: 'Просмотрено', count: 6, share: 0.3, offset: 0.5 },
  ]

  it('оставляет три крупнейших в порядке убывания, а хвост собирает одной строкой', () => {
    const { head, tail } = splitLegend(slices)

    expect(head.map((slice) => slice.title)).toEqual(['Смотрю', 'Просмотрено', 'В планах'])
    expect(tail).toEqual({ parts: 1, count: 2, share: 0.1 })
  })

  it('у кольца из трёх секторов и меньше хвоста нет', () => {
    expect(splitLegend(slices.slice(0, 3)).tail).toBeNull()
  })

  it('пустое кольцо — пустая легенда', () => {
    expect(splitLegend([])).toEqual({ head: [], tail: null })
  })
})
