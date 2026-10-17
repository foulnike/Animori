// Состояние списка — из памяти коллекции, а не из ответа: список односторонний, правда живёт здесь.
// Возврат назад ничего не добирает; чужие службы спрашиваем о плитках, попавших в окно (v-seen).

import { computed, nextTick, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'

import { fetchMediaCard, type MediaCard } from '@/api/anilist-media'
import { setupVideoSources } from '@/api/video-sources'
import { hiddenCount, keepAllowed } from '@/core/adult'
import { editEntry, getEntry, type EntryLook } from '@/core/collection'
import { fetchFranchise, type FranchiseWork } from '@/core/franchise'
import { partsAired, partsCeiling } from '@/core/media-looks'
import {
  getRussianTitle,
  peekRussianName,
  prefetchRussianNames,
  type RussianAskState,
  type RussianTitle,
} from '@/core/media-title'
import {
  onPlayableChange,
  peekPlayable,
  primePlayable,
  requestPlayable,
  type PlayAsk,
  type PlayState,
} from '@/core/playable'
import { getTitleRatings, type TitleRatings } from '@/core/ratings'
import { studioLogos } from '@/core/studio-logos'
import { Logger } from '@/utils/logger'

import { formatWord, statusWord } from '../labels'
import { mediaSourceName } from '../media-links'
import { navigate } from '../router'

/** Пауза перед заказом меток показанным частям франшизы: прокрутка приводит их по несколько разом,
 *  и без придержки каждая плитка будила бы очередь ядра отдельно. */
const SEEN_PAUSE_MS = 200

/** Сколько открытых карточек держать в памяти показа: пяти хватает на заход по франшизе туда и обратно,
 *  а карточка с деревом и оценками не самая мелкая запись. */
const SHOWN_KEEP = 5

/** Сколько раз переспросить русский источник при сбое. Сбой — не отказ: сеть могла моргнуть,
 *  а Шикимори отвечает 429 на темпе. Дальше смысла нет — карточка без описания хуже английского текста. */
const RU_TRIES = 2

/** Пауза перед повтором: успевает отпустить и короткий сбой, и темп. */
const RU_PAUSE_MS = 1200

/** Пауза. Повтор без неё долбит источник тем же темпом, что его и уронил. */
function nap(ms: number): Promise<void> {
  return new Promise((allow) => setTimeout(allow, ms))
}

export interface Rating {
  key: string
  label: string
  value: string
}

export interface MineFact {
  key: string
  name: string
  value: string
}

/** Виды правки, доступные с карточки; удаление записи сюда пока не входит. */
type CardEdit =
  'status' | 'score' | 'progress' | 'repeat' | 'startedAt' | 'completedAt' | 'notes' | 'remove'

/** Уже открытая карточка целиком: возврат назад показывает её без вопросов. */
interface Shown {
  card: MediaCard
  russian: RussianTitle | null
  ratings: TitleRatings | null
  franchise: FranchiseWork[] | null
}

/** Всё, что разметка карточки берёт готовым. */
export interface MediaCardView {
  card: Ref<MediaCard | null>
  busy: Ref<boolean>
  trouble: Ref<string>
  franList: Ref<HTMLElement | null>
  status: ComputedRef<string>
  score10: ComputedRef<number>
  progress: ComputedRef<number>
  repeat: ComputedRef<number>
  startedAt: ComputedRef<string | null>
  completedAt: ComputedRef<string | null>
  notes: ComputedRef<string | null>
  partsTotal: ComputedRef<number | null>
  listed: ComputedRef<boolean>
  listLabel: ComputedRef<string>
  mainTitle: ComputedRef<string>
  heroStyle: ComputedRef<{ backgroundImage: string }>
  donePart: ComputedRef<string>
  progressText: ComputedRef<string>
  about: ComputedRef<string>
  /** Описание ещё не приехало: вместо текста показывается заглушка. */
  aboutWait: ComputedRef<boolean>
  /** Название источника описания текстом: пустая строка — источник не назван. */
  aboutSource: ComputedRef<string>
  facts: ComputedRef<string[]>
  ratings: ComputedRef<Rating[]>
  mineFacts: ComputedRef<MineFact[]>
  franchiseRows: ComputedRef<readonly FranchiseWork[]>
  franchiseHidden: ComputedRef<number>
  load: () => Promise<void>
  studioLogo: (name: string) => string | null
  franchiseName: (work: FranchiseWork) => string
  franchiseStatus: (work: FranchiseWork) => string | null
  franchiseHint: (work: FranchiseWork) => string
  franchisePlay: (work: FranchiseWork) => PlayState | null
  onPartSeen: (work: FranchiseWork) => void
  openFranchiseWork: (work: FranchiseWork) => void
  openStudio: (studioId: number) => void
  onPickStatus: (value: string) => void
  onPickScore: (value: number) => void
  onPickProgress: (value: number) => void
  onPickRepeat: (value: number) => void
  onPickStarted: (value: string) => void
  onPickCompleted: (value: string) => void
  onPickNotes: (value: string) => void
  /** Убрать тайтл из списка целиком: закладка, оценка, счёт, даты и заметка. */
  onPickRemove: () => void
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Оценка числом или прочерк: нуль значит «не оценено». */
export function scoreText(value: number): string {
  return value > 0 ? value.toFixed(1) : '—'
}

/** Дата человеческим видом. Строка разбирается вручную: прогон через `Date` счёл бы её полночью
 *  по Гринвичу и сдвинул день назад у половины мира. */
export function dateText(value: string | null): string {
  if (value === null) return '—'

  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!parts) return value

  return `${parts[3]}.${parts[2]}.${parts[1]}`
}

/** Собирает всё состояние одной карточки вокруг номера аниме из адреса: номер показа гасит ответы,
 *  пришедшие уже к другому аниме. */
export function useMediaCard(mediaId: Ref<number>): MediaCardView {
  const card = ref<MediaCard | null>(null)
  const russian = ref<RussianTitle | null>(null)

  /** Чем кончился вопрос к русскому источнику; `wait` — спросили, ответа нет. Отдельно от карточки:
   *  пустая карточка бывает и отказом, и сбоем, а до ответа английский текст мигал бы латиницей. */
  const ruState = ref<RussianAskState | 'wait'>('wait')

  const busy = ref(true)
  const trouble = ref('')

  /** Литографии студий с Шикимори: подставляются в чипы по готовности. */
  const logos = ref<Map<string, string> | null>(null)

  /** Оценки Шикимори и MAL: доход отдельный от русской карточки. */
  const platformRatings = ref<TitleRatings | null>(null)

  /** Хронология франшизы: null — дерева нет или оно не приехало. */
  const franchise = ref<FranchiseWork[] | null>(null)

  /** Счётчик добора русских имён франшизы: заставляет пересчитать строки. */
  const franchiseStamp = ref(0)

  /** Счётчик добора меток доступности: память ответов вне реактивности. */
  const playStamp = ref(0)

  /** Счётчик добора имени из датасета: заставляет пересчитать заголовок. */
  const nameStamp = ref(0)

  /** Полка франшизы: к нынешнему аниме она прокручивается сама. */
  const franList = ref<HTMLElement | null>(null)

  /** Счётчик правок этого показа: заставляет пересчитать взятое из памяти. */
  const editStamp = ref(0)

  let run = 0

  /** Открытые за этот заход карточки: возврат назад достаёт аниме отсюда — ни пустоты на экране,
   *  ни повторных доборов дерева, имён и оценок. */
  const shown = new Map<number, Shown>()

  /** Части полки, чьи плитки человек уже видел: только о них спрашиваются источники. */
  const seenParts = new Set<number>()

  let seenTimer: ReturnType<typeof setTimeout> | null = null

  /** Что должно быть готово до вопросов источникам: заказ в сеть ждёт этого — спрашивать чужие службы
   *  о том, что вот-вот приедет с диска, худший из возможных запросов. */
  let priming: Promise<void> = Promise.resolve()

  // Ответы очереди приходят по одному, и часть — чужие вопросы с других экранов про те же части:
  // подписка показывает каждый ответ сразу, а не в конце своего захода.
  const stopPlayWatch = onPlayableChange(() => {
    playStamp.value += 1
  })

  // Очередь живёт дольше карточки: неснятая подписка держала бы её область в памяти и била бы счётчик.
  onScopeDispose(stopPlayWatch)

  // Отложенный заказ меток тоже переживал бы карточку и будил очередь ради полки, которой больше нет.
  onScopeDispose(() => {
    if (seenTimer !== null) clearTimeout(seenTimer)
    seenTimer = null
  })

  /** Своя запись из памяти. Счётчик правок в зависимостях не случаен: мап коллекции вне реактивности Vue,
   *  сам он пересчёт не закажет. */
  const own = computed(() => {
    void editStamp.value
    return mediaId.value > 0 ? getEntry(mediaId.value) : undefined
  })

  /** Облик аниме для записи списка: латинские имена и метка взрослого. Идёт вместе с правкой, иначе запись,
   *  созданная до переноса списка, осталась бы безымянной. */
  const look = computed<EntryLook | undefined>(() => {
    const found = card.value
    if (found === null) return undefined

    return {
      romaji: found.romaji,
      english: found.english,
      isAdult: found.isAdult,
    }
  })

  /** Статус для выбора: память главнее ответа, ответ — запас на первый показ. */
  const status = computed<string>(() => own.value?.status ?? card.value?.ownEntry?.status ?? '')

  const score10 = computed<number>(() => own.value?.score10 ?? card.value?.ownEntry?.score10 ?? 0)

  const progress = computed<number>(
    () => own.value?.progress ?? card.value?.ownEntry?.progress ?? 0,
  )

  /** Пересмотры. Правило то же: память впереди ответа. */
  const repeat = computed<number>(() => own.value?.repeat ?? card.value?.ownEntry?.repeat ?? 0)

  const startedAt = computed<string | null>(
    () => own.value?.startedAt ?? card.value?.ownEntry?.startedAt ?? null,
  )

  const completedAt = computed<string | null>(
    () => own.value?.completedAt ?? card.value?.ownEntry?.completedAt ?? null,
  )

  const notes = computed<string | null>(
    () => own.value?.notes ?? card.value?.ownEntry?.notes ?? null,
  )

  /** Сколько серий уже вышло: по этому числу считается полоса и шаг. У идущего сезона объявленного
   *  итога часто нет вовсе. */
  const partsTotal = computed<number | null>(() =>
    card.value === null ? null : partsCeiling(card.value),
  )

  const partsPlanned = computed<number | null>(() => card.value?.episodes ?? null)

  /** Надпись главной кнопки: своя закладка, а без неё приглашение добавить. */
  const listLabel = computed<string>(() => {
    const word = statusWord(status.value === '' ? null : status.value)
    return word ?? 'Добавить в список'
  })

  const mainTitle = computed<string>(() => {
    // Счётчик в зависимостях: добор имени фоном сам по себе пересчёт не закажет.
    void nameStamp.value
    return (
      russian.value?.russian ??
      peekRussianName(mediaId.value) ??
      card.value?.romaji ??
      card.value?.english ??
      `Аниме #${mediaId.value}`
    )
  })

  /** Подложка героя: баннер сервера, а без него тон обложки. */
  const heroStyle = computed<{ backgroundImage: string }>(() => {
    const banner = card.value?.banner
    if (banner) return { backgroundImage: `url("${banner}")` }

    const tone = card.value?.color ?? '#1b2534'
    return { backgroundImage: `linear-gradient(120deg, ${tone}, #0b1018)` }
  })

  /** Есть ли запись в списке: без неё панель — одна кнопка добавления. */
  const listed = computed<boolean>(() => status.value !== '')

  const doneShare = computed<number>(() => {
    const total = partsTotal.value
    if (total === null || total <= 0) return status.value === 'COMPLETED' ? 1 : 0

    return Math.min(1, Math.max(0, progress.value / total))
  })

  const donePart = computed<string>(() => `${Math.round(doneShare.value * 100)}%`)

  /** Строка счёта серий вида «7 из 12». Неизвестный итог не выдумывается. */
  const partsText = computed<string>(() => {
    const total = partsTotal.value
    return total === null ? String(progress.value) : `${progress.value} из ${total}`
  })

  const progressText = computed<string>(() =>
    partsTotal.value === null ? partsText.value : `${partsText.value} · ${donePart.value}`,
  )

  /** Описание как приехало: разметку разбирает RichText, ему нужен исходник — срезанные здесь теги
   *  уносили с собой перекрёстные ссылки, спойлеры и начертания. */
  const about = computed<string>(() => {
    // Пустая строка от русского источника не гасит английский текст с AniList.
    const ru = russian.value?.description?.trim() ?? ''
    if (ru !== '') return ru

    // Английский показывается только когда русский источник ответил: подмена латиницы на кириллицу
    // на глазах читается как поломка. Отказ ('none') английский разрешает.
    if (ruState.value === 'wait') return ''

    return card.value?.description?.trim() ?? ''
  })

  /** Описание ещё в пути: отдельно от пустого `about`, иначе не видно, стоит ли заглушка или честное
   *  «описаний нет». */
  const aboutWait = computed<boolean>(() => ruState.value === 'wait')

  /** Бледная строка под описанием: откуда взят текст. Названием, а не ссылкой —
   *  открывать адрес на телевизоре нечем, а подчёркнутая подпись, которая ничего не
   *  делает, читается как поломка. Сбор названия — в media-links.ts. */
  const aboutSource = computed<string>(() =>
    mediaSourceName({
      sourceUrl: russian.value?.url ?? null,
      sourceName: russian.value?.sourceName ?? null,
    }),
  )

  /** Факты пилюлями под названием: только то, что сервер впрямь назвал. */
  const facts = computed<string[]>(() => {
    const found = card.value
    if (found === null) return []

    const list: string[] = []
    const kindWord = formatWord(found.format)
    if (kindWord !== null) list.push(kindWord)
    if (found.seasonYear !== null) list.push(String(found.seasonYear))
    if (partsPlanned.value !== null) list.push(`Серий: ${partsPlanned.value}`)

    // У идущего сезона важно не обещанное, а то, что уже можно смотреть. Счёт берётся у `partsAired`,
    // а не у знаменателя полосы: у анонса тот подменяет ноль объявленным итогом.
    const aired = partsAired(found)
    if (aired !== null) list.push(`Вышло: ${aired}`)

    if (found.duration) list.push(`${found.duration} мин`)

    return list
  })

  /** Рейтинг трёх площадок. AniList — из карточки; Шикимори и MAL — своим доходом: название мог добыться
   *  из датасета, а он про оценки не знает. */
  const ratings = computed<Rating[]>(() => {
    const list: Rating[] = []

    const al = card.value?.averageScore
    if (typeof al === 'number' && al > 0) {
      list.push({ key: 'al', label: 'AniList', value: (al / 10).toFixed(1) })
    }

    const marks = platformRatings.value
    if (marks?.shikimori) {
      list.push({ key: 'shiki', label: 'Шикимори', value: marks.shikimori.toFixed(1) })
    }
    if (marks?.mal) {
      list.push({ key: 'mal', label: 'MAL', value: marks.mal.toFixed(1) })
    }

    return list
  })

  /** Факты записи строками: рисуются только с настоящим значением. Серий здесь нет — их показывает полоса. */
  const mineFacts = computed<MineFact[]>(() => {
    const list: MineFact[] = []
    if (score10.value > 0)
      list.push({ key: 'score', name: 'Оценка', value: scoreText(score10.value) })
    if (repeat.value > 0)
      list.push({ key: 'repeat', name: 'Пересмотры', value: String(repeat.value) })
    if (startedAt.value !== null)
      list.push({ key: 'started', name: 'Начато', value: dateText(startedAt.value) })
    if (completedAt.value !== null)
      list.push({ key: 'completed', name: 'Закончено', value: dateText(completedAt.value) })
    return list
  })

  /** Видимые части франшизы. Манга из дерева не показывается: открывать её карточку нечем, а плитка
   *  без перехода вводит в заблуждение. Взрослое убирается общим отбором. */
  const franchiseRows = computed<readonly FranchiseWork[]>(() => {
    // Закладки частей живут в памяти коллекции: пересчёт после своих правок.
    void editStamp.value
    void franchiseStamp.value

    const works = franchise.value
    if (works === null) return []

    return keepAllowed(
      works.filter((w) => w.type !== 'MANGA'),
      (w) => w.isAdult,
    )
  })

  const franchiseHidden = computed<number>(() => {
    const works = franchise.value
    if (works === null) return 0

    return hiddenCount(
      works.filter((w) => w.type !== 'MANGA'),
      (w) => w.isAdult,
    )
  })

  /** Прокручивает полку франшизы к нынешнему аниме — и только её: `scrollIntoView` доводил до видимости
   *  всех прокручиваемых родителей и увозил карточку с баннера. Вертикаль страницы не трогаем. */
  function scrollToHere(): void {
    void nextTick(() => {
      const box = franList.value
      const hit = box?.querySelector<HTMLElement>('.am-face__hit--here')
      if (!box || !hit) return

      const place = hit.getBoundingClientRect()
      const frame = box.getBoundingClientRect()
      box.scrollTo({
        left: box.scrollLeft + place.left - frame.left - (frame.width - place.width) / 2,
        behavior: 'smooth',
      })
    })
  }

  function forgetShown(): void {
    card.value = null
    russian.value = null
    ruState.value = 'wait'
    platformRatings.value = null
    franchise.value = null
  }

  function keepShown(): void {
    const found = card.value
    if (found === null) return

    // Перезапись поднимает запись в конец очереди вытеснения: Map помнит порядок вставки.
    shown.delete(found.mediaId)
    shown.set(found.mediaId, {
      card: found,
      russian: russian.value,
      ratings: platformRatings.value,
      franchise: franchise.value,
    })

    // Самое давнее лежит первым: удаление по ходу обхода Map безопасно.
    for (const key of shown.keys()) {
      if (shown.size <= SHOWN_KEEP) break
      shown.delete(key)
    }
  }

  function dropSeen(): void {
    if (seenTimer !== null) clearTimeout(seenTimer)
    seenTimer = null
    seenParts.clear()
  }

  /** Чем спрашивать источники про часть: номера и названия по убыванию пригодности. */
  function partAsk(work: FranchiseWork, id: number): PlayAsk {
    const names = [...new Set([work.name, peekRussianName(id) ?? ''])]

    return {
      mediaId: id,
      malId: work.malId,
      titles: names.filter((name) => name !== ''),
      year: typeof work.year === 'number' ? work.year : undefined,
    }
  }

  /** Поднимает метки полки со склада: сети не касается, поэтому спрашивается всё дерево разом, включая
   *  хвост за прокруткой — однажды спрошенное показывается целиком и даром. */
  async function primeFranchisePlay(mine: number, ids: readonly number[]): Promise<void> {
    try {
      const primed = await primePlayable(ids)
      if (mine !== run) return
      if (primed > 0) playStamp.value += 1
    } catch (e) {
      // Без метки полка живая: плитка про доступность просто молчит.
      Logger('WARN', 'Карточка: метки франшизы со склада не поднялись', e)
    }
  }

  /** Что готовится до вопросов источникам: метки со склада и русские имена частей. Склад отвечает даром,
   *  а без русского названия часть находится заметно хуже — источники ищут словами. */
  async function readyForAsk(mine: number, ids: readonly number[]): Promise<void> {
    await primeFranchisePlay(mine, ids)

    try {
      // Копией: добор имён принимает изменяемый массив, а дерево приходит только для чтения.
      await prefetchRussianNames([...ids])
      if (mine !== run) return

      franchiseStamp.value += 1
    } catch (e) {
      Logger('WARN', 'Карточка: русские имена франшизы не добрались', e)
    }
  }

  /** Заказывает метки показанным частям полки. Ответы приезжают подпиской, темп держит очередь ядра. */
  async function askSeenParts(): Promise<void> {
    await priming

    const works = franchise.value
    if (works === null) {
      seenParts.clear()
      return
    }

    const asks: PlayAsk[] = []

    for (const work of works) {
      const id = work.mediaId
      if (id === null || !seenParts.has(id)) continue
      if (peekPlayable(id) !== null) continue

      asks.push(partAsk(work, id))
    }

    seenParts.clear()

    if (asks.length === 0) return

    // Реестр источников собирает слой api: ядро своих поставщиков не зовёт.
    setupVideoSources()

    requestPlayable(asks)
  }

  /** Плитка части показалась человеку. Номера копятся пачкой: прокрутка приводит их по несколько разом,
   *  и очередь ядра не должна просыпаться на каждую плитку. Нынешнее аниме с полки не спрашивается. */
  function onPartSeen(work: FranchiseWork): void {
    const id = work.mediaId
    if (id === null || id === mediaId.value || work.type === 'MANGA') return
    if (peekPlayable(id) !== null) return

    seenParts.add(id)
    if (seenTimer !== null) return

    seenTimer = setTimeout(() => {
      seenTimer = null
      void askSeenParts()
    }, SEEN_PAUSE_MS)
  }

  async function beginFranchise(mine: number, id: number, found: MediaCard): Promise<void> {
    const works = await fetchFranchise(id, found.malId)
    if (mine !== run || works === null) return

    franchise.value = works
    scrollToHere()

    // Манга из дерева не показывается: ни имён, ни меток ей не нужно.
    const ids = works.flatMap((w) => (w.type !== 'MANGA' && w.mediaId !== null ? [w.mediaId] : []))
    if (ids.length === 0) return

    // Плитки уже на экране и вот-вот отметятся показанными: их заказ ждёт этого захода, поэтому обещание
    // кладётся до первого await.
    priming = readyForAsk(mine, ids)
    await priming
  }

  /** Забирает подробности и русскую карточку. Фоновые доборы её не ждут. */
  async function load(): Promise<void> {
    const mine = ++run
    const id = mediaId.value

    // Уходящее аниме остаётся в памяти захода: возврат назад покажет его сразу.
    keepShown()
    dropSeen()

    trouble.value = ''

    if (id === 0) {
      forgetShown()
      // Ждать нечего: карточки нет, и заглушка описания висела бы вечно.
      ruState.value = 'none'
      busy.value = false
      return
    }

    const seen = shown.get(id)
    if (seen !== undefined) {
      // Эту карточку в заходе уже открывали: ни сети, ни доборов — всё лежит готовым.
      card.value = seen.card
      russian.value = seen.russian
      // В памяти лежит уже отвеченное: иначе описание простояло бы заглушкой до закрытия карточки,
      // хотя ответ давно известен.
      ruState.value = seen.russian === null ? 'none' : 'ready'
      platformRatings.value = seen.ratings
      franchise.value = seen.franchise
      priming = Promise.resolve()
      busy.value = false

      // Память имён и ответов вне реактивности Vue: без счётчиков полка осталась бы с прежними метками.
      nameStamp.value += 1
      franchiseStamp.value += 1
      playStamp.value += 1
      scrollToHere()
      return
    }

    forgetShown()
    busy.value = true

    // Имя — сразу из памяти или датасета: ждать сетевую карточку ради заголовка не нужно, полная
    // русская карточка с описанием доедет ниже.
    void prefetchRussianNames([id])
      .then(() => {
        if (mine === run) nameStamp.value += 1
      })
      .catch((e) => {
        Logger('WARN', `Карточка ${id}: фоновое имя не добралось`, e)
      })

    try {
      const found = await fetchMediaCard(id)
      if (mine !== run) return

      if (!found) {
        trouble.value = 'Сервер не отдал это аниме. Попробуйте позже.'
        return
      }

      card.value = found

      // Литографии подгружаются фоном: чипы студий их не ждут.
      if (found.studios.length > 0) {
        void studioLogos()
          .then((map) => {
            if (mine === run) logos.value = map
          })
          .catch((e) => {
            Logger('WARN', `Карточка ${id}: логотипы студий не загрузились`, e)
          })
      }

      // Оценки площадок — своим доходом: карточка их не ждёт.
      void getTitleRatings(id, found.malId)
        .then((marks) => {
          if (mine === run) platformRatings.value = marks
        })
        .catch((e) => {
          Logger('WARN', `Карточка ${id}: рейтинги не загрузились`, e)
        })

      // Дерево франшизы — фоном: полка его не ждёт.
      void beginFranchise(mine, id, found).catch((e) => {
        Logger('WARN', `Карточка ${id}: франшиза не загрузилась`, e)
      })
    } catch (e) {
      if (mine !== run) return
      trouble.value = describe(e)
      return
    } finally {
      if (mine === run) busy.value = false
    }

    await beginRussian(mine, id)
  }

  /** Русская карточка с повтором на сбое: сбой отличается от «перевода нет», а после исчерпания попыток
   *  исход считается отказом — карточка без описания хуже карточки с английским. */
  async function beginRussian(mine: number, id: number): Promise<void> {
    for (let tryNo = 1; ; tryNo += 1) {
      const ask = await getRussianTitle(id)
      if (mine !== run) return

      if (ask.state !== 'fail') {
        russian.value = ask.title
        ruState.value = ask.state
        return
      }

      if (tryNo >= RU_TRIES) {
        Logger('WARN', `Карточка ${id}: русский источник не ответил, показываем английский`)
        ruState.value = 'none'
        return
      }

      await nap(RU_PAUSE_MS)
      if (mine !== run) return
    }
  }

  function openStudio(studioId: number): void {
    navigate('studio', { id: String(studioId) })
  }

  /** Литография студии по имени; промах — чип без картинки, это штатно. */
  function studioLogo(name: string): string | null {
    return logos.value?.get(name.trim().toLowerCase()) ?? null
  }

  /** Имя части франшизы. У раздробленной части русское имя одно на все записи, и различает их только
   *  хвост названия AniList; он идёт первым — строка обрезается по концу, и хвост в конце пропадал бы. */
  function franchiseName(work: FranchiseWork): string {
    if (work.stage !== null) return `${work.stage} · ${work.name}`

    return work.mediaId === null ? work.name : (peekRussianName(work.mediaId) ?? work.name)
  }

  function franchiseStatus(work: FranchiseWork): string | null {
    if (work.mediaId === null) return null
    return statusWord(getEntry(work.mediaId)?.status ?? null)
  }

  /** Подсказка части франшизы: полное имя записи и вид. У раздробленной части в строке стоит один хвост,
   *  и целиком название помещается только здесь. */
  function franchiseHint(work: FranchiseWork): string {
    const full = work.stage !== null && work.title !== null ? work.title : work.name
    return work.kind === null ? full : `${full} · ${work.kind}`
  }

  /** Есть ли часть у источников видео. Счётчик в зависимостях не случаен: память ответов живёт вне
   *  реактивности Vue. */
  function franchisePlay(work: FranchiseWork): PlayState | null {
    void playStamp.value
    return work.mediaId === null ? null : peekPlayable(work.mediaId)
  }

  /** Переход на карточку части франшизы: нынешняя и несопоставленная не ведут. */
  function openFranchiseWork(work: FranchiseWork): void {
    if (work.mediaId === null || work.mediaId === mediaId.value) return
    navigate('media', { id: String(work.mediaId) })
  }

  /** Кладёт одну правку в память и обновляет показ. Синхронно и без сети: запись снимка уйдёт
   *  на диск отложенно. */
  function send(kind: CardEdit, value: string | number | null): void {
    if (mediaId.value === 0) return

    try {
      // Облик идёт вместе с правкой: без переноса списка его больше взять негде.
      editEntry(mediaId.value, kind, value, look.value)
      editStamp.value += 1
    } catch (e) {
      trouble.value = describe(e)
    }
  }

  function onPickStatus(value: string): void {
    if (value === status.value) return
    send('status', value)
  }

  function onPickScore(value: number): void {
    send('score', value)
  }

  function onPickProgress(value: number): void {
    send('progress', value)
  }

  function onPickRepeat(value: number): void {
    send('repeat', value)
  }

  function onPickStarted(value: string): void {
    send('startedAt', value)
  }

  function onPickCompleted(value: string): void {
    send('completedAt', value)
  }

  function onPickNotes(value: string): void {
    send('notes', value)
  }

  /** Убрать тайтл из списка: запись уходит целиком — вместе с оценкой, счётом, датами и заметкой.
   *  Местная правка: на сервере AniList запись остаётся, как и при удалении всего списка. */
  function onPickRemove(): void {
    send('remove', null)
  }

  return {
    card,
    busy,
    trouble,
    franList,
    status,
    score10,
    progress,
    repeat,
    startedAt,
    completedAt,
    notes,
    partsTotal,
    listed,
    listLabel,
    mainTitle,
    heroStyle,
    donePart,
    progressText,
    about,
    aboutWait,
    aboutSource,
    facts,
    ratings,
    mineFacts,
    franchiseRows,
    franchiseHidden,
    load,
    studioLogo,
    franchiseName,
    franchiseStatus,
    franchiseHint,
    franchisePlay,
    onPartSeen,
    openFranchiseWork,
    openStudio,
    onPickStatus,
    onPickScore,
    onPickProgress,
    onPickRepeat,
    onPickStarted,
    onPickCompleted,
    onPickNotes,
    onPickRemove,
  }
}
