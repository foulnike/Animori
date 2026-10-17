<script setup lang="ts">
// Поле даты ручным вводом: ДД/ММ/ГГГГ одной строкой. Календарь раскрывался ввысь и выталкивал окно за кадр, а маска занимает ровно одну строку; «Сегодня» закрывает самый частый случай.
import { computed, ref, watch } from 'vue'

import { dateCaret, dateDigits, maskDate, maskOf, stampDate } from '../date-text'

/** Границы года — те же, что у календаря: раньше аниме по телевизору не показывали. */
const YEAR_MIN = 1940

/** Запас вперёд: сезон объявляют заранее, но дата правки — не прогноз на десятилетие. */
const YEAR_AHEAD = 2

/** Месяцы для подписи выбранного: родительный, «14 мая 2025». */
const MONTHS_OF: ReadonlyArray<string> = [
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
]

/** Как просим набирать: подсказка в пустом поле и в ошибке одна и та же. */
const SHAPE = 'ДД/ММ/ГГГГ'

const props = defineProps<{
  /** ГГГГ-ММ-ДД. Пустая строка и null значат «дата не стоит». */
  value: string | null
  /** Имя поля: уходит в подпись для чтецов с экрана. */
  title: string
}>()

const emit = defineEmits<{
  (e: 'pick', value: string): void
}>()

/** Набранное. Держится маской, а не ГГГГ-ММ-ДД: человек видит и правит ДД/ММ/ГГГГ. */
const text = ref(maskOf(props.value))

/** Причина, по которой подпись стала красной. Пусто — нареканий нет. */
const wrong = ref('')

function yearMax(): number {
  return new Date().getFullYear() + YEAR_AHEAD
}

/** Наружу уходит готовая дата; пустое поле — пустая строка, так договорены со списком.
 *  Недобранное молчит: его ещё набирают, и черновик не должен мигать чужими значениями. */
function send(): void {
  if (dateDigits(text.value).length === 0) {
    if ((props.value ?? '') !== '') emit('pick', '')
    return
  }

  const iso = stampDate(text.value, YEAR_MIN, yearMax())
  if (iso !== null && iso !== props.value) emit('pick', iso)
}

function onType(event: Event): void {
  const el = event.target
  if (!(el instanceof HTMLInputElement)) return

  // Сколько цифр стояло до каретки, столько должно остаться после пересборки: иначе правка в середине строки уезжала бы в конец и ломала соседние числа.
  const before = dateDigits(el.value.slice(0, el.selectionStart ?? 0)).length
  const shown = maskDate(el.value)

  text.value = shown
  if (el.value !== shown) el.value = shown

  const caret = dateCaret(shown, before)
  el.setSelectionRange(caret, caret)

  wrong.value = ''
  send()
}

/** Потеря фокуса: неполное остаётся набранным — стирать чужой труд нечего, — но подпись
 *  говорит, чего не хватает, и наружу такое значение не уходит. */
function check(): void {
  const digits = dateDigits(text.value)
  if (digits.length === 0) {
    wrong.value = ''
    return
  }

  if (stampDate(text.value, YEAR_MIN, yearMax()) !== null) {
    wrong.value = ''
    return
  }

  wrong.value = digits.length < 8 ? `Наберите все восемь цифр: ${SHAPE}` : 'Такого дня нет'
}

function set(iso: string): void {
  text.value = maskOf(iso)
  wrong.value = ''
  if ((props.value ?? '') !== iso) emit('pick', iso)
}

/** Сегодняшний день: на пудле это одно нажатие против восьми цифр с экранной клавиатуры. */
function today(): void {
  const now = new Date()
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value))
  set(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
}

function wipe(): void {
  set('')
}

/** Подпись словами читает сохранённое значение, а не набранное: это и есть то, что уйдёт в список. */
const label = computed(() => {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(props.value ?? '')
  if (hit === null) return 'Не указана'

  const month = Number(hit[2]) - 1
  return `${Number(hit[3])} ${MONTHS_OF[month] ?? ''} ${hit[1]}`
})

// Значение сверху могло измениться мимо поля — «сегодня» по достижению потолка счёта или обновление списка: набранное подхватываем только если оно разошлось.
watch(
  () => props.value,
  (fresh) => {
    const shown = maskOf(fresh)
    if (shown !== text.value) text.value = shown
    if (wrong.value !== '') check()
  },
)
</script>

<template>
  <div class="am-date">
    <div class="am-date__field">
      <svg class="am-date__mark" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.6" y="3.2" width="12.8" height="11.2" rx="2.6" />
        <path d="M1.6 6.9h12.8" />
        <path d="M5.2 1.6v3.1" />
        <path d="M10.8 1.6v3.1" />
      </svg>

      <input
        class="am-input am-date__input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :placeholder="SHAPE"
        :value="text"
        :aria-label="`${title}: ${label}`"
        @input="onType"
        @blur="check"
        @keydown.enter="check"
      />
    </div>

    <div class="am-date__acts">
      <button class="am-btn am-btn--ghost am-date__today" type="button" @click="today">
        Сегодня
      </button>

      <button
        class="am-btn am-btn--ghost am-date__wipe"
        type="button"
        aria-label="Стереть дату"
        @click="wipe"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <span class="am-date__label" :class="{ 'am-date__label--bad': wrong !== '' }">
      {{ wrong !== '' ? wrong : label }}
    </span>
  </div>
</template>

<style scoped>
/* Две строки: поле с кнопками и подпись под ними. Высота постоянная — окно правки меряет себя
   по кадру, и подпись, которая меняет размер, дёргала бы ужатие на каждом наборе. */
.am-date {
  display: grid;
  grid-template-areas:
    'field acts'
    'label label';
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 8px;
  align-items: center;
}

.am-date__field {
  position: relative;
  grid-area: field;
  min-width: 0;
}

/* Знак календаря, знакомый по прежнему полю: он гаснет, пока поле пусто, и загорается акцентом
   под курсором. Слой лежит под вводом и щелчков не перехватывает. */
.am-date__mark {
  position: absolute;
  top: 50%;
  left: 13px;
  width: 15px;
  height: 15px;
  color: var(--am-faint);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  pointer-events: none;
  transform: translateY(-50%);
  transition: color var(--am-fast) var(--am-ease);
}

.am-date__field:focus-within .am-date__mark {
  color: var(--am-accent);
}

/* Цифры набираются, а не читаются: крупный кегль, разрядка и табличная ширина держат косые
   черты на месте, пока номер меняется. */
.am-date__input {
  min-height: var(--am-touch);
  padding-left: 37px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}

.am-date__acts {
  display: flex;
  grid-area: acts;
  gap: 6px;
}

/* Кнопки ростом с поле: цель нажатия одна на всю строку, и кромка фокуса не меряет высоту
   поля и кнопок по-разному. */
.am-date__today,
.am-date__wipe {
  min-height: var(--am-touch);
}

.am-date__today {
  padding: 0 12px;
  font-size: 13px;
}

.am-date__wipe {
  width: var(--am-touch);
  padding: 0;
  font-size: 18px;
  line-height: 1;
}

.am-date__label {
  grid-area: label;
  min-height: 14px;
  font-size: 11.5px;
  line-height: 1.25;
  letter-spacing: 0.04em;
  color: var(--am-faint);
  font-variant-numeric: tabular-nums;
}

/* Ошибка набора — та же подпись, но красная: слово объясняет, цифры на месте. */
.am-date__label--bad {
  color: var(--am-bad);
}
</style>
