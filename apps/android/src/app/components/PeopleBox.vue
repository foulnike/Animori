<script setup lang="ts">
// Люди аниме под двумя колонками карточки. Окошко человека — в общем слое person-layer.ts.
// Подпись режется по двум строкам: ширина трека жёсткая, слитное имя вылезало за плитку.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, watch } from 'vue'

import { fetchMalIds } from '@/api/anilist-media'
import {
  fetchMediaPeople,
  type CharacterRef,
  type PersonRef,
  type StaffRef,
} from '@/api/anilist-people'
import {
  getRussianPerson,
  peekRussianPerson,
  prefetchRussianPeople,
  type PersonKind,
  type RussianPerson,
} from '@/core/person-title'
import { settings } from '@/core/settings'
import { Logger } from '@/utils/logger'

import { openPerson } from '../person-layer'
import { gridCols, wholeRows } from '../grid-fit'

import { CREW_WORDS } from './crew-words'

const props = defineProps<{ mediaId: number }>()

/** Сколько авторов видно до раскрытия хвоста. Восемь, а не шесть: сетка встаёт в четыре колонки,
 * и шесть плиток оставляли второй ряд наполовину пустым. Это десктопная норма и только отправная
 * точка: на приставке колонок девять, и восемь занимали один ряд на девять с пустым слотом. */
const STAFF_HEAD = 8

/** Сколько заглушек класть на полку, пока люди едут. */
const HOLD_FACES = 8

/** Роли персонажей: сервер называет их тремя словами, других не бывает. */
const ROLE_WORDS: Record<string, string> = {
  MAIN: 'Главный',
  SUPPORTING: 'Второстепенный',
  BACKGROUND: 'Массовка',
}

const folk = ref<CharacterRef[]>([])
const crew = ref<StaffRef[]>([])
const busy = ref(false)

/** Раскрыт ли хвост списка авторов. */
const wide = ref(false)

/** Номер показа: ответ на прежнее аниме приходит не к месту. */
let run = 0

/** Русские имена, добытые фоном: ключ — `${kind}:${personId}`. */
const russian = shallowReactive(new Map<string, RussianPerson>())

/** Сетка авторов: нужна, чтобы узнать, сколько колонок в неё влезло. */
const crewBox = ref<HTMLElement | null>(null)

/** Колонок в сетке авторов по факту. Пока сетки не было в разметке — ноль, и норма остаётся прежней. */
const crewCols = ref(0)

/** Сколько авторов показывать свёрнутыми: целое число рядов от десктопной нормы. */
const crewHead = computed<number>(() => wholeRows(STAFF_HEAD, crewCols.value))

/** Меряем колонки по готовой раскладке, после того как Vue поставит сетку в разметку. */
async function measureCrew(): Promise<void> {
  await nextTick()
  const found = gridCols(crewBox.value)
  // Пока колонки не измерились, держим прежнюю норму: показать надо что-то, а не ноль плиток.
  if (found > 0) crewCols.value = found
}

const shownCrew = computed<StaffRef[]>(() =>
  wide.value ? crew.value : crew.value.slice(0, crewHead.value),
)

const hiddenCrew = computed<number>(() => Math.max(0, crew.value.length - crewHead.value))

const empty = computed<boolean>(() => folk.value.length === 0 && crew.value.length === 0)

/** Роль персонажа словом; незнакомое значение лучше не показывать. */
function roleWord(role: string | null): string {
  return role === null ? '' : (ROLE_WORDS[role] ?? '')
}

/** Роль автора по-русски; составная роль переводится по частям. */
function crewWord(role: string | null): string {
  if (role === null) return ''

  return role
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => CREW_WORDS[part] ?? part)
    .join(', ')
}

/** Первая буква имени: стоит на месте не приехавшего портрета. */
function letter(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

function personKey(kind: PersonKind, personId: number): string {
  return `${kind}:${personId}`
}

/** Имя для плитки: русское, когда фон уже добыл. */
function displayName(kind: PersonKind, person: PersonRef): string {
  return russian.get(personKey(kind, person.personId))?.russian ?? person.name
}

/** Подсказка плитки: показанное имя, родное и латиница тремя строками. Показанное — первым:
 * в плитке оно режется по двум строкам. Своя подсказка держит перенос строки, чего системная не умела. */
function personHint(kind: PersonKind, person: PersonRef): string {
  const shown = displayName(kind, person)
  const lines = [shown, person.native, person.name === shown ? null : person.name]

  return lines.filter((line): line is string => typeof line === 'string' && line !== '').join('\n')
}

async function load(): Promise<void> {
  const mine = ++run

  folk.value = []
  crew.value = []
  wide.value = false

  if (props.mediaId === 0) return

  busy.value = true

  try {
    const found = await fetchMediaPeople(props.mediaId)
    if (mine !== run) return

    folk.value = found.characters
    crew.value = found.staff
    void beginRussian(mine)
  } catch (e) {
    // Без людей карточка полноценна: секция просто не появится.
    Logger('WARN', `Люди аниме ${props.mediaId}: добыть не вышло`, e)
  } finally {
    if (mine === run) busy.value = false
  }
}

/** Фоновый проход по русским именам: основная масса приходит списком ролей аниме, точечный
 * поиск достаётся несопоставленным. Уход с аниме обрывает очередь тем же номером показа. */
async function beginRussian(mine: number): Promise<void> {
  const queue: Array<{ kind: PersonKind; person: PersonRef }> = []
  if (settings.translateCharacters) {
    for (const person of folk.value) queue.push({ kind: 'character', person })
  }
  if (settings.translateStaff) {
    for (const person of crew.value) queue.push({ kind: 'staff', person })
    for (const person of folk.value) {
      if (person.voice) queue.push({ kind: 'staff', person: person.voice })
    }
  }
  if (queue.length === 0) return

  // MAL id нынешнего аниме: на нём и массовый проход, и гард тёзок.
  let malId: number | undefined
  try {
    malId = (await fetchMalIds([props.mediaId])).get(props.mediaId)
  } catch (e) {
    Logger('WARN', `Русские имена: MAL id аниме ${props.mediaId} не добыт`, e)
  }

  if (malId) {
    const left = await prefetchRussianPeople(malId, queue)
    if (mine !== run) return

    // Список ролей разрешил большинство разом: подметаем в плитки.
    for (const entry of queue) {
      const card = peekRussianPerson(entry.kind, entry.person.personId)
      if (card) russian.set(personKey(entry.kind, entry.person.personId), card)
    }

    // Кого список не покрыл — добираем точечно, по одному.
    for (const entry of left) {
      if (mine !== run) return
      const card = await getRussianPerson(entry.kind, entry.person, [malId])
      if (mine !== run) return
      if (card) russian.set(personKey(entry.kind, entry.person.personId), card)
    }
    return
  }

  // Без номера MAL массового прохода нет: все идут точечным поиском.
  for (const entry of queue) {
    if (mine !== run) return
    const card = await getRussianPerson(entry.kind, entry.person)
    if (mine !== run) return
    if (card) russian.set(personKey(entry.kind, entry.person.personId), card)
  }
}

/** Открывает человека окошком поверх экрана: уход на сайт тут ни к чему. */
function onShow(kind: PersonKind, person: PersonRef): void {
  openPerson({ kind, ...person })
}

onMounted(() => {
  void load()
  // Сетка авторов может быть уже в разметке, а может и нет — тогда колонки неизмеримы, и норма
  // остаётся прежней до появления состава.
  void measureCrew()
})

onBeforeUnmount(() => {
  run++
})

watch(
  () => props.mediaId,
  () => {
    void load()
  },
)

// Состав приходит из сети, и только с ним Vue ставит сетку в разметку. Переход на другое аниме
// пересобирает её целиком, поэтому меряем и тут: колонки могли не уложиться в прежние.
watch(crew, () => {
  void measureCrew()
})
</script>

<template>
  <div v-if="busy && empty" class="am-panel am-folk">
    <h3 class="am-h3">Персонажи</h3>
    <div class="am-rail">
      <span v-for="at in HOLD_FACES" :key="at" class="am-skeleton am-face__wait" />
    </div>
  </div>

  <template v-else-if="!empty">
    <div v-if="folk.length > 0" class="am-panel am-folk">
      <h3 class="am-h3">Персонажи</h3>

      <!-- data-am-row: вход с полки франшизы встаёт на первого персонажа, а не на того, кто оказался под курсором (dpad.ts). -->
      <div class="am-rail am-cards" data-am-row>
        <article v-for="person in folk" :key="person.personId" class="am-face">
          <button
            v-tip="personHint('character', person)"
            class="am-face__hit"
            type="button"
            @click="onShow('character', person)"
          >
            <span class="am-face__frame">
              <img
                v-if="person.image"
                class="am-face__art"
                :src="person.image"
                :alt="person.name"
                loading="lazy"
                decoding="async"
              />
              <span v-else class="am-face__art am-face__art--empty" aria-hidden="true">
                {{ letter(person.name) }}
              </span>

              <span v-if="roleWord(person.role)" class="am-face__role">
                {{ roleWord(person.role) }}
              </span>
            </span>

            <span class="am-face__name">{{ displayName('character', person) }}</span>
          </button>

          <!-- Озвучка — подпись, а не цель: на пульте кнопка под каждым портретом удваивала ряд персонажей.
               Карточка сейю открывается из карточки самого персонажа. -->
          <span v-if="person.voice" class="am-face__voice">
            {{ displayName('staff', person.voice) }}
          </span>
        </article>
      </div>
    </div>

    <div v-if="crew.length > 0" class="am-panel am-folk">
      <div class="am-bar">
        <h3 class="am-h3">Авторы</h3>
        <span class="am-bar__gap" />
        <button
          v-if="hiddenCrew > 0"
          class="am-btn am-btn--ghost"
          type="button"
          @click="wide = !wide"
        >
          {{ wide ? 'Свернуть' : `Ещё ${hiddenCrew}` }}
        </button>
      </div>

      <div ref="crewBox" class="am-crew">
        <button
          v-for="person in shownCrew"
          :key="`${person.personId}-${person.role ?? ''}`"
          v-tip="personHint('staff', person)"
          class="am-mate"
          type="button"
          @click="onShow('staff', person)"
        >
          <img
            v-if="person.image"
            class="am-mate__art"
            :src="person.image"
            :alt="person.name"
            loading="lazy"
            decoding="async"
          />
          <span v-else class="am-mate__art am-mate__art--empty" aria-hidden="true">
            {{ letter(person.name) }}
          </span>

          <span class="am-mate__text">
            <span class="am-mate__name">{{ displayName('staff', person) }}</span>
            <span v-if="crewWord(person.role)" class="am-mate__role">
              {{ crewWord(person.role) }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* Ширина лица одним токеном: трек полки, плитка и заглушка иначе повторяли бы цифру три раза и
   расходились. Сам токен живёт в :root (theme.css): на том же размере идёт полка франшизы. */
.am-folk {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border-radius: var(--am-r-leaf);
}

/* Засечка акцентом вместо голого заголовка: панелей на карточке много. */
.am-folk .am-h3 {
  display: flex;
  gap: 9px;
  align-items: center;
}

.am-folk .am-h3 {
}

/* Мягкий сход у правого края: полка длинная и без подсказки обрывалась бы на полуплитке.
   Размер трека — общий, в `.am-cards` (theme.css): он один на персонажей и на франшизу. */
.am-folk .am-rail {
  mask-image: linear-gradient(to right, #000 94%, transparent);
}

.am-face__wait {
  width: var(--am-face);
  aspect-ratio: 2 / 3;
  border-radius: var(--am-r-leaf);
}

/* Авторов единицы: полка из четырёх плиток смотрелась бы обрубком. */
.am-crew {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.am-mate {
  display: flex;
  gap: 11px;
  align-items: center;
  min-width: 0;
  padding: 8px 12px;
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

.am-mate:hover:where(:not(.am-lite *)),
.am-mate:focus-visible {
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
  transform: translateY(-1px);
}

.am-mate__art {
  flex: none;
  width: 42px;
  height: 42px;
  object-fit: cover;
  background: var(--am-fill-2);
  border-radius: var(--am-r-cap);
}

.am-mate__art--empty {
  display: grid;
  place-items: center;
  font-size: 17px;
  color: var(--am-faint);
}

.am-mate__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.am-mate__name {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-mate__role {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--am-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .am-face__hit:hover:where(:not(.am-lite *)) .am-face__frame,
  .am-face__hit:focus-visible .am-face__frame,
  .am-mate:hover:where(:not(.am-lite *)),
  .am-mate:focus-visible {
    transform: none;
  }
}
</style>
