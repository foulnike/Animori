<script setup lang="ts">
// Окно правки записи. Держит черновик, наружу — «Готово». Окно телепортируется в body: fixed мерился бы от предка. Потолок счёта у онгоинга — вышедшее, а не итог.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'
import { partsWord, statusList, statusWord } from '../labels'
import { isWeakPlatform } from '../platform'

import DateField from './DateField.vue'
import SakuraBloom from './SakuraBloom.vue'
import StarBloom from './StarBloom.vue'

/** Шаг оценки. Десятибалльная шкала у AniList дробная, половины достаточно. */
const SCORE_STEP = 0.5

/** Сколько кнопка «Готово» держит подтверждение, прежде чем закрыть шторку. */
const SAVE_HOLD = 900

/** Сколько держится взведённая кнопка удаления, прежде чем разоружится: нажатие с пульта легко
 * задеть,
 *  а убрать запись вместе с заметкой и оценкой — необратимо. */
const REMOVE_ARM_MS = 5000

/** Быстрые оценки одним нажатием: целые баллы шкалы. */
const QUICK_MARKS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** Крайние тона шкалы оценок: единица красная, десятка зелёная. */
const MARK_TONE_MAX = 132

/** Телевизор: окно собирается теснее, чтобы запись вставала в кадр целиком. */
const lite = isWeakPlatform()

const props = defineProps<{
  title: string
  status: string
  score10: number
  progress: number
  partsTotal: number | null
  /** Идёт ли показ: у онгоинга потолок счёта — вышедшее, а не итог истории. */
  ongoing?: boolean
  repeat: number
  startedAt: string | null
  completedAt: string | null
  notes: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'status', value: string): void
  (e: 'score', value: number): void
  (e: 'progress', value: number): void
  (e: 'repeat', value: number): void
  (e: 'startedAt', value: string): void
  (e: 'completedAt', value: string): void
  (e: 'notes', value: string): void
  (e: 'remove'): void
}>()

const statuses = statusList()
const partsName = partsWord()

// Черновик записи: правится только он, наружу уходит по «Готово». Даты держатся строкой, а не string | null: пустая строка у DateField — законный ответ «даты нет».
const pickStatus = ref(props.status)
const pickScore = ref(props.score10)
const pickProgress = ref(props.progress)
const pickRepeat = ref(props.repeat)
const pickStarted = ref(props.startedAt ?? '')
const pickCompleted = ref(props.completedAt ?? '')

const nowStatus = computed(() => statusWord(pickStatus.value === '' ? null : pickStatus.value))

/** Строка счёта вида «7 из 12». Неизвестный итог не выдумывается. */
const partsText = computed(() =>
  props.partsTotal === null
    ? String(pickProgress.value)
    : `${pickProgress.value} из ${props.partsTotal}`,
)

/** Подпись прыжка к потолку: у онгоинга это край вышедшего, а не конец. */
const endHint = computed(() => (props.ongoing === true ? 'До вышедшего' : 'До конца'))

const donePart = computed(() => {
  const total = props.partsTotal
  if (total === null || total <= 0) return pickStatus.value === 'COMPLETED' ? '100%' : '0%'

  const part = Math.min(1, Math.max(0, pickProgress.value / total))
  return `${Math.round(part * 100)}%`
})

/** Черновик комментария: уходит наружу вместе со всем остальным по «Готово». */
const draft = ref(props.notes ?? '')
let lastSent = props.notes ?? ''

const saved = ref(false)
let hold: number | null = null

/** Убрать взведено: второе нажатие убирает запись, первое только спрашивает. */
const removing = ref(false)
let armTimer = 0

// Значение сверху могло измениться: подхватываем, но не затираем набранное.
watch(
  () => props.notes,
  (fresh) => {
    const known = fresh ?? ''
    if (draft.value.trim() === lastSent) draft.value = known
    lastSent = known
  },
)

function markText(value: number): string {
  return value > 0 ? value.toFixed(1) : '—'
}

/** Цвет балла: тон идёт от красного к зелёному по шкале. Считается на месте,
 * чтобы не держать в стилях десять почти одинаковых правил. */
function markStyle(mark: number): Record<string, string> {
  const tone = Math.round(((mark - 1) / (QUICK_MARKS.length - 1)) * MARK_TONE_MAX)

  return {
    '--am-mark': `hsl(${tone} 64% 46%)`,
    '--am-mark-deep': `hsl(${tone} 68% 34%)`,
  }
}

/** Оценка шагом шкалы, с обрезкой по краям: шкала списка — от 0 до 10. */
function bumpScore(delta: number): void {
  const next = Math.round((pickScore.value + delta) / SCORE_STEP) * SCORE_STEP
  pickScore.value = Math.min(10, Math.max(0, Math.round(next * 10) / 10))
}

function setScore(value: number): void {
  pickScore.value = value
}

/** Закладка и дата конца по достижении потолка счёта. Дату ставим только когда
 *  её нет: чужую отметку затирать нельзя. */
function finishParts(): void {
  if (props.ongoing === true) return
  if (pickStatus.value !== 'COMPLETED') pickStatus.value = 'COMPLETED'
  if (pickCompleted.value === '') pickCompleted.value = today()
}

/** Счёт серий шагом. Выше известного итога не пускаем: больше, чем есть, не посмотришь. */
function bumpProgress(delta: number): void {
  const total = props.partsTotal
  const next = pickProgress.value + delta
  pickProgress.value = Math.max(0, total === null ? next : Math.min(total, next))

  if (total !== null && pickProgress.value >= total) finishParts()
}

/** Прыжок к началу счёта. Закладку не трогает: ноль серий — это не «брошено». */
function resetParts(): void {
  pickProgress.value = 0
}

/** Прыжок к потолку: счёт до края и закладка вслед. Закладка ставится и когда
 * счёт уже на потолке: нажатие на ⇥ — это и есть просьба закончить. */
function fillParts(): void {
  const total = props.partsTotal
  if (total === null) return

  pickProgress.value = total
  finishParts()
}

/** Пересмотры. Потолка у них нет, а ниже нуля уходить бессмысленно. */
function bumpRepeat(delta: number): void {
  pickRepeat.value = Math.max(0, pickRepeat.value + delta)
}

/** Сегодняшний день в виде ГГГГ-ММ-ДД. Через метку времени день съезжал бы. */
function today(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value))
  return `${now.getFullYear()}-${pad(month)}-${pad(day)}`
}

function onStarted(value: string): void {
  pickStarted.value = value
}

function onCompleted(value: string): void {
  pickCompleted.value = value
}

function hasEdits(): boolean {
  return (
    pickStatus.value !== props.status ||
    pickScore.value !== props.score10 ||
    pickProgress.value !== props.progress ||
    pickRepeat.value !== props.repeat ||
    pickStarted.value !== (props.startedAt ?? '') ||
    pickCompleted.value !== (props.completedAt ?? '') ||
    draft.value.trim() !== lastSent
  )
}

/** Отдаёт наружу все разошедшиеся поля разом. Неизменённые не трогает: лишняя
 * правка — лишняя запись в журнал. Пустая строка в датах значит «стереть». */
function commit(): void {
  if (pickStatus.value !== props.status) emit('status', pickStatus.value)
  if (pickScore.value !== props.score10) emit('score', pickScore.value)
  if (pickProgress.value !== props.progress) emit('progress', pickProgress.value)
  if (pickRepeat.value !== props.repeat) emit('repeat', pickRepeat.value)
  if (pickStarted.value !== (props.startedAt ?? '')) emit('startedAt', pickStarted.value)
  if (pickCompleted.value !== (props.completedAt ?? '')) emit('completedAt', pickCompleted.value)

  const asked = draft.value.trim()
  if (asked === lastSent) return
  lastSent = asked
  emit('notes', asked)
}

function onDone(): void {
  // Повторное нажатие во время подтверждения: закрытие уже назначено.
  if (saved.value) return

  if (!hasEdits()) {
    emit('close')
    return
  }

  commit()
  saved.value = true
  hold = window.setTimeout(() => emit('close'), SAVE_HOLD)
}

/** Крестик, подложка и Escape: черновик выбрасывается, наружу не уходит ничего. */
function onDrop(): void {
  emit('close')
}

/** Убрать тайтл из списка. Запись исчезает целиком — из списка и из статистики, поэтому счёт
 * пересобирать вручную не нужно. Местная запись: на сервере AniList она ничего не пропадает. Черновик наружу не уходит. */
function onRemove(): void {
  // Нечего убирать, если тайтла в списке нет: кнопки при такой записи и не видно.
  if (props.status === '') return

  if (!removing.value) {
    removing.value = true

    if (armTimer !== 0) window.clearTimeout(armTimer)
    armTimer = window.setTimeout(() => {
      armTimer = 0
      removing.value = false
    }, REMOVE_ARM_MS)

    return
  }

  if (armTimer !== 0) window.clearTimeout(armTimer)
  armTimer = 0
  removing.value = false

  emit('remove')
  emit('close')
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') onDrop()
}

/** Окно обязано умещаться в кадр целиком: если запись не влезает, ужимается вся коробка, а не
 * прячет хвост  под прокрутку. Потолок из стиля здесь снимается насовсем — с ним коробка обрезала содержимое. */
const veil = ref<HTMLElement | null>(null)
const box = ref<HTMLElement | null>(null)

let fitWatch: ResizeObserver | null = null

function fitSheet(): void {
  const host = veil.value
  const el = box.value
  if (host === null || el === null) return

  el.style.maxHeight = 'none'

  const style = getComputedStyle(host)
  const room = host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  const need = el.offsetHeight
  if (room <= 0 || need <= 0) return

  // Три знака после запятой: целое ужатие коробка не дёргает, а мелочь гасит мерцание от пиксельных дробей при каждом пересчёте.
  const fit = Math.round(Math.min(1, room / need) * 1000) / 1000
  el.style.setProperty('--am-fit', String(fit))
}

// «Назад» закрывает окно: под ним карточка, ради которой его открывали. Сниматель живёт рядом со слушателем: окно убрано — шага нет.
let stopBack: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKey)
  stopBack = pushBackStop(function () {
    onDrop()
    return true
  })

  // Меряем сразу, до первого кадра, а дальше — по любому изменению размера: подложка меняется с окном и с экранной клавиатурой, коробка — с переносом длинного названия.
  fitSheet()
  if (typeof ResizeObserver !== 'undefined') {
    fitWatch = new ResizeObserver(() => fitSheet())
    if (veil.value !== null) fitWatch.observe(veil.value)
    if (box.value !== null) fitWatch.observe(box.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = null
  // Таймер держит ссылку на шторку: без снятия он дотянет до закрытия убранного окна.
  if (hold !== null) clearTimeout(hold)

  // Взвод удаления живёт на своём таймере: ушедшее окно он тревожить не должен.
  if (armTimer !== 0) window.clearTimeout(armTimer)
  armTimer = 0

  // Следитель за размером снимается вместе с окном: иначе он держит убранную коробку.
  fitWatch?.disconnect()
  fitWatch = null
})
</script>

<template>
  <!-- Перенос в body: fixed внутри экрана мерился от списка, а не от окна браузера. -->
  <Teleport to="body">
    <div
      ref="veil"
      class="am-sheet"
      :class="{ 'am-sheet--tv': lite }"
      role="dialog"
      aria-modal="true"
      aria-label="Правка записи"
      @click.self="onDrop"
    >
      <div ref="box" class="am-sheet__box">
        <header class="am-sheet__top">
          <div class="am-sheet__text">
            <span class="am-sheet__kicker">{{ nowStatus ?? 'Не в списке' }}</span>
            <h3 class="am-sheet__name">{{ title }}</h3>
          </div>

          <!-- Подпись кнопкам нужна своя: знак спрятан от чтецов, а подсказка именем кнопки
     не становится. Подпись говорит «без сохранения» — крестик выбрасывает правки. -->
          <button
            v-tip="'Закрыть без сохранения'"
            class="am-sheet__close"
            type="button"
            aria-label="Закрыть без сохранения"
            @click="onDrop"
          >
            <SakuraBloom />
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div class="am-sheet__body">
          <section class="am-field am-field--wide">
            <span class="am-field__name">Закладка</span>
            <div class="am-picks">
              <button
                v-for="item in statuses"
                :key="item.key"
                class="am-pick"
                :class="{ 'am-pick--on': item.key === pickStatus }"
                type="button"
                @click="pickStatus = item.key"
              >
                {{ item.title }}
              </button>
            </div>
          </section>

          <section class="am-field am-field--wide">
            <span class="am-field__name">Оценка</span>
            <div class="am-step-row">
              <button
                class="am-step"
                type="button"
                aria-label="Меньше"
                @click="bumpScore(-SCORE_STEP)"
              >
                <SakuraBloom />
                <span aria-hidden="true">−</span>
              </button>
              <span class="am-step__value">{{ markText(pickScore) }}</span>
              <button
                class="am-step"
                type="button"
                aria-label="Больше"
                @click="bumpScore(SCORE_STEP)"
              >
                <SakuraBloom />
                <span aria-hidden="true">+</span>
              </button>
            </div>

            <div class="am-picks am-picks--mid">
              <button
                v-for="mark in QUICK_MARKS"
                :key="mark"
                class="am-pick am-pick--num"
                :class="{ 'am-pick--on': mark === pickScore }"
                :style="markStyle(mark)"
                type="button"
                @click="setScore(mark)"
              >
                <StarBloom />
                <span>{{ mark }}</span>
              </button>
            </div>
          </section>

          <section class="am-field">
            <span class="am-field__name">{{ partsName }}</span>

            <!-- Прыжок к потолку живёт только при известном потолке: без итога кнопка-обманка хуже её отсутствия. -->
            <div class="am-step-row am-step-row--ends">
              <button class="am-step" type="button" aria-label="В начало" @click="resetParts">
                <SakuraBloom />
                <!-- Свой знак вместо глифа: системный ⇤ живёт по раскладке, а здесь нужно то же, что в прочих
     иконках — упор слева и два шеврона влево одним штрихом. -->
                <span aria-hidden="true">
                  <svg class="am-step__jump" viewBox="0 0 20 20">
                    <path d="M4 5.5v9" />
                    <path d="M17 6l-4.5 4 4.5 4" />
                    <path d="M12 6l-4.5 4 4.5 4" />
                  </svg>
                </span>
              </button>
              <button class="am-step" type="button" aria-label="Меньше" @click="bumpProgress(-1)">
                <SakuraBloom />
                <span aria-hidden="true">−</span>
              </button>
              <span class="am-step__value">{{ partsText }}</span>
              <button class="am-step" type="button" aria-label="Больше" @click="bumpProgress(1)">
                <SakuraBloom />
                <span aria-hidden="true">+</span>
              </button>
              <button
                v-if="partsTotal !== null"
                class="am-step"
                type="button"
                :aria-label="endHint"
                @click="fillParts"
              >
                <SakuraBloom />
                <!-- Тот же знак, что «В начало», зеркальный: упор справа и два шеврона вправо. -->
                <span aria-hidden="true">
                  <svg class="am-step__jump" viewBox="0 0 20 20">
                    <path d="M16 5.5v9" />
                    <path d="M3 6l4.5 4L3 14" />
                    <path d="M8 6l4.5 4L8 14" />
                  </svg>
                </span>
              </button>
            </div>

            <span class="am-line">
              <span class="am-line__fill" :style="{ width: donePart }" />
            </span>
          </section>

          <section class="am-field">
            <span class="am-field__name">Пересмотры</span>
            <div class="am-step-row">
              <button class="am-step" type="button" aria-label="Меньше" @click="bumpRepeat(-1)">
                <SakuraBloom />
                <span aria-hidden="true">−</span>
              </button>
              <span class="am-step__value">{{ pickRepeat }}</span>
              <button class="am-step" type="button" aria-label="Больше" @click="bumpRepeat(1)">
                <SakuraBloom />
                <span aria-hidden="true">+</span>
              </button>
            </div>
          </section>

          <section class="am-field">
            <span class="am-field__name">Начато</span>
            <DateField :value="pickStarted" title="Начато" @pick="onStarted" />
          </section>

          <section class="am-field">
            <span class="am-field__name">Закончено</span>
            <DateField :value="pickCompleted" title="Закончено" @pick="onCompleted" />
          </section>

          <section class="am-field am-field--wide">
            <span class="am-field__name">Комментарий</span>
            <textarea
              v-model="draft"
              class="am-input am-note"
              rows="3"
              placeholder="Личная заметка, остаётся в вашем списке"
            />
          </section>
        </div>

        <footer class="am-sheet__foot">
          <!--
            Убрать из списка: запись исчезает целиком — закладка, оценка, счёт, даты и заметка, —
            и из списка, и из статистики. Запись местная: на сервере AniList она ничего
            не пропадает, как и при удалении всего списка. В два нажатия, как очистка
            истории на своём экране: у пульта нажатие задеть легко, а отменить убранное нельзя.
            Тайтла вне списка не видно: убирать нечего.
          -->
          <button
            v-if="status !== ''"
            v-tip="removing ? 'Ещё раз — и запись уйдёт' : 'Убрать запись с этого устройства'"
            class="am-btn am-btn--ghost"
            :class="{ 'am-sheet__drop': removing }"
            type="button"
            @click="onRemove"
          >
            {{ removing ? 'Нажмите ещё раз' : 'Убрать из списка' }}
          </button>

          <span class="am-bar__gap" />

          <button
            v-tip="'Сохранить и закрыть'"
            class="am-btn"
            :class="{ 'am-btn--done': saved }"
            type="button"
            @click="onDone"
          >
            <svg v-if="saved" class="am-btn__tick" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.4 8.5 6.4 11.5 12.6 5" />
            </svg>
            {{ saved ? 'Сохранено' : 'Готово' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Окно поверх экрана: затемнение гасит всё лишнее. Живёт в body, поэтому inset
   значит «весь видимый прямоугольник окна», а не «весь длинный список». */
.am-sheet {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Отступ по высоте отдельно от ширины: кадр узкий и низкий чаще, чем широкий, и поле
     в 3vw по вертикали отбирало у записи места больше, чем нужно. */
  padding-block: clamp(12px, 2.4vh, 40px);
  padding-inline: clamp(12px, 3vw, 40px);
  background: var(--am-veil);
  backdrop-filter: blur(8px);
  animation: am-veil-in var(--am-mid) var(--am-ease-soft) both;
}

/* Стеклянная коробка тремя этажами: прокручивается только середина, иначе «Готово» уезжала вниз.
   Потолок в 90vh рос вместе с полями подложки и вылезал за кадр, поэтому потолок — высота
   подложки целиком, а ужатое по ней значение приходит сверху в --am-fit (см. fitSheet()). */
.am-sheet__box {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  width: 100%;
  max-width: 920px;
  max-height: 100%;
  padding: clamp(18px, 2.2vw, 28px);
  overflow: hidden;
  background: linear-gradient(165deg, var(--am-glass-2), var(--am-glass));
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-xl);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  backdrop-filter: blur(var(--am-blur-strong)) saturate(1.5);
  transform: scale(var(--am-fit, 1));
  transform-origin: center;
  animation: am-sheet-in var(--am-mid) var(--am-ease) both;
}

@keyframes am-veil-in {
  from {
    opacity: 0;
  }
}

/* Подъём идёт от ужатого размера: коробка входит в кадр уже той величины, какой ей
   суждено быть, и на первом кадре не вылезает за край, дожидаясь замера. */
@keyframes am-sheet-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(calc(var(--am-fit, 1) * 0.985));
  }

  to {
    opacity: 1;
    transform: scale(var(--am-fit, 1));
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
  gap: 4px;
  min-width: 0;
}

.am-sheet__kicker {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--am-accent);
  text-transform: uppercase;
}

.am-sheet__name {
  margin: 0;
  font-size: clamp(18px, 1.8vw, 24px);
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: -0.01em;
  /* Одно длинное слово не должно распирать шапку вбок: перенос лучше лишней ширины. */
  overflow-wrap: anywhere;
}

/* Цель нажатия в 44 пикселя. Круг и сакуру рисует вложенный слой, а кнопка
   остаётся прямоугольной — при ней остаются попадание и кольцо фокуса. */
.am-sheet__close {
  --am-bloom-deep: var(--am-hover);
  --am-bloom-petal: color-mix(in srgb, var(--am-sakura) 30%, var(--am-hover));
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

  /* Ничего не красит: держит круглым только кольцо :focus-visible, у которого свой outline-offset. */
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-sheet__close:hover:where(:not(.am-lite *)),
.am-sheet__close:focus-visible {
  color: var(--am-text);
}

/* Знак поднят над цветком: слой цветка накрывает обычное содержимое. Центровку держит place-items родителя. */
.am-sheet__close > span {
  position: relative;
  display: block;
  transition: transform var(--am-fast) var(--am-ease);
}

.am-sheet__close:hover:where(:not(.am-lite *)) > span,
.am-sheet__close:focus-visible > span {
  transform: translateY(-1px);
}

.am-sheet__body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding-right: 4px;
  overflow-y: auto;
}

/* Закладки, оценка и комментарий занимают всю ширину: рядов там много. */
.am-field--wide {
  grid-column: 1 / -1;
}

.am-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 15px 16px;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
}

.am-field__name {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: var(--am-faint);
  text-transform: uppercase;
}

.am-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Своя обёртка для шкалы оценок: ряд закладок остаётся прижатым влево. */
.am-picks--mid {
  justify-content: center;
}

/* Цель нажатия 44 пикселя по высоте: правило пульта и пальца заодно. */
.am-pick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--am-touch);
  padding: 0 18px;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-2);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-pick:hover:where(:not(.am-lite *)) {
  color: var(--am-text);
  background: var(--am-hover);
}

.am-pick--on {
  color: var(--am-bg);
  background: linear-gradient(135deg, var(--am-accent), var(--am-accent-2));
  border-color: transparent;
  box-shadow: var(--am-sh-ring);
}

/* Балл одет в тот же слой-цветок, что шаг у серий: в покое это круг тона балла, из него под
   курсором раскрывается звезда, а цифра лежит поверх обоих. Своей заливки у кнопки больше нет:
   с ней под звездой остаётся старый прямоугольник, а при нажатии он же меняет форму на лепесток,
   и второй силуэт торчит из-под цветка. Тон идёт от `--am-mark`: красный у единицы, зелёный у
   десяти; круг и звезда берут его по-разному, иначе слились бы друг с другом. */
.am-pick--num {
  --am-on-mark: #f7fbff;
  --am-bloom-deep: color-mix(in srgb, var(--am-mark) 42%, #0b1017);
  --am-bloom-petal: color-mix(in srgb, var(--am-mark) 72%, #0b1017);
  --am-bloom-shade: var(--am-sh-1);
  --am-bloom-veil: 0.9;

  position: relative;
  min-width: 52px;
  font-weight: 700;
  color: var(--am-on-mark);
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  opacity: 0.58;
  transition: opacity var(--am-fast) var(--am-ease);
}

/* Цифра поднята над слоем цветка: он лежит absolute, и без своего якоря знак оказался бы под
   заливкой — ровно как у знака над сакурой. */
.am-pick--num > span {
  position: relative;
}

.am-pick--num:hover:where(:not(.am-lite *)) {
  opacity: 0.88;
}

/* Нажатая кнопка не гаснет: у цветочного слоя своя яркость, и приглушённая кнопка гасила бы её. */
.am-pick--num:focus {
  opacity: 1;
}

/* Выбранный балл: полная яркость и кольцо своего тона. Кольцо нужно и под кромкой пульта —
   звезда у выбранной и просто нажатой одна, и без кольца они неразличимы. */
.am-pick--num.am-pick--on {
  color: var(--am-on-mark);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--am-mark) 45%, transparent);
  opacity: 1;
}

.am-step-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* Пять кнопок в ряду вместо трёх: при общем шаге 12 они выдавливали число счёта в две строки. */
.am-step-row--ends {
  gap: 8px;
}

/* Круг и сакура под курсором — от вложенного слоя, своей заливки у шага больше нет.
   position здесь не украшение: слой цветка стоит absolute и без якоря уехал бы к краю окна. */
.am-step {
  --am-bloom-deep: var(--am-hover);
  --am-bloom-petal: color-mix(in srgb, var(--am-sakura) 30%, var(--am-hover));
  --am-bloom-shade: var(--am-sh-1);

  position: relative;
  display: grid;
  place-items: center;
  width: var(--am-touch);
  height: var(--am-touch);
  padding: 0;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: var(--am-r-cap);
  transition: color var(--am-fast) var(--am-ease);
}

.am-step:hover:where(:not(.am-lite *)),
.am-step:focus-visible {
  color: var(--am-text);
}

/* Тот же подъём знака над цветком, что и у кнопки закрытия. */
.am-step > span {
  position: relative;
  display: block;
}

.am-step__value {
  flex: 1;
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Знак прыжка нарисован, а не набран: системный глиф живёт по раскладке и толщиной
   не совпадает ни с чем. Тот же штрих, что у прочих иконок, — 1.8 и скругления на концах. */
.am-step__jump {
  display: block;
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Заметка не круглая: скругление полей ввода на большом поле смотрится нелепо.
   Высота — ровно три строки (3 × 21 плюс поля): поле, вмещающее полторы, показывало вторую
   обрезанной, и курсор, поставленный в неё, мигал ниже текста. Кегль и интерлиньяж заданы
   числом, иначе «высота в строках» не сходится. */
.am-note {
  height: 87px;
  min-height: 87px;
  padding: 12px 14px;
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  background: var(--am-fill-2);
  border-radius: var(--am-r-m);
  resize: vertical;
}

.am-sheet__foot {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* Подтверждение: цвет и галочка, а не только слово — по одному слову не скажешь,
   изменилась кнопка или это уже другая. Зелёный из темы читается как «получилось». */
.am-btn--done {
  color: var(--am-good);
}

/* Взведённое удаление краснеет: второе нажатие необратимо, и это должно быть видно до него. */
.am-sheet__drop {
  color: var(--am-bad);
  border-color: color-mix(in srgb, var(--am-bad) 45%, transparent);
}

/* Галочка штрихом, а не заливкой: на пятнадцати пикселях залитый знак расплывается в кляксу. */
.am-btn__tick {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Узкое окно: столбец один, иначе поля сжимаются до нечитаемых. */
@media (max-width: 760px) {
  .am-sheet__body {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* ТЕЛЕВИЗОР Прокрутка тела спорит со стрелкой «вниз», поэтому запись листается
   раскладкой: окно шире и ниже, поля мельче, закладка с оценкой — вполовину. */
.am-sheet--tv {
  /* Кадр приставки — 720p чаще, чем 1080p: по высоте берём меньше, чем по ширине,
     и вся запись встаёт без ужатия. */
  padding-block: clamp(8px, 2.2vh, 32px);
  padding-inline: clamp(10px, 2.6vw, 32px);
}

.am-sheet--tv .am-sheet__box {
  gap: 10px;
  max-width: min(1120px, 94vw);
  padding: 14px;
}

.am-sheet--tv .am-sheet__body {
  gap: 8px;
}

.am-sheet--tv .am-sheet__body > .am-field--wide:nth-child(-n + 2) {
  grid-column: auto;
}

.am-sheet--tv .am-field {
  gap: 7px;
  padding: 8px 10px;
}

.am-sheet--tv .am-picks {
  gap: 4px;
}

.am-sheet--tv .am-pick {
  min-height: 36px;
  padding: 0 10px;
  font-size: 13px;
}

/* Десять баллов обязаны встать в один ряд: в половине окна шкала ложилась вторым
   рядом и выталкивала подвал за край. Десять по 36 плюс девять просветов по 4. */
.am-sheet--tv .am-pick--num {
  min-width: 36px;
  padding: 0 4px;
}

.am-sheet--tv .am-step-row {
  gap: 8px;
}

.am-sheet--tv .am-btn {
  min-height: 38px;
}

@media (prefers-reduced-motion: reduce) {
  .am-sheet,
  .am-sheet__box {
    animation: none;
  }

  .am-sheet__close:hover:where(:not(.am-lite *)) > span,
  .am-sheet__close:focus-visible > span {
    transform: none;
  }
}
</style>
