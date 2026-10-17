<script setup lang="ts">
// Окошко персонажа или автора поверх интерфейса. Слой окошка подменяем (app/person-layer.ts), поэтому загрузка висит и на смене свойства.
import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, watch } from 'vue'

import {
  fetchCharacterCard,
  fetchStaffCard,
  type CharacterCard,
  type PersonTarget,
  type StaffCard,
} from '@/api/anilist-person'
import { fetchStaffWorks, type StaffWork } from '@/api/anilist-staff-works'
import { keepAllowed } from '@/core/adult'
import { peekRussianName, prefetchRussianNames } from '@/core/media-title'
import {
  askRussianPersonFull,
  getRussianPerson,
  peekRussianPerson,
  type RussianPerson,
} from '@/core/person-title'
import { settings } from '@/core/settings'
import { Logger } from '@/utils/logger'

import { pushBackStop } from '../back-stop'
import { genderWord, langWord, occupationWord } from '../labels'
import { isWeakPlatform } from '../platform'
import { navigate } from '../router'

import RichText from './RichText.vue'
import SakuraBloom from './SakuraBloom.vue'

const props = defineProps<{ start: PersonTarget }>()
const emit = defineEmits<{ (e: 'close'): void }>()

/** Телевизор: окно собирается теснее и шире, чтобы влезало в кадр. */
const lite = isWeakPlatform()

/** По скольку работ спрашиваем названия за раз: полка редко длиннее пачки. */
const WORK_CHUNK = 10

/** Раздел карточки. На телевизоре каждому нужна вся площадь окна, поэтому разделы не стоят
 *  друг под другом, а меняют друг друга. */
type Tab = 'desc' | 'works' | 'voices'

const TAB_WORDS: Record<Tab, string> = { desc: 'Описание', works: 'Работы', voices: 'Голоса' }

type VoiceActor = NonNullable<CharacterCard['media']>['edges'][number]['voiceActors'][number]

/** Кто показан сейчас: из окна персонажа можно шагнуть в карточку сэйю. */
const current = ref<PersonTarget>(props.start)

/** Цепочка «персонаж → сэйю» для кнопки «Назад» внутри окна. */
const history: PersonTarget[] = []

/** Глубина цепочки реактивно: шаблон читает только её. */
const depth = ref(0)

const charCard = ref<CharacterCard | null>(null)
const staffCard = ref<StaffCard | null>(null)
const busy = ref(true)

/** Выбранный раздел. Его может не оказаться у этого человека — тогда показывается первый наличный. */
const tab = ref<Tab>('desc')

/** Карточка не доехала: сервер не ответил ни на повтор. Прежде это выглядело как
 * «карточки нет», и помочь могла только перезагрузка окна. */
const cardFailed = ref(false)

/** Русский источник спрошен, ответа ещё нет. Пока правды нет, английское
 * описание не показывается: иначе текст меняется на глазах. */
const ruWait = ref(false)

/** Русский источник не ответил: повтор возможен кнопкой. */
const ruFailed = ref(false)

/** Главные работы автора: полка постеров под описанием. */
const works = ref<StaffWork[]>([])

/** Русские названия работ по номерам тайтлов: подставляются по готовности. */
const ruWorks = shallowReactive(new Map<number, string>())

/** Коробка окна: при переходе к сэйю её прокрутка возвращается наверх. */
const box = ref<HTMLElement | null>(null)

/** Русская карточка человека: имя и описание. */
const ruPerson = ref<RussianPerson | null>(null)

/** Русские имена сэйю по их номерам: подставляются по готовности. */
const ruVoices = shallowReactive(new Map<number, string>())

/** Окно на экране: закрытое окно очередь не продолжает. */
let alive = true

/** Номер показа: ответ на прежнего человека приходит уже не к месту. */
let run = 0

/** Разрешён ли русский проход для этого человека настройками. */
function translateAllowed(): boolean {
  return current.value.kind === 'character' ? settings.translateCharacters : settings.translateStaff
}

/** Описание из загруженных данных: русское важнее английского. Пока русский источник
 *  не ответил, чужой текст не показывается — иначе он приедет и подменится. */
function rawDesc(): string {
  if (ruWait.value) return ''
  if (ruPerson.value?.description) return ruPerson.value.description
  return (
    (current.value.kind === 'character'
      ? charCard.value?.description
      : staffCard.value?.description) ?? ''
  )
}

/** Разделы, которые есть у этого человека. Данные приезжают не разом: русское описание
 *  приходит позже карточки, работы — своим доходом. */
const tabs = computed<Tab[]>(() => {
  const out: Tab[] = []
  if (rawDesc() !== '') out.push('desc')
  if (current.value.kind === 'staff' && shownWorks().length > 0) out.push('works')
  if (current.value.kind === 'character' && voiceActors().length > 0) out.push('voices')
  return out
})

/** Откуда взят текст под описанием. На приставке это только название: адрес открывать нечем,
 *  а подчёркнутая подпись, которая ничего не делает, читается как поломка. Пустая строка —
 *  строка молчит: описание могло прийти с AniList, и тогда указывать не на что. */
const descSource = computed<string>(() => {
  const text = ruPerson.value?.description?.trim() ?? ''
  return text === '' ? '' : 'Шикимори'
})

/** Показанный раздел: выбранный, а нет его у этого человека — первый наличный. Так раздел
 *  не пустует в те такты, когда выбранное ещё не доехало или уже не про этого человека. */
const shownTab = computed<Tab>(() => {
  const all = tabs.value
  return all.indexOf(tab.value) >= 0 ? tab.value : (all[0] ?? 'desc')
})

/** Видимые работы: отбор 18+ живёт на слое показа, а не в запросе. */
function shownWorks(): readonly StaffWork[] {
  return keepAllowed(works.value, (work) => work.isAdult)
}

/** Название работы: русское, когда фон уже добыл, иначе как пришло. */
function workName(work: StaffWork): string {
  return ruWorks.get(work.mediaId) ?? work.name
}

function fullName(): string {
  const card = current.value.kind === 'character' ? charCard.value : staffCard.value
  return card?.name.full ?? current.value.name
}

function nativeName(): string | null {
  const card = current.value.kind === 'character' ? charCard.value : staffCard.value
  return card?.name.native ?? current.value.native ?? null
}

function altNames(): string[] {
  const card = current.value.kind === 'character' ? charCard.value : staffCard.value
  return card?.name.alternative?.filter((n) => n.trim() !== '') ?? []
}

function largeImage(): string | null {
  const card = current.value.kind === 'character' ? charCard.value : staffCard.value
  return card?.image?.large ?? current.value.image ?? null
}

const MONTHS_RU = [
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

const MONTHS_RU_NOM = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

/** Дата { year, month, day } по-русски: «4 декабря», «декабрь 1995», «1995». */
function fmtDate(
  d: { year: number | null; month: number | null; day: number | null } | null,
): string {
  if (!d) return ''
  const day = d.day ?? 0
  const month = d.month ?? 0
  const year = d.year ?? 0
  if (month < 1 || month > 12) return year > 0 ? String(year) : ''
  // Диапазон месяца проверен выше, элемент есть всегда.
  const monthGen = MONTHS_RU[month - 1]!
  const monthNom = MONTHS_RU_NOM[month - 1]!
  if (day > 0) return year > 0 ? `${day} ${monthGen} ${year}` : `${day} ${monthGen}`
  return year > 0 ? `${monthNom} ${year}` : monthNom
}

/** Сэйю без повторов: один человек — одна строка, сколько бы аниме ни было. */
function voiceActors(): VoiceActor[] {
  const edges = charCard.value?.media?.edges
  if (!edges) return []
  const seen = new Set<number>()
  const out: VoiceActor[] = []
  for (const edge of edges) {
    const va =
      edge.voiceActors.find((v) => v.language?.toLowerCase() === 'japanese') ?? edge.voiceActors[0]
    if (!va || seen.has(va.id)) continue
    seen.add(va.id)
    out.push(va)
  }
  return out.slice(0, 6)
}

/** Имя сэйю: русское, когда фон уже добыл. */
function vaName(va: VoiceActor): string {
  return ruVoices.get(va.id) ?? va.name.full
}

/** Переход на карточку работы: окно закрывается, иначе оно заслонит карточку. */
function openWork(mediaId: number): void {
  navigate('media', { id: String(mediaId) })
  emit('close')
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  // Escape идёт на шаг назад по цепочке, а окно закрывает только в корне.
  if (depth.value > 0) goBackPerson()
  else emit('close')
}

/** Русские названия работ: полка приезжает латиницей. Сначала подставляется известное
 *  без сети (датасет и склад имён), дальше пачки — поодиночке сожгли бы темп. */
async function beginWorkNames(mine: number, list: readonly StaffWork[]): Promise<void> {
  const ids = list.map((work) => work.mediaId)

  for (const id of ids) {
    const known = peekRussianName(id)
    if (known) ruWorks.set(id, known)
  }

  for (let from = 0; from < ids.length; from += WORK_CHUNK) {
    if (!alive || mine !== run) return

    const chunk = ids.slice(from, from + WORK_CHUNK)
    await prefetchRussianNames(chunk)
    if (!alive || mine !== run) return

    for (const id of chunk) {
      const found = peekRussianName(id)
      if (found) ruWorks.set(id, found)
    }
  }
}

/** Русские имя и описание: окно их не держит, докидываются по готовности. Гарда тёзок
 *  не нужна — пара имя + кандзи даёт точный балл. */
async function beginRussian(mine: number, target: PersonTarget): Promise<void> {
  if (translateAllowed()) {
    // Ответ раскладывается по двум признакам: карточку можно показать и при недоезде (имя могло остаться от списка ролей), а «ждать больше нечего» и «надо повторить» — разное.
    const answer = await askRussianPersonFull(target.kind, target)
    if (!alive || mine !== run) return

    ruWait.value = false
    ruFailed.value = answer.state === 'fail'
    // Карточка при недоезде бывает частичной: имя есть, описания нет — такой ответ не подменяет полный.
    if (answer.person && !(ruPerson.value && !ruPerson.value.partial)) {
      ruPerson.value = answer.person
    }
  }

  if (settings.translateStaff) {
    for (const va of voiceActors()) {
      if (!alive || mine !== run) return
      const found = await getRussianPerson('staff', {
        personId: va.id,
        name: va.name.full,
        native: va.name.native,
        image: va.image?.large ?? va.image?.medium ?? null,
        siteUrl: va.siteUrl,
      })
      if (!alive || mine !== run) return
      if (found) ruVoices.set(va.id, found.russian)
    }
  }
}

/** Показ человека: сброс прошлого, карточка с сервера, русский проход фоном. */
async function load(target: PersonTarget): Promise<void> {
  const mine = ++run
  current.value = target
  charCard.value = null
  staffCard.value = null
  works.value = []
  ruWorks.clear()
  ruVoices.clear()
  tab.value = 'desc'
  busy.value = true
  cardFailed.value = false
  ruFailed.value = false
  // Ждать ли русского: при выключенном переводе ждать нечего, и описание показывается как пришло.
  ruWait.value = translateAllowed()
  box.value?.scrollTo({ top: 0 })

  // Известное с прошлого показа подставляется сразу, сеть не ждётся.
  ruPerson.value = translateAllowed() ? peekRussianPerson(target.kind, target.personId) : null

  if (target.kind === 'character') {
    const ask = await fetchCharacterCard(target.personId)
    if (!alive || mine !== run) return
    charCard.value = ask.card
    cardFailed.value = ask.state === 'fail'
  } else {
    // Полка работ идёт своим доходом: карточка её не ждёт, а без работ она живая.
    void fetchStaffWorks(target.personId)
      .then((list) => {
        if (!alive || mine !== run) return
        works.value = list

        // Названия догоняют полку: постеры видны сразу, имена меняются по ходу.
        void beginWorkNames(mine, list).catch((e) => {
          Logger('WARN', 'Карточка персоны: русские названия работ не доехали', e)
        })
      })
      .catch((e) => {
        Logger('WARN', 'Карточка персоны: работы не загрузились', e)
      })

    const ask = await fetchStaffCard(target.personId)
    if (!alive || mine !== run) return
    staffCard.value = ask.card
    cardFailed.value = ask.state === 'fail'
  }
  if (!alive || mine !== run) return
  busy.value = false

  void beginRussian(mine, target).catch((e) => {
    // Недоезд по русскому описанию не держит окно в ожидании: описание разблокируется здесь.
    if (!alive || mine !== run) return
    ruWait.value = false
    ruFailed.value = true
    Logger('WARN', 'Карточка персоны: русское описание не доехало', e)
  })
}

/** Повтор всего показа: и карточки с сервера, и русского прохода. */
function retry(): void {
  void load(current.value).catch((e) => {
    Logger('WARN', 'Карточка персоны: повтор не удался', e)
  })
}

/** Переход к сэйю в том же окне: второй слой затемнения не нужен. */
function openVoice(va: VoiceActor): void {
  history.push(current.value)
  depth.value = history.length
  void load({
    kind: 'staff',
    personId: va.id,
    name: va.name.full,
    native: va.name.native,
    image: va.image?.large ?? va.image?.medium ?? null,
    siteUrl: va.siteUrl,
  })
}

/** Шаг назад по цепочке «персонаж → сэйю». */
function goBackPerson(): void {
  const prev = history.pop()
  depth.value = history.length
  if (prev) void load(prev)
}

/** Слой окошка подменил человека: ссылка из описания ведёт на другого. Прежний
 * уходит в ту же цепочку, что и переход к сэйю, — «Назад» и Escape работают одинаково. */
watch(
  () => props.start,
  (next) => {
    const now = current.value
    if (next.kind === now.kind && next.personId === now.personId) return

    history.push(now)
    depth.value = history.length
    void load(next).catch((e) => {
      Logger('WARN', 'Карточка персоны: загрузка не удалась', e)
    })
  },
)

// «Назад» закрывает карточку человека и возвращает туда, откуда её открыли, — под окном остаётся карточка тайтла, и её человек как раз и читал.
let stopBack: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKey)
  stopBack = pushBackStop(function () {
    emit('close')
    return true
  })
  void load(props.start).catch((e) => {
    Logger('WARN', 'Карточка персоны: загрузка не удалась', e)
  })
})

onBeforeUnmount(() => {
  alive = false
  stopBack?.()
  stopBack = null
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    class="am-sheet"
    :class="{ 'am-sheet--tv': lite }"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="am-sheet__box">
      <!-- Шапка стоит на месте: прокручивается только тело ниже. -->
      <header class="am-sheet__head">
        <div class="am-ps-top">
          <div class="am-ps-portrait">
            <img
              v-if="largeImage()"
              class="am-ps-portrait__img"
              :src="largeImage()!"
              :alt="fullName()"
              decoding="async"
            />
            <span v-else class="am-ps-portrait__img am-ps-portrait__img--empty" aria-hidden="true">
              {{ fullName().slice(0, 1) }}
            </span>
          </div>

          <div class="am-ps-names">
            <p class="am-ps-names__full">{{ fullName() }}</p>
            <p v-if="ruPerson" class="am-ps-names__russian">{{ ruPerson.russian }}</p>
            <p v-if="nativeName()" class="am-ps-names__native">{{ nativeName() }}</p>
            <p v-if="altNames().length" class="am-ps-names__alt">
              {{ altNames().join(' · ') }}
            </p>

            <template v-if="current.kind === 'staff' && staffCard">
              <p v-if="staffCard.primaryOccupations?.length" class="am-dim am-ps-names__occ">
                {{ staffCard.primaryOccupations.map(occupationWord).join(', ') }}
              </p>
              <p v-if="staffCard.languageV2" class="am-dim">
                {{ langWord(staffCard.languageV2)
                }}<template v-if="staffCard.homeTown">, {{ staffCard.homeTown }}</template>
              </p>
              <p v-if="fmtDate(staffCard.dateOfBirth)" class="am-dim">
                {{ fmtDate(staffCard.dateOfBirth)
                }}<template v-if="fmtDate(staffCard.dateOfDeath)">
                  &nbsp;—&nbsp;{{ fmtDate(staffCard.dateOfDeath) }}</template
                >
              </p>
            </template>

            <template v-if="current.kind === 'character' && charCard">
              <p v-if="charCard.gender || charCard.age" class="am-dim">
                <template v-if="charCard.gender">{{ genderWord(charCard.gender) }}</template
                ><template v-if="charCard.gender && charCard.age"> · </template
                ><template v-if="charCard.age">{{ charCard.age }}</template>
              </p>
              <p v-if="fmtDate(charCard.dateOfBirth)" class="am-dim">
                {{ fmtDate(charCard.dateOfBirth) }}
              </p>
            </template>
          </div>

          <!-- Управление окном одной группой в правом углу: шаг назад по цепочке стоит рядом с закрытием. -->
          <div class="am-ps-acts">
            <button
              v-if="depth > 0"
              v-tip="'Шаг назад'"
              class="am-ps-back"
              type="button"
              @click="goBackPerson"
            >
              <!-- Стрелка нарисована, а не набрана знаком ← из шрифта: глиф шёл тоньше остального интерфейса. -->
              <span class="am-ps-back__sign" aria-hidden="true">
                <svg class="am-ps-back__chev" viewBox="0 0 16 16">
                  <path d="M9.9 3.3 5.2 8l4.7 4.7" />
                </svg>
              </span>
              <span class="am-ps-back__word">Назад</span>
            </button>

            <button
              class="am-sheet__close"
              type="button"
              aria-label="Закрыть"
              @click="emit('close')"
            >
              <SakuraBloom />
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      </header>

      <!-- Ряд разделов. Одному разделу делить площадь не с кем, и ряд не показывается вовсе. -->
      <div v-if="!busy && tabs.length > 1" class="am-ps-tabs" role="tablist">
        <button
          v-for="one in tabs"
          :key="one"
          class="am-ps-tab"
          :class="{ 'am-ps-tab--on': shownTab === one }"
          type="button"
          role="tab"
          :aria-selected="shownTab === one"
          @click="tab = one"
        >
          {{ TAB_WORDS[one] }}
        </button>
      </div>

      <div ref="box" class="am-sheet__body">
        <template v-if="busy">
          <span class="am-skeleton am-ps-skel" />
          <span class="am-skeleton am-ps-skel" />
          <span class="am-skeleton am-ps-skel am-ps-skel--short" />
        </template>

        <template v-else>
          <!-- Пока русский источник не ответил, вместо описания заглушка: подменяемый текст читать хуже, чем пустую полосу. -->
          <span v-if="ruWait" class="am-skeleton am-ps-skel" />
          <span v-if="ruWait" class="am-skeleton am-ps-skel am-ps-skel--short" />

          <!-- Недоезд говорится прямо и лечится кнопкой: молчаливый постер заставлял перезагружать всё окно. -->
          <div v-if="cardFailed || ruFailed" class="am-ps-fail">
            <p class="am-ps-fail__word">
              {{ cardFailed ? 'Карточку загрузить не удалось.' : 'Русское описание не доехало.' }}
            </p>
            <button class="am-btn am-btn--ghost" type="button" @click="retry">Повторить</button>
          </div>

          <!-- Описание — плита со своей прокруткой и сама фокусируемая: иначе за текст не зацепиться и
     листать его нечем. Вниз и вверх её крутит dpad по метке data-am-scroll. -->
          <div
            v-if="shownTab === 'desc' && rawDesc() !== ''"
            class="am-ps-desc"
            tabindex="0"
            role="group"
            aria-label="Описание"
            data-am-scroll
          >
            <!-- Ссылка на тайтл закрывает окно: иначе карточка откроется за ним. Ссылка на
     другого человека окно не закрывает — оно уже показывает нового. -->
            <!-- Описание человека сплошным текстом: ссылки на других персонажей уводили бы
     читающего биографию из карточки в цепочку чужих биографий. -->
            <RichText :text="rawDesc()" plain @inside="emit('close')" />
          </div>

          <!-- Откуда взят текст. На приставке адрес открывать нечем, поэтому названием, а не ссылкой:
               подчёркнутая подпись, которая ничего не делает, читается как поломка. -->

          <!-- Работы (только для авторов): сетка постеров с переходом внутрь -->
          <div v-else-if="shownTab === 'works'" class="am-ps-works">
            <button
              v-for="work in shownWorks()"
              :key="work.mediaId"
              class="am-ps-work"
              type="button"
              @click="openWork(work.mediaId)"
            >
              <img
                v-if="work.cover"
                class="am-ps-work__art"
                :src="work.cover"
                :alt="workName(work)"
                loading="lazy"
                decoding="async"
              />
              <span v-else class="am-ps-work__art am-ps-work__art--empty" aria-hidden="true">
                {{ workName(work).slice(0, 1) }}
              </span>
              <span class="am-ps-work__name">{{ workName(work) }}</span>
              <span v-if="work.year" class="am-ps-work__year">{{ work.year }}</span>
            </button>
          </div>

          <!-- Сэйю (только для персонажей): строка кликабельна, окно то же -->
          <div v-else-if="shownTab === 'voices'" class="am-ps-voices">
            <button
              v-for="va in voiceActors()"
              :key="va.id"
              v-tip="`Карточка: ${vaName(va)}`"
              class="am-ps-va"
              type="button"
              @click="openVoice(va)"
            >
              <img
                v-if="va.image?.medium || va.image?.large"
                class="am-ps-va__art"
                :src="(va.image.medium ?? va.image.large)!"
                :alt="va.name.full"
                loading="lazy"
                decoding="async"
              />
              <span v-else class="am-ps-va__art am-ps-va__art--empty" aria-hidden="true">
                {{ va.name.full.slice(0, 1) }}
              </span>
              <span class="am-ps-va__name">{{ vaName(va) }}</span>
              <!-- Стрелка нарисована, а не набрана знаком → из шрифта: глиф шёл тоньше остального интерфейса. -->
              <span class="am-ps-va__go" aria-hidden="true">
                <svg class="am-ps-va__chev" viewBox="0 0 16 16">
                  <path d="M6.1 3.3 10.8 8l-4.7 4.7" />
                </svg>
              </span>
            </button>
          </div>

          <!-- Откуда взят текст под описанием. На приставке адрес открывать нечем, поэтому
     названием, а не ссылкой: подчёркнутая подпись, которая ничего не делает, читается
     как поломка. Строка стоит под плитой, а не внутри неё: иначе уехала бы вниз
     вместе с текстом. -->
          <p v-if="shownTab === 'desc' && descSource !== ''" class="am-ps-src">
            Описание отсюда: {{ descSource }}
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
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

/* Три этажа: шапка, ряд разделов и прокручиваемое тело. Подвал убран — его единственная кнопка
   уводила на AniList. Ряд разделов пустой этаж не занимает: строки сетки без содержимого схлопываются. */
.am-sheet__box {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 820px;
  max-height: min(90vh, 940px);
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

.am-sheet__head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.am-sheet__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
  overflow-y: auto;
}

/* Управление окном одной группой в правом углу шапки: «Назад» отдельной строкой ел высоту и уводил взгляд от имени. */
.am-ps-acts {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}

/* Цель нажатия в 44 пикселя. Круг и сакуру под курсором рисует вложенный слой,
   а кнопка остаётся прямоугольной — при ней остаются попадание и кольцо фокуса. */
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
  padding: 0;
  font: inherit;
  font-size: 22px;
  line-height: 1;
  color: var(--am-dim);
  cursor: pointer;
  background: none;
  border: 0;

  /* Ничего не красит: держит круглым только кольцо :focus-visible. */
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

/* Шаг назад по цепочке: капсула со знаком в кружке, как у кнопки возврата в шапке приложения. */
.am-ps-back {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  height: var(--am-ctl);
  padding: 0 14px 0 6px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-ps-back:hover:where(:not(.am-lite *)),
.am-ps-back:focus-visible {
  color: var(--am-text);
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}

/* Кружок знака: без него стрелка проваливалась в подложку капсулы. */
.am-ps-back__sign {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--am-accent);
  background: var(--am-accent-soft);
  border-radius: var(--am-r-cap);
  transition: transform var(--am-fast) var(--am-ease);
}

.am-ps-back:hover:where(:not(.am-lite *)) .am-ps-back__sign,
.am-ps-back:focus-visible .am-ps-back__sign {
  transform: translateX(-2px);
}

.am-ps-back__word {
  white-space: nowrap;
}

.am-ps-top {
  display: flex;
  gap: clamp(14px, 1.6vw, 22px);
  align-items: flex-start;
}

.am-ps-portrait {
  flex: none;
}

.am-ps-portrait__img {
  display: block;
  width: clamp(92px, 8vw, 128px);
  aspect-ratio: 2 / 3;
  object-fit: cover;
  background: var(--am-fill-2);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-leaf);
}

.am-ps-portrait__img--empty {
  display: grid;
  place-items: center;
  font-size: 32px;
  color: var(--am-faint);
}

.am-ps-names {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-top: 2px;
}

/* У параграфов браузерные маргины, зазор держит только gap раскладки. */
.am-ps-names p {
  margin: 0;
}

.am-ps-names__full {
  font-size: clamp(17px, 1.6vw, 22px);
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: -0.01em;
}

/* Русское имя читается первым по смыслу, поэтому ярче оригинала. */
.am-ps-names__russian {
  font-size: 14px;
  font-weight: 600;
  color: var(--am-accent);
}

.am-ps-names__native {
  font-size: 14px;
  color: var(--am-dim);
}

.am-ps-names__alt {
  font-size: 13px;
  color: var(--am-faint);
}

.am-ps-names__occ {
  margin-top: 4px;
}

/* Описание лежит на своей подложке: стена текста без границ не читалась. Разметку держит RichText. */
/* Ряд разделов: описание, работы и голоса меняют друг друга, а не стоят столбиком — в столбик
   длинное описание отжимало полку работ за край окна. */
.am-ps-tabs {
  display: flex;
  gap: 8px;
}

.am-ps-tab {
  height: var(--am-ctl);
  padding: 0 15px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: var(--am-dim);
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease);
}

.am-ps-tab:hover:where(:not(.am-lite *)) {
  color: var(--am-text);
  background: var(--am-fill-2);
}

.am-ps-tab--on {
  color: var(--am-text);
  background: rgb(var(--am-accent-rgb) / 0.16);
  border-color: rgb(var(--am-accent-rgb) / 0.55);
}

/* Описание — плита со своей прокруткой и сама цель для пульта: текст, не влезающий
   в кадр, должен листаться, а листать нечем, если за него нельзя зацепиться. */
.am-ps-desc {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 100%;
  margin: 0;
  padding: 14px 16px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.65;
  color: var(--am-dim);
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
}

/* Работы сеткой, а не рельсой: в окне рельса обрезалась по правому краю, и листать её
   приходилось отдельной прокруткой внутри прокручиваемого тела. Сеткой пульт ходит по рядам. */
/* Отступ сверху — под отклик постера: он берёт два пикселя вверх, а тело окна обрезает
   прокручиваемое содержимое, и верхний ряд терял эти два пикселя. */
.am-ps-works {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 14px 10px;
  padding: 6px 4px 4px;
}

.am-ps-work {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
}

.am-ps-work__art {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  background: var(--am-fill-2);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-m);
  transition:
    border-color var(--am-fast) var(--am-ease),
    transform var(--am-fast) var(--am-ease);
}

.am-ps-work__art--empty {
  display: grid;
  place-items: center;
  font-size: 26px;
  color: var(--am-faint);
}

.am-ps-work:hover:where(:not(.am-lite *)) .am-ps-work__art,
.am-ps-work:focus-visible .am-ps-work__art {
  border-color: rgb(var(--am-accent-rgb) / 0.55);
  transform: translateY(-2px);
}

/* Кромку рисует постер, а не кнопка: кнопка — столбец «постер, имя, год», и общая обводка
   шла прямоугольником и вокруг подписи. По проекту кромку рисует тот, кто рисует форму. */
.am-lite .am-ps-work:focus-visible {
  outline: none;
  box-shadow: none;
}

.am-lite .am-ps-work:focus-visible .am-ps-work__art {
  outline: 2px solid rgb(var(--am-accent-rgb) / 0.9);
  outline-offset: -2px;
}

/* Имя в две строки: одной не хватало почти ни одному тайтлу, а третья ломала ровный ряд постеров. */
.am-ps-work__name {
  display: -webkit-box;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.am-ps-work__year {
  font-size: 11px;
  color: var(--am-faint);
}

.am-ps-voices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}

/* Строка сэйю — кнопка: из неё открывается его карточка в этом же окне. Капсула как у авторов в карточке. */
.am-ps-va {
  display: flex;
  gap: 11px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 7px 8px 7px 12px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-cap);
  transition:
    background-color var(--am-fast) var(--am-ease),
    border-color var(--am-fast) var(--am-ease),
    transform var(--am-fast) var(--am-ease);
}

.am-ps-va:hover:where(:not(.am-lite *)),
.am-ps-va:focus-visible {
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
  transform: translateY(-1px);
}

.am-ps-va:hover:where(:not(.am-lite *)) .am-ps-va__name {
  color: var(--am-accent);
}

.am-ps-va__art {
  flex: none;
  width: 40px;
  height: 40px;
  object-fit: cover;
  background: var(--am-fill-2);
  border-radius: var(--am-r-cap);
}

.am-ps-va__art--empty {
  display: grid;
  place-items: center;
  font-size: 16px;
  color: var(--am-faint);
}

.am-ps-va__name {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color var(--am-fast) var(--am-ease);
}

/* Стрелка говорит, что строка ведёт дальше. Свой кружок у неё не для красоты: голая
   стрелка у края капсулы проваливалась в фон и стояла без своего места в строке. */
.am-ps-va__go {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  color: var(--am-faint);
  background: var(--am-fill-2);
  border-radius: var(--am-r-cap);
  transition:
    color var(--am-fast) var(--am-ease),
    background-color var(--am-fast) var(--am-ease),
    transform var(--am-fast) var(--am-ease);
}

.am-ps-va:hover:where(:not(.am-lite *)) .am-ps-va__go,
.am-ps-va:focus-visible .am-ps-va__go {
  color: var(--am-accent);
  background: var(--am-accent-soft);
  transform: translateX(3px);
}

/* Шеврон линиями: толщина и скругление концов не зависят от шрифта. */
.am-ps-back__chev,
.am-ps-va__chev {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.am-ps-skel {
  display: block;
  height: 16px;
  border-radius: var(--am-r-s);
}

.am-ps-skel--short {
  width: 60%;
}

/* Откуда взят текст описания. Тем же приёмом, что и под описанием аниме: бледная справка
   под плитой, названием, а не ссылкой — на приставке открывать адрес нечем. */
.am-ps-src {
  flex: none;
  margin: 0;
  font-size: 12.5px;
  color: var(--am-faint);
}

/* Недоезд карточки или русского описания: строка и кнопка повтора. Рамка не рисуется —
   окно и так на стекле, а лишняя граница делала бы служебную строку отдельной плиткой. */
.am-ps-fail {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 2px;
}

.am-ps-fail__word {
  margin: 0;
  font-size: 13px;
  color: var(--am-dim);
}

/* Узкое окно: портрет и имена встают колонкой, иначе имена сжимает в нить. */
@media (max-width: 620px) {
  .am-ps-top {
    flex-wrap: wrap;
  }

  .am-ps-portrait__img {
    width: 84px;
  }

  /* Слово у кнопки назад уходит: в углу с закрытием на узком окне хватает только знака. */
  .am-ps-back {
    padding: 0 6px;
  }

  .am-ps-back__word {
    display: none;
  }
}

/* ТЕЛЕВИЗОР У пульта нет ни креста в углу, ни Escape, а стрелки из окна уводили фокус
   на страницу под ним: dpad не определяет область окна на position: fixed. */
.am-sheet--tv .am-sheet__box {
  gap: 12px;
  max-width: min(1000px, 94vw);
  max-height: min(92vh, 900px);
  padding: 14px;
}

.am-sheet--tv .am-sheet__head {
  gap: 8px;
}

.am-sheet--tv .am-sheet__body {
  gap: 10px;
}

.am-sheet--tv .am-ps-top {
  gap: 14px;
}

.am-sheet--tv .am-ps-portrait__img {
  width: 88px;
}

.am-sheet--tv .am-ps-names__full {
  font-size: 18px;
}

/* Раздел — главный переключатель окна, и обычной высоты кнопки для него мало: цель ловится с трёх метров. */
.am-sheet--tv .am-ps-tab {
  height: 44px;
  padding: 0 20px;
  font-size: 14px;
}

/* Постер в сетке крупнее: с трёх метров 96 пикселей мелковаты. */
.am-sheet--tv .am-ps-works {
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 16px 12px;
}

.am-sheet--tv .am-ps-desc {
  font-size: 15px;
}

/* Крест закрытия на телевизоре — главный выход из окна, и 44 пикселя для него мало: цель ловится с трёх метров. */
.am-sheet--tv .am-sheet__close {
  width: 52px;
  height: 52px;
  font-size: 26px;
}

@media (prefers-reduced-motion: reduce) {
  .am-sheet,
  .am-sheet__box {
    animation: none;
  }

  .am-sheet__close:hover:where(:not(.am-lite *)) > span,
  .am-sheet__close:focus-visible > span,
  .am-ps-back:hover:where(:not(.am-lite *)) .am-ps-back__sign,
  .am-ps-back:focus-visible .am-ps-back__sign,
  .am-ps-work:hover:where(:not(.am-lite *)) .am-ps-work__art,
  .am-ps-work:focus-visible .am-ps-work__art,
  .am-ps-va:hover:where(:not(.am-lite *)),
  .am-ps-va:focus-visible,
  .am-ps-va:hover:where(:not(.am-lite *)) .am-ps-va__go,
  .am-ps-va:focus-visible .am-ps-va__go {
    transform: none;
  }
}
</style>
