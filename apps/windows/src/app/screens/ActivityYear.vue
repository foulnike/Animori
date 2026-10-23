<script setup lang="ts">
// Календарик активности за год: колонки недель по семь дней, квадрат — день и число дел, щелчок раскрывает каких.
// Всё считает home-activity; месяцы не разделены; день — модалкой поверх всего.

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  activityOf,
  activityYear,
  activityYears,
  dayTitle,
  fillActivityTitles,
  watchActivity,
  whenActivityReady,
  type ActivityKind,
} from '@/core/activity'
import { peekLook, warmLooks } from '@/core/media-looks'
import { peekRussianName, prefetchRussianNames } from '@/core/media-title'
import { Logger } from '@/utils/logger'
import { getPlural } from '@/utils/dom'

import SakuraBloom from '../components/SakuraBloom.vue'
import { holdDialog } from '../dialog-focus'
import { statusWord } from '../labels'
import { navigate } from '../router'
import { hourText } from './home-calendar'
import {
  activityAnchor,
  activityCells,
  activityColumns,
  activityFacts,
  activityGroups,
  activityMonths,
  activityTotals,
  activityWeekdays,
  activityYearStep,
  type ActivityAct,
  type ActivityCell,
  type ActivityGroup,
} from './home-activity'

/**
 * Без панели: календарик живёт внутри плашки приветствия, где своя стеклянная карточка была бы второй карточкой внутри карточки. Остаётся только содержание — сетка и модалка дня.
 */
const props = withDefaults(defineProps<{ bare?: boolean }>(), { bare: false })

/**
 * Запасная подпись вида дела: человек читает слова, а не вид символа. Рода в них нет — приложение описывает
 * состояние, а не действие. Всё известное про дело подставляет actWords; запасная нужна, когда не известно ничего.
 */
const KIND_WORDS: Readonly<Record<ActivityKind, string>> = {
  watch: 'Просмотр засчитан',
  status: 'Статус изменён',
  progress: 'Прогресс обновлён',
  score: 'Оценка изменена',
  note: 'Заметка изменена',
  repeat: 'Счётчик пересмотров обновлён',
  add: 'Добавлено в список',
  remove: 'Убрано из списка',
}

/** Начало местных суток. По нему «сегодня» — одно и то же для всех расчётов на экране. */
function dayStart(stamp: number): number {
  const date = new Date(stamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** День с годом: год на сетке переключается, и «16 сентября» из соседнего года читалось бы как тот
 * же день. Год уходит в подпись клетки и в шапку модалки, а не на сетку: полоса без заголовка чище. */
function dayText(stamp: number): string {
  return `${dayTitle(stamp)} ${new Date(stamp).getFullYear()}`
}

const today = dayStart(Date.now())
const cells = ref<ActivityCell[]>([])
const picked = ref(0)
const ready = ref(false)

/** Доска года: единственное место, где сетка прокручивается вбок. */
const board = ref<HTMLElement | null>(null)

/** Счётчик добычи подписей: мапы имён живут вне реактивности Vue, и пересчёт надо заказывать самим. */
const titleStamp = ref(0)

const months = computed(() => activityMonths(cells.value))
const weekdays = activityWeekdays()
const columns = computed(() => activityColumns(cells.value))
const totals = computed(() => activityTotals(cells.value))

/** Год, который стоит на сетке: слева январь, справа декабрь. По умолчанию нынешний — с
 * наступлением января сетка встаёт на него сама, уйти назад можно только переключателем. Данные начинаются и кончаются 2026 годом. */
const shown = ref(new Date(today).getFullYear())

/** Годы с активностью: от них и берутся переключатели — пустой год показывать нечем. */
const years = ref<number[]>([])

/** Куда можно переключиться: левое — назад, правое — вперёд. */
const yearStep = computed(() => activityYearStep(shown.value, years.value))

/** Подпись для чтения с экрана: единственное место, где остались год и итоги. Год здесь тот, что
 * показан, а не
 * нынешний: переключили — и подпись за ним. */
const gridLabel = computed(() => {
  const { days, events } = totals.value
  return (
    `Активность по дням за ${shown.value} год: ${days} ${getPlural(days, ['день', 'дня', 'дней'])}` +
    ` и ${events} ${getPlural(events, ['действие', 'действия', 'действий'])}`
  )
})

/** Раскрытый день: ноль значит «свёрнуто», и модалки нет. */
const opened = computed(() => {
  void titleStamp.value
  return picked.value > 0 ? activityOf(picked.value) : []
})

/** Клетка раскрытого дня: из неё и подпись дня, и число дел — обе надписи не считаются отдельно. */
const openedCell = computed(() => cells.value.find((cell) => cell.day === picked.value))

/** Блоки дня: один тайтл — один блок, внутри дела по порядку совершения. */
const groups = computed<ActivityGroup[]>(() => {
  void titleStamp.value
  return activityGroups(opened.value)
})

/**
 * Подпись тайтла прямо сейчас: русское имя, запись журнала, латиница. Свежее имя важнее записанного — оно могло доехать уже после того, как дело легло в журнал.
 */
function titleOf(group: ActivityGroup): string {
  const russian = peekRussianName(group.mediaId)
  if (russian !== null && russian !== '') return russian
  if (group.title !== '') return group.title

  const look = peekLook(group.mediaId)
  return look?.romaji || look?.english || 'Без названия'
}

/** Подпись, известная кэшам прямо сейчас: по ней и решается, добывать ли имена заново. */
function freshTitle(mediaId: number): string {
  const russian = peekRussianName(mediaId)
  if (russian !== null && russian !== '') return russian

  const look = peekLook(mediaId)
  return look?.romaji || look?.english || ''
}

/**
 * Слова одного дела. Без рода: приложение описывает, что стало. И с деталями: оценка показывает переход
 * «7 → 8» и разделяет первую постановку со сменой, прогресс — «3 → 5 из 12». Число без перехода хуже перехода.
 */
function actWords(act: ActivityAct, group: ActivityGroup): string {
  switch (act.kind) {
    // Вид остался на чтение: события просмотра лежат в журналах прежних сборок, а новых не пишет никто — счёт серий человек отмечает сам.
    case 'watch':
      return act.parts > 0 ? `Серия ${act.parts} просмотрена` : KIND_WORDS.watch

    case 'status': {
      const word = statusWord(act.mark)
      return word === null ? KIND_WORDS.status : `Статус сменился на «${word}»`
    }

    case 'progress': {
      if (act.parts <= 0) return KIND_WORDS.progress

      // Итог сериала прилагается, когда известен: «3 → 5 из 12» читается как доля без подсчёта.
      const total = peekLook(group.mediaId)?.episodes ?? null
      const ceiling = total !== null && total >= act.parts ? ` из ${total}` : ''
      return act.from === null
        ? `Прогресс: ${act.parts}${ceiling}`
        : `Прогресс: ${act.from} → ${act.parts}${ceiling}`
    }

    case 'repeat': {
      // Счётчик пересмотров — не прогресс: у него свой вид в журнале, иначе чипса врала бы, назвав смену пересмотра «Прогресс обновлён».
      if (act.parts <= 0) return KIND_WORDS.repeat
      return act.from === null
        ? `Пересмотры: ${act.parts}`
        : `Пересмотры: ${act.from} → ${act.parts}`
    }

    case 'score': {
      // Три исхода и запасной: впервые, изменена, снята; без числа остаётся общее слово.
      if (act.score === null) return KIND_WORDS.score
      if (act.score <= 0) return 'Оценка снята'
      if (act.from === null) return `Оценка: ${act.score}`
      if (act.from <= 0) return `Оценка поставлена впервые: ${act.score}`
      return `Оценка изменена: ${act.from} → ${act.score}`
    }

    case 'add': {
      const word = statusWord(act.mark)
      return word === null ? KIND_WORDS.add : `${KIND_WORDS.add}: ${word}`
    }

    default:
      return KIND_WORDS[act.kind]
  }
}

function redraw(): void {
  cells.value = activityCells(today, activityYear(today, shown.value))
  years.value = activityYears()
}

/** Переключение года по кнопке: сетка и модалка дня относятся к разным годам, и открытая уходит. */
function pickYear(year: number): void {
  if (year === shown.value) return

  shown.value = year
  picked.value = 0
  redraw()
  void scrollToAnchor()
}

/**
 * Наступил новый год — сетка встаёт на него сама, без щелчка: год на месте, а не уехавший. Сигналом служит первое же дело нового года, а не таймер на полуночь.
 */
function followYear(): void {
  const now = new Date().getFullYear()
  if (now <= shown.value) return

  shown.value = now
  picked.value = 0
}

/**
 * Номер клетки, на которую сетка встаёт прокруткой — считает activityAnchor, а решение «по центру или у края» принимает scrollToAnchor.
 */
function anchorOf(): number {
  return activityAnchor(cells.value, new Date(today).getFullYear(), shown.value)
}

/** Клетка встаёт по центру доски: у самого края она жалась бы к нему, и месяца по краю не видно. */
async function scrollToAnchor(): Promise<void> {
  const host = board.value
  if (host === null) return

  // Прокрутка идёт по нарисованной сетке: сначала кадр, потом уже прямоугольники клеток.
  await nextTick()

  const cell = host.querySelector<HTMLElement>(`.am-act__cell[data-at="${anchorOf()}"]`)
  if (cell === null) return

  // Смещение считаем по прямоугольникам, а не по offsetLeft: у клетки свой предок смещения, и разница с доской увела бы прокрутку на padding плашки.
  const hostBox = host.getBoundingClientRect()
  const cellBox = cell.getBoundingClientRect()
  host.scrollLeft += cellBox.left - hostBox.left - (host.clientWidth - cellBox.width) / 2
}

/** Окно сузили или расширили: опора года должна остаться на виду. */
function onResize(): void {
  void scrollToAnchor()
}

function pick(day: number, future: boolean): void {
  if (future) return

  // Повторный щелчок по тому же дню закрывает модалку: жест остался с прежних времён, когда день раскрывался на месте, и отучать от него незачем.
  if (picked.value === day) {
    closeDay()
    return
  }

  picked.value = day
  void raiseTitles(day)
}

function closeDay(): void {
  picked.value = 0
}

/** Корень модалки дня и снятие ловушки фокуса. */
const dayRoot = ref<HTMLElement | null>(null)
let unhold: (() => void) | null = null

/** Открытый день: ячейка перерисовывается вместе с сеткой, возврат ищет её заново. */
let openDay = 0

// Ячейка перерисовывается вместе с сеткой, поэтому возврат ищет её заново по data-at.
watch(
  () => picked.value > 0,
  (open) => {
    if (open) {
      openDay = picked.value
      void nextTick(() => {
        if (picked.value > 0 && dayRoot.value !== null) {
          unhold = holdDialog(dayRoot.value, restoreCell)
        }
      })
      return
    }
    unhold?.()
    unhold = null
  },
  { flush: 'post' },
)

/** Живая ячейка открытого дня; null — ячейка ушла из сетки. */
function restoreCell(): HTMLElement | null {
  const at = cells.value.find((cell) => cell.day === openDay)?.at
  if (at === undefined) return null
  return document.querySelector<HTMLElement>(`.am-act__cell[data-at="${at}"]`)
}

/** Добывает подписи тайтлов дня: после перезахода кэши пусты, и без этого в чипсах стояло бы «Без
 * названия». Найденное ложится в журнал намертво — следующий заход возьмёт имена из самого события. */
async function raiseTitles(day: number): Promise<void> {
  const ids = [...new Set(activityOf(day).map((event) => event.mediaId))].filter(
    (mediaId) => freshTitle(mediaId) === '',
  )

  if (ids.length > 0) {
    try {
      // Облики нужны ради латиницы: у тайтла без русского перевода имя осталось бы пустым.
      await Promise.all([warmLooks(ids), prefetchRussianNames(ids)])
    } catch (e) {
      // Отказ сети не беда: подпись дозаполнится в другой заход, а имя уже записанное — на месте.
      Logger('WARN', 'Активность: подписи тайтлов не добылись', e)
    }

    fillActivityTitles(freshTitle)
  }

  // Кэши имён живут вне реактивности Vue: без счётчика блоки дня остались бы прежними.
  titleStamp.value += 1
}

/** Клик по тайтлу ведёт в его карточку: из дня активности это самый вероятный следующий шаг. */
function openMedia(mediaId: number): void {
  closeDay()
  navigate('media', { id: String(mediaId) })
}

/** Стрелки по сетке: без них с клавиатуры до квадрата не дойти, а их там 371 штука. */
function onKey(event: KeyboardEvent): void {
  // Escape закрывает модалку дня: мышью её закрывают крестиком и щелчком мимо, а клавиатуре вернуться к сетке иначе нечем.
  if (event.key === 'Escape' && picked.value > 0) {
    closeDay()
    return
  }

  const step = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[event.key]
  if (step === undefined) return

  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !active.classList.contains('am-act__cell')) return

  const at = Number(active.dataset.at)
  if (!Number.isFinite(at)) return

  const next = cells.value[at + step]
  if (next === undefined) return

  event.preventDefault()
  document.querySelector<HTMLButtonElement>(`.am-act__cell[data-at="${next.at}"]`)?.focus()
}

let stopWatching: (() => void) | null = null

onMounted(() => {
  redraw()
  void scrollToAnchor()

  // Журнал лежит в хранилище: до его чтения сетка была бы пустой неправдой, и мигнула бы у всех.
  void whenActivityReady().then(() => {
    ready.value = true
    redraw()
    void scrollToAnchor()
  })
  stopWatching = watchActivity(() => {
    // Первое дело нового года переводит сетку на него само — год на месте, а не уехавший.
    followYear()
    redraw()

    // Журнал мог пополниться, а модалка дня в этот миг открыта: её блоки строятся по событиям, и без счётчика они остались бы прежними.
    if (picked.value > 0) titleStamp.value += 1
  })
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  stopWatching?.()
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResize)
  unhold?.()
  unhold = null
})
</script>

<template>
  <section class="am-act" :class="{ 'am-act--bare': props.bare }">
    <!--
      Сетка: семь строк дней и колонки недель — 52 или 53, смотря какой год. Раскладка как у
      вклада, тона и подписи наши, а пустые дни остаются видимыми: тишина тоже часть года.
      Ширину колонки задаёт доска, а не квадрат: год обязан влезать в отведённое место целиком,
      иначе доска получает прокрутку и декабрь с подписью над ним уезжает за правый край.
    -->
    <div
      ref="board"
      class="am-act__board"
      :style="{ '--am-act-cols': columns }"
      :aria-busy="!ready"
    >
      <!-- Месяцы стоят над своими колонками: подпись приходит к той неделе, с которой месяц
           начался, а не к левому краю доски. -->
      <div class="am-act__head">
        <span class="am-act__corner" aria-hidden="true" />

        <div class="am-act__months" aria-hidden="true">
          <span
            v-for="month in months"
            :key="month.at"
            class="am-act__month"
            :style="{ gridColumnStart: month.at + 1 }"
          >
            {{ month.label }}
          </span>
        </div>
      </div>

      <div class="am-act__wrap">
        <div class="am-act__weekdays" aria-hidden="true">
          <span
            v-for="day in weekdays"
            :key="day.at"
            class="am-act__weekday"
            :style="{ gridRowStart: day.at + 1 }"
          >
            {{ day.label }}
          </span>
        </div>

        <div class="am-act__grid" role="group" :aria-label="gridLabel">
          <button
            v-for="cell in cells"
            :key="cell.day"
            v-tip="
              cell.outside
                ? dayText(cell.day)
                : `${dayText(cell.day)} — ${activityFacts(cell.count)}`
            "
            class="am-act__cell"
            :class="{
              'am-act__cell--future': cell.future,
              'am-act__cell--outside': cell.outside,
              'am-act__cell--today': cell.today,
              'am-act__cell--on': cell.day === picked,
            }"
            type="button"
            :data-at="cell.at"
            :data-level="cell.level"
            :disabled="cell.future || cell.outside"
            :aria-label="
              cell.outside
                ? dayText(cell.day)
                : `${dayText(cell.day)}: ${activityFacts(cell.count)}`
            "
            :aria-pressed="cell.day === picked"
            @click="pick(cell.day, cell.future || cell.outside)"
          />
        </div>
      </div>
    </div>

    <!--
      Переключатели лет по краям сетки. Появляются только там, где в соседнем году есть хоть одно
      дело: пустой год смотреть нечего, а кнопка рядом с пустотой читалась бы как «там что-то
      есть». Года на самой полосе нет — он назван в подписи каждой клетки и в шапке модалки дня.
      Полоски с годами без единой стрелки тоже нет: пустая строка под сеткой ничего не говорит.
    -->
    <div v-if="yearStep.prev || yearStep.next" class="am-act__years">
      <button
        v-if="yearStep.prev"
        v-tip="`${shown - 1} год`"
        class="am-act__year"
        type="button"
        :aria-label="`Предыдущий год, ${shown - 1}`"
        @click="pickYear(shown - 1)"
      >
        ←
      </button>

      <button
        v-if="yearStep.next"
        v-tip="`${shown + 1} год`"
        class="am-act__year"
        type="button"
        :aria-label="`Следующий год, ${shown + 1}`"
        @click="pickYear(shown + 1)"
      >
        →
      </button>
    </div>

    <!--
      День — модалкой поверх всего: панель на месте сетки закрывала год, и читать его дальше было
      нельзя. Перенос в body не украшение: плашка приветствия размыта фильтром, а фильтр делает
      из предка опору для fixed — без переноса модалка мерилась бы от плашки, а не от окна.
      Закрывается крестиком, щелчком мимо и клавишей Escape.
    -->
    <Teleport to="body">
      <Transition name="am-sheet">
        <div
          v-if="picked > 0"
          ref="dayRoot"
          class="am-sheet am-sheet--veil"
          role="dialog"
          aria-modal="true"
          aria-label="День активности"
          @click.self="closeDay"
        >
          <div class="am-sheet__box">
            <header class="am-sheet__top">
              <div class="am-sheet__text">
                <span class="am-sheet__kicker">{{ activityFacts(openedCell?.count ?? 0) }}</span>
                <h3 class="am-sheet__name">
                  {{ openedCell === undefined ? '' : dayText(openedCell.day) }}
                </h3>
              </div>

              <button
                class="am-sheet__close"
                type="button"
                aria-label="Закрыть день"
                @click="closeDay"
              >
                <SakuraBloom />
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div class="am-sheet__body">
              <!-- Один тайтл — один блок: закладка, серия, оценка и заметка одной истории стоят
                 вместе, сколько бы часов между ними ни прошло. -->
              <article v-for="group in groups" :key="group.mediaId" class="am-day__title">
                <header class="am-day__head">
                  <button class="am-day__name" type="button" @click="openMedia(group.mediaId)">
                    {{ titleOf(group) }}
                  </button>
                  <span class="am-day__count">{{ activityFacts(group.acts.length) }}</span>
                </header>

                <ol class="am-day__acts">
                  <li v-for="act in group.acts" :key="act.key" class="am-day__act">
                    <span class="am-day__time">{{ hourText(act.at) }}</span>
                    <span class="am-day__words">{{ actWords(act, group) }}</span>
                  </li>
                </ol>
              </article>

              <p v-if="groups.length === 0" class="am-day__empty">
                В этот день ничего не записано.
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.am-act {
  /* Относительное положение нужно клеткам: под курсором они приподнимаются слоем выше соседей.
     День раскрывается модалкой в body, и к сетке это уже не относится. */
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px 14px 14px;
  background: var(--am-glass);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-xl);
  box-shadow: inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur)) saturate(1.4);
}

/*
 * Внутри плашки приветствия. Не карточка в карточке, а лунка: сквозь просвет стекла с крупной розеткой квадраты
 * тонули в лепестках. Отсюда плотная подложка и ни одной своей тени, ширина — от года (max-content).
 */
.am-act--bare {
  /* Правый край плашки: год прижат вправо, и под ним — подпись с переключателями. По умолчанию
     flex-элемент растянулся бы или встал влево, а год уезжал от края, к которому привык глаз. */
  align-self: flex-end;
  width: max-content;
  max-width: 100%;
  padding: 10px 12px 12px;
  background: color-mix(in srgb, var(--am-panel) 92%, transparent);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
  box-shadow: inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(6px);
}

/*
 * Доска задаёт зазоры, размер клетки и ширину левого столбца. Клетка задана пикселями, а не долей: доля
 * привязала бы сетку к ширине полосы, и год то сжимался бы в крапины, то рос в плиты.
 */
.am-act__board {
  --am-act-gap: 3px;
  --am-act-cell: 16px;
  /* Столбец дней недели. Он же — отступ подписей месяцев: подпись обязана стоять над своей
     колонкой, а не над левым краем доски. */
  --am-act-gutter: 26px;

  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /* Низ сетки срезался границей лунки: доска заканчивается ниже последнего ряда. */
  padding-bottom: 4px;
}

.am-act__head,
.am-act__wrap {
  display: flex;
  gap: var(--am-act-gap);
  min-width: 0;
}

/* Пустое место над днями недели: без него подписи месяцев съехали бы на ширину левого столбца. */
.am-act__corner,
.am-act__weekdays {
  flex: none;
  width: var(--am-act-gutter);
}

/*
 * Месяцы и квадраты — две сетки с одной раскладкой колонок: подписи обязаны ехать над своими колонками, а не
 * растягиваться по остатку полосы. Ширина — от клетки, обе max-content: подписи и квадраты уезжают вместе.
 */
.am-act__months,
.am-act__grid {
  display: grid;
  flex: none;
  grid-template-columns: repeat(var(--am-act-cols, 53), var(--am-act-cell));
  gap: var(--am-act-gap);
}

.am-act__months {
  font-size: 11.5px;
  color: var(--am-dim);
}

/*
 * Подпись стоит в своей колонке и не обрезается: прежде ширина ограничивалась зоной месяца, и узкому месяцу
 * доставалось «се» вместо «сен». Наехать друг на друга подписи не могут: месяц занимает не меньше четырёх колонок.
 */
.am-act__month {
  grid-row: 1;
  white-space: nowrap;
}

/* Дни недели поделены теми же пикселями, что и строки сетки: подпись «ср» обязана встать
   против среды, а не против третьей по счёту клетки. */
.am-act__weekdays {
  display: grid;
  grid-template-rows: repeat(7, var(--am-act-cell));
  gap: var(--am-act-gap);
  font-size: 10.5px;
  color: var(--am-faint);
}

.am-act__weekday {
  display: flex;
  align-items: center;
  justify-content: end;
  padding-right: 2px;
}

/*
 * Строки заданы той же клеткой, что и колонки: год — семь рядов одинаковых квадратов. line-height: 0 гасит
 * собственную высоту кнопки, иначе пустая кнопка тянула ряд выше квадрата и ряды разъезжались по вертикали.
 */
.am-act__grid {
  position: relative;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, var(--am-act-cell));
}

.am-act__cell {
  align-self: start;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  line-height: 0;
  cursor: pointer;
  background: var(--am-fill-2);
  border: 1px solid transparent;
  border-radius: 22%;
  transition:
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease),
    transform var(--am-fast) var(--am-ease);
}

/* Тона — четыре ступени одного акцента. Первые две плотнее привычных витринных: год стоит на
   плашке приветствия, и на прежних долях просвета пустой день было не отличить от тихого.
   Порядок в приложении держит насыщенность, а не цвет: зелёный и красный не занимаем — там они
   значат «хорошо» и «плохо», а активность не бывает ни тем, ни другим. */
.am-act__cell[data-level='1'] {
  background: rgb(var(--am-accent-rgb) / 0.42);
}
.am-act__cell[data-level='2'] {
  background: rgb(var(--am-accent-rgb) / 0.62);
}
.am-act__cell[data-level='3'] {
  background: rgb(var(--am-accent-rgb) / 0.84);
}
.am-act__cell[data-level='4'] {
  background: var(--am-accent);
}

/* Квадрат под курсором приподнимается: в поле из семисот клеток иначе не видно, на что наводишь. */
.am-act__cell:hover:not(:disabled) {
  z-index: 2;
  border-color: var(--am-text);
  transform: scale(1.3);
}

/* Сегодняшний обводим, а не красим: иначе в плотной сетке его не отличить от соседних. */
.am-act__cell--today {
  box-shadow: 0 0 0 1px var(--am-accent);
}

/* Раскрытый держим заливкой сакуры: рамка в клетке размером с булавочную головку не видна. */
.am-act__cell--on {
  z-index: 2;
  background: var(--am-sakura);
  border-color: var(--am-sakura);
  box-shadow: 0 0 6px rgb(var(--am-sakura-rgb) / 0.6);
}

/* Приподнимание упирается в край доски: доска прокручивается вбок и держит низ заслонённым,
   и без этого нижний ряд и правая колонка срезались бы при наведении. Растут они внутрь себя —
   вверх и влево, в зазор между клетками; чужих рядов касание не задевает. */
.am-act__cell:nth-child(7n + 7) {
  transform-origin: center bottom;
}

.am-act__cell:nth-last-child(-n + 7) {
  transform-origin: center right;
}

.am-act__cell:nth-child(7n + 7):nth-last-child(-n + 7) {
  transform-origin: right bottom;
}

.am-act__cell--future {
  cursor: default;
  background: transparent;
  border-color: var(--am-line-soft);
  opacity: 0.35;
}

/* Чужие дни в краях сетки — слоты без следа: колонка с 1 января идёт из декабря, и обводка на
   этих днях читалась бы как «здесь что-то было». Пустая рамка и ничего больше. */
.am-act__cell--outside {
  cursor: default;
  background: transparent;
  border-color: transparent;
  box-shadow: inset 0 0 0 1px var(--am-line-soft);
  opacity: 0.4;
}

/*
 * Переключатели лет по краям сетки. Полоса прижата вправо — по тому же краю, что и год. Полоски без стрелок
 * нет: такую полосу и рисовать незачем.
 */
.am-act__years {
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 7px;
}

.am-act__year {
  display: grid;
  flex: none;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease);
}

.am-act__year:hover,
.am-act__year:focus-visible {
  color: var(--am-text);
  background: var(--am-hover);
}

/*
 * Модалка дня: затемнение на всё окно и стеклянная коробка по центру. Образец — `.am-sheet` из EntrySheet:
 * окна обязаны читаться одним семейством. Затемнение берёт и размытие заднего плана.
 */
.am-sheet {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 40px);
  background: var(--am-veil);
  backdrop-filter: blur(8px);
  animation: am-veil-in var(--am-mid) var(--am-ease-soft) both;
}

/* Коробка двумя этажами: шапка стоит, прокручивается только середина — иначе крестик уезжал бы. */
.am-sheet__box {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 620px;
  max-height: min(84vh, 820px);
  padding: clamp(18px, 2.2vw, 28px);
  overflow: hidden;
  background: linear-gradient(165deg, var(--am-glass-2), var(--am-glass));
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-xl);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur-strong)) saturate(1.5);
  animation: am-sheet-in var(--am-mid) var(--am-ease) both;
}

@keyframes am-veil-in {
  from {
    opacity: 0;
  }
}

@keyframes am-sheet-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
}

.am-sheet__top {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.am-sheet__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.am-sheet__kicker {
  font-size: 12px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

.am-sheet__name {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.22;
  color: var(--am-text);
}

/* Цель нажатия 44px; круг и сакуру рисует вложенный слой, а кнопка остаётся
   прямоугольной ради цели и кольца фокуса. Оттенки цветка — от --am-hover. */
.am-sheet__close {
  --am-bloom-deep: var(--am-bloom-base);
  --am-bloom-petal: color-mix(in srgb, var(--am-sakura) 30%, var(--am-bloom-base));
  --am-bloom-shade: var(--am-sh-1);

  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: var(--am-touch);
  height: var(--am-touch);
  margin-left: auto;
  padding: 0;
  font: inherit;
  font-size: 22px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-sheet__close:hover,
.am-sheet__close:focus-visible {
  color: var(--am-text);
}

/* Знак поднят над цветком: тот лежит своим слоем, а по правилам рисования
   слой накрывает обычное содержимое. Центровку держит place-items родителя. */
.am-sheet__close > span {
  position: relative;
  display: block;
  transition: transform var(--am-fast) var(--am-ease);
}

.am-sheet__close:hover > span,
.am-sheet__close:focus-visible > span {
  transform: translateY(-1px);
}

.am-sheet__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
  overflow-y: auto;
}

/* Блок тайтла: лунка на стекле модалки, как поля в окне правки. Блоки разведены отступами,
   а не чертой: день состоит из тайтлов, и лунка читается карточкой внутри дня. */
.am-day__title {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 14px;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
}

.am-day__head {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

/* Имя — кнопка: из дня активности человек идёт в карточку тайтла. Перенос разрешён: длинные имена
   у AniList обычное дело, а обрезанное имя не читается — прежний чип резал его многоточием. */
.am-day__name {
  min-width: 0;
  padding: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--am-text);
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-day__name:hover,
.am-day__name:focus-visible {
  color: var(--am-sakura);
}

.am-day__count {
  flex: none;
  margin-left: auto;
  font-size: 12px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

/* Дела столбцом по часам: время слева, слова чипом справа. */
.am-day__acts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.am-day__act {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.am-day__time {
  flex: none;
  width: 40px;
  font-size: 11.5px;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

.am-day__words {
  min-width: 0;
  padding: 3px 9px;
  font-size: 12.5px;
  color: var(--am-text);
  background: var(--am-hover);
  border-radius: var(--am-r-cap);
}

.am-day__empty {
  margin: 0;
  font-size: 13px;
  color: var(--am-dim);
}

/* На узком окне модалка встаёт на весь экран снизу: по центру она оставляла бы полосы пустоты. */
@media (max-width: 640px) {
  .am-sheet {
    align-items: flex-end;
    padding: 0;
  }

  .am-sheet__box {
    width: 100%;
    max-height: 92vh;
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .am-sheet,
  .am-sheet__box {
    animation: none;
  }

  .am-sheet__close:hover > span,
  .am-sheet__close:focus-visible > span {
    transform: none;
  }
}
</style>
