<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { Bridge } from '@/bridge'
import {
  entryCount,
  forgetCollection,
  initCollection,
  pullFromShikimori,
  type PullMode,
  type ShikiPullResult,
} from '@/core/collection'
import { datasetStatus, initDatasetNames } from '@/core/dataset-names'
import { clearCache, getDbStats } from '@/core/db'
import { adultByBirth } from '@/core/adult'
import { clearHidden } from '@/core/recs'
import { copyAdultTagRules, saveSetting, settings } from '@/core/settings'

import { APPEARANCES, appearance, setAppearance, setVisualTheme, visualTheme } from '../appearance'
import { checkUpdate, installUpdate, updateOffer } from '../update'
import CloudBox from '../components/CloudBox.vue'
import { currentRoute } from '../router'
import CreditsBox from '../components/CreditsBox.vue'
import DateField from '../components/DateField.vue'
import ProxyBox from '../components/ProxyBox.vue'
import SettingMark from '../components/SettingMark.vue'
import SettingsSheet from '../components/SettingsSheet.vue'
import { tagWord } from '../tag-words'
import { restoreFocus } from '../focus-return'
import { canOpenOutside } from '../platform'

const version = __ANIMORI_VERSION__

/// Человеку важна его система, а не имя нашей сборки: слово «app» ему не говорит ничего.
function systemName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'неизвестна'
}

const system = systemName()

/** Адрес датасета названий. Ссылка осталась и после ухода на CC0-1.0, но обязанностью
 * быть перестала: атрибуции эта лицензия не требует, а назвать источник кириллицы — вежливость. */
const DATASET_URL = 'https://github.com/foulnike/animori-data'

/// Внешние ссылки открываются только оболочкой: target="_blank" в WebView2 отбрасывается молча.
function onDatasetLink(): void {
  void Bridge.shell.openExternal(DATASET_URL)
}

/** Есть ли куда вести ссылкам наружу. На телевизоре браузера нет, и обе кнопки уводили бы в никуда:
 * плашка репозитория снимается целиком, а имя датасета остаётся простым текстом. */
const outside = canOpenOutside()

// Ошибки показываются рядом с кнопкой, а не глотаются: молчаливый catch означал бы кнопку, которая не говорит почему.
const error = ref('')
const busy = ref(false)

// Сброс и удаление идут молча, и без явного ответа человек не поймёт, случилось ли что-нибудь.
const note = ref('')
const cleared = ref(false)

/** Кнопка очистки памяти: запасная цель возврата фокуса после удаления списка —
 *  «Удалить» рядом с ней исчезает вместе с пустым списком. */
const clearBtn = ref<HTMLButtonElement | null>(null)

/** Ник на Шикимори. Списывается с памяти настроек один раз: общий объект настроек
 * не реактивен, и v-model по его полю не показал бы набранное. */
const shikiNick = ref(settings.shikiNick)

/** Кнопка переноса списка: запасная цель возврата фокуса после переноса — кнопки
 *  вопроса, с которых его начали, к этому времени нет в разметке. */
const shikiBtn = ref<HTMLButtonElement | null>(null)

/** Занятость и ответы Шикимори держатся отдельно от общих busy/error/note. Перенос
 * списка идёт минутами, и общая занятость гасила бы кнопки своих данных. */
const shikiBusy = ref(false)
const shikiError = ref('')
const shikiReport = ref<ShikiPullResult | null>(null)
const shikiReportButton = ref<HTMLButtonElement | null>(null)
const reportPage = ref(0)
const REPORT_TITLES_PER_PAGE = 3
const reportPages = computed(
  () => 1 + Math.ceil((shikiReport.value?.lostTitles.length ?? 0) / REPORT_TITLES_PER_PAGE),
)
const reportTitles = computed(() => {
  const start = (reportPage.value - 1) * REPORT_TITLES_PER_PAGE
  return shikiReport.value?.lostTitles.slice(start, start + REPORT_TITLES_PER_PAGE) ?? []
})

const listCount = ref(0)
const usedSize = ref('')

/** Состояние датасета названий строкой: журнала нет, видно хотя бы здесь. */
const datasetText = ref('')

/** Датасет старше STALE_DAYS. Отдельный признак, а не слово внутри строки: число дней
 * человек прочитает и не заметит, а подсветку — заметит. */
const datasetStale = ref(false)

/** Порог, после которого возраст датасета подсвечивается. Тридцать дней — это три
 * пропущенные недельные сборки: одна могла упасть случайно, три значат, что расписание уснуло. */
const STALE_DAYS = 30

// Состояние проверки в разделе «О программе».
const upBusy = ref(false)

/** Кнопка проверки обновления: запасная цель возврата фокуса, когда её саму не стало
 *  под курсором — ответ приходит, пока пульт стоит на крестике. */
const upBtn = ref<HTMLButtonElement | null>(null)

/** Слово проверки, когда сказать нечего: последняя версия, отказ GitHub или подсказка системе. */
const upNote = ref('')

/** Спрашивание GitHub. Неудача здесь не поломка: обновление просто не находится,
 *  и панель говорит это словами, а не молча. */
async function onUpCheck(): Promise<void> {
  const from = document.activeElement
  upBusy.value = true
  upNote.value = ''

  try {
    updateOffer.value = await checkUpdate()
    if (updateOffer.value === null) upNote.value = 'Установлена последняя версия.'
  } catch {
    updateOffer.value = null
    upNote.value = 'Не удалось проверить обновления. Повторите позже.'
  } finally {
    upBusy.value = false
    // Кнопка гасла disabled, и пульт стоял на крестике: возвращаем его к ответу, который теперь читается строкой ниже.
    restoreFocus(from, () => upBtn.value)
  }
}

/** Отдаёт файл системе. false — прав на установку из неизвестных источников ещё нет:
 *  это ожидаемый первый шаг, а не отказ. */
function onUpInstall(): void {
  const offer = updateOffer.value
  if (offer === null) return

  if (!installUpdate(offer.url)) {
    upNote.value = 'Система попросит разрешить установку — разрешите и нажмите кнопку ещё раз.'
  }
}

/** Показ взрослого. Значение списывается с памяти настроек один раз:
 * общий объект настроек не реактивен, и v-model по его полю не дал бы ответа на клик. */
const adultMode = ref(settings.adultMode)
const ageVerified = ref(settings.adultAgeVerified)
const adultTagRules = ref(copyAdultTagRules(settings.adultTagRules))
const pendingAdultMode = ref<typeof settings.adultMode | null>(null)
const adultModes: ReadonlyArray<{
  value: typeof settings.adultMode
  title: string
  chip: 'muted' | 'blue' | 'red'
}> = [
  { value: 'full', title: 'Скрыто', chip: 'muted' },
  { value: 'partial', title: 'Частично', chip: 'blue' },
  { value: 'none', title: 'Показано', chip: 'red' },
]

const tagPage = ref(0)
const tagButton = ref<HTMLButtonElement | null>(null)
const TAGS_PER_PAGE = 3
const tagPages = computed(() => Math.ceil(Object.keys(adultTagRules.value).length / TAGS_PER_PAGE))
const shownTags = computed(() => {
  const start = tagPage.value * TAGS_PER_PAGE
  return Object.entries(adultTagRules.value).slice(start, start + TAGS_PER_PAGE)
})

/** Дата рождения из поля ввода. Живёт только до ответа и никуда не пишется. */
const birth = ref('')

/** Слова отказа. Пустая строка — отказа нет. */
const ageError = ref('')

/** Плита мозаики: за каждой своё окно. */
type Door = 'list' | 'look' | 'adult' | 'data' | 'cloud' | 'net' | 'about'
type Detail = 'import' | 'report' | 'import-error' | 'clear' | 'drop' | 'tags' | 'age'

/** Открытая плита. null — мозаика на виду. */
const adultEntry = currentRoute.value.params.id === 'adult'
const openDoor = ref<Door | null>(adultEntry ? 'adult' : null)
const doorFocus = computed(() => {
  if (openDoor.value === 'adult') return '.am-adult-mode--active'
  if (openDoor.value === 'look') return '.am-skins__btn--on'
  return undefined
})
const detail = ref<Detail | null>(null)
const doorGrid = ref<HTMLElement | null>(null)

function closeDoor(): void {
  const door = openDoor.value
  closeAge()
  openDoor.value = null
  if (door !== null) {
    restoreFocus(
      null,
      () => doorGrid.value?.querySelector<HTMLButtonElement>(`[data-door="${door}"]`) ?? null,
    )
  }
}

const doors: ReadonlyArray<{ name: Door; title: string }> = [
  { name: 'list', title: 'Импорт списка' },
  { name: 'data', title: 'Данные' },
  { name: 'look', title: 'Оформление' },
  { name: 'adult', title: 'Контент 18+' },
  { name: 'cloud', title: 'Копия списка' },
  { name: 'net', title: 'Прокси' },
  { name: 'about', title: 'О программе' },
]

function focusLookOption(event: KeyboardEvent, selector: string): void {
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget
      .closest('[role="dialog"]')
      ?.querySelector<HTMLElement>(selector)
      ?.focus({ preventScroll: true })
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function guard(
  action: () => Promise<void>,
  fallback?: () => HTMLElement | null,
): Promise<void> {
  // Держатель запоминается до busy: кнопка станет disabled и отдаст фокус, а по возврате обход не вернёт его сам — ему не о ком вспомнить.
  const from = document.activeElement
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = describe(e)
  } finally {
    busy.value = false
    restoreFocus(from, fallback)
  }
}

/// Числа переспрашиваются после каждой кнопки: показанное должно совпадать с тем, что лежит внутри. Подъём обязателен: настройки открывают раньше списков.
async function readState(): Promise<void> {
  await initCollection()
  listCount.value = entryCount()

  const got = await getDbStats()
  usedSize.value = 'error' in got ? '' : got.estimatedSize

  // Датасет поднимается тем же общим обещанием, что и на старте: второй цены чтения здесь нет.
  await initDatasetNames()
  const ds = datasetStatus()
  if (ds.loaded && ds.builtAt !== null) {
    const date = new Date(ds.builtAt).toLocaleDateString('ru-RU')
    const count = ds.names.toLocaleString('ru-RU')
    const days = daysSince(ds.builtAt)

    // Возраст рядом с датой: дата отвечает «когда собран», а возраст — «пора ли дёргать репозиторий».
    const age = days === null ? '' : ` · ${ageText(days)}`
    datasetText.value = `${date} · ${count} записей${age}`
    datasetStale.value = days !== null && days > STALE_DAYS
  } else {
    datasetText.value = 'не загружен'
    datasetStale.value = false
  }
}

/// Копия из облака легла поверх списка: числа в панели данных пора переспросить. Своё состояние панель копии ведёт сама.
function onCloudChanged(): void {
  void readState()
}

/** Ник запоминается сразу по уходу из поля, а не только после переноса: набирать
 * его заново на телевизоре пультом — то ещё удовольствие. */
function onShikiNick(): void {
  const clean = shikiNick.value.trim()
  shikiNick.value = clean
  void saveSetting('shikiNick', 'am_shiki_nick', clean)
}

/** Нажатие на перенос с Шикимори: сначала вопрос, действие потом. */
function onShikiAsk(): void {
  shikiError.value = ''
  detail.value = 'import'
}

function showReport(): void {
  reportPage.value = 0
  detail.value = 'report'
}

function showTags(): void {
  tagPage.value = 0
  detail.value = 'tags'
}

/** Перенос списка с Шикимори по нику. Способы те же два, и вопрос тот же: замена вычищает
 * всё, включая перенесённое с AniList и добавленное руками. */
function onShikiPull(mode: PullMode): void {
  if (shikiBusy.value) return
  detail.value = null

  void (async () => {
    shikiBusy.value = true
    shikiError.value = ''

    try {
      // Ник сохраняется до переноса, а не после: перенос долгий, и уйти с экрана посреди него человек вправе.
      onShikiNick()

      const done = await pullFromShikimori(shikiNick.value, mode)
      await readState()

      shikiReport.value = done
      if (openDoor.value === 'list' && detail.value === null) showReport()
    } catch (e) {
      shikiError.value = describe(e)
      if (openDoor.value === 'list' && detail.value === null) detail.value = 'import-error'
    } finally {
      shikiBusy.value = false
    }
  })()
}

/** Нажатие на удаление списка: тоже только вопрос, без действия. */
function onAskDrop(): void {
  note.value = ''
  error.value = ''
  detail.value = 'drop'
}

/** Удаление своего списка по прямой просьбе. Счёт при этом не трогается: список можно
 * стереть и перенести заново. На AniList это не отражается: удаляем только то, что у нас. */
function onDropList(): void {
  detail.value = null

  void guard(
    async () => {
      note.value = ''
      await forgetCollection()
      await readState()
      note.value = 'Список удалён.'
    },
    // Кнопки вопроса к этому моменту нет, а своей «Удалить» тоже не будет — список пуст. Фокус остаётся в панели: на «Очистить память», единственной живой рядом.
    () => clearBtn.value,
  )
}

/** Переключение показа взрослого: отбор читает ключ в момент вопроса, перезапуск не нужен.
 * Исключение —
 * полки витрины: состав собран заранее, тумблер выбрасывает его через clearHidden. */
function applyAdultMode(next: typeof settings.adultMode): void {
  adultMode.value = next
  void saveSetting('adultMode', 'set_adult_mode', next)
  void saveSetting('showAdult', 'set_adult', next === 'none')
  void clearHidden()
}

function setAdultMode(next: typeof settings.adultMode): void {
  if (next === adultMode.value) return
  // Leaving full filtering always asks again, even after an earlier successful check.
  if (adultMode.value === 'full' && next !== 'full') {
    pendingAdultMode.value = next
    birth.value = ''
    ageError.value = ''
    detail.value = 'age'
    return
  }
  applyAdultMode(next)
}

function onBirth(value: string): void {
  birth.value = value
  if (value === '') return
  if (!adultByBirth(value)) {
    ageError.value = 'В доступе отказано'
    return
  }
  ageVerified.value = true
  void saveSetting('adultAgeVerified', 'set_adult_age_verified', true)
  const next = pendingAdultMode.value ?? adultMode.value
  pendingAdultMode.value = null
  closeAge()
  applyAdultMode(next)
}

function saveAdultTagRules(): void {
  void saveSetting('adultTagRules', 'set_adult_tag_rules', copyAdultTagRules(adultTagRules.value))
}
function updateAdultTagRule(
  name: string,
  field: 'threshold' | 'hideInPartial',
  value: number | boolean,
): void {
  const current = adultTagRules.value[name] ?? { threshold: 70, hideInPartial: false }
  adultTagRules.value[name] = {
    ...current,
    [field]: field === 'threshold' ? Math.max(0, Math.min(100, Math.round(Number(value)))) : value,
  }
  saveAdultTagRules()
}

/** На телевизоре ползунок не даёт надёжного управления с D-pad: шаг и положение ручки
 * трудно поймать с расстояния. Крупные кнопки меняют порог фиксированным шагом. */
function adjustAdultTagThreshold(name: string, delta: number): void {
  const current = adultTagRules.value[name] ?? { threshold: 70, hideInPartial: false }
  updateAdultTagRule(name, 'threshold', current.threshold + delta)
}

function toggleAdultTagRule(name: string): void {
  const current = adultTagRules.value[name] ?? { threshold: 70, hideInPartial: false }
  updateAdultTagRule(name, 'hideInPartial', !current.hideInPartial)
}

/** Отказ от вопроса: тумблер остаётся выключенным, и это его настоящее состояние. */
function closeAge(): void {
  detail.value = null
  pendingAdultMode.value = null
  birth.value = ''
  ageError.value = ''
}

// Память сбрасывается только руками. Перезагрузка не делается сама: человек может быть в середине правок.
function onClear(): void {
  detail.value = null
  void guard(
    async () => {
      note.value = ''
      await clearCache()
      cleared.value = true
      await readState()
      note.value = 'Кэш очищен'
    },
    () => clearBtn.value,
  )
}

function onReload(): void {
  void Bridge.shell.reload()
}

/// Возраст сборки в днях. null — когда дата не читается: «NaN дней назад» хуже, чем отсутствие возраста.
function daysSince(iso: string): number | null {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 86400000)
}

/// Возраст словами: «собран сегодня», «1 день назад», «6 дней назад». Развёрнуто, а не вложенными тернарниками: падежи русских числительных в одну строку не читаются.
function ageText(days: number): string {
  if (days <= 0) return 'собран сегодня'

  const tail = days % 100
  const last = days % 10
  let word = 'дней'
  if (tail < 11 || tail > 19) {
    if (last === 1) word = 'день'
    else if (last >= 2 && last <= 4) word = 'дня'
  }

  return `${days} ${word} назад`
}

onMounted(() => {
  void readState()
})
</script>

<template>
  <section class="am-page am-settings-page">
    <h1 class="am-settings-title">Настройки</h1>
    <div ref="doorGrid" class="am-doors">
      <button
        v-for="item in doors"
        :key="item.name"
        class="am-door"
        type="button"
        :data-door="item.name"
        @click="openDoor = item.name"
      >
        <span class="am-door__mark"><SettingMark :name="item.name" /></span>
        <span class="am-door__name">{{ item.title }}</span>
      </button>
    </div>

    <SettingsSheet
      :open="openDoor !== null"
      :title="doors.find((item) => item.name === openDoor)?.title ?? ''"
      :icon="openDoor ?? undefined"
      :initial-focus="doorFocus"
      close-label="К разделам"
      @close="closeDoor"
    >
      <template v-if="openDoor === 'list'">
        <dl class="am-settings-facts">
          <div>
            <dt>Источник</dt>
            <dd>Шикимори</dd>
          </div>
          <div>
            <dt>Текущий список</dt>
            <dd>{{ listCount }} записей</dd>
          </div>
        </dl>

        <div class="am-settings-form">
          <label class="am-settings-field">
            <span>Имя пользователя</span>
            <input
              v-model="shikiNick"
              class="am-input"
              type="text"
              :disabled="shikiBusy"
              @change="onShikiNick"
            />
          </label>
          <button
            ref="shikiBtn"
            class="am-btn am-btn--soft am-shiki-import"
            type="button"
            :disabled="shikiBusy || !shikiNick.trim()"
            :aria-busy="shikiBusy"
            @click="onShikiAsk"
          >
            <span v-if="shikiBusy" class="am-shiki-import__spin" aria-hidden="true" />
            {{ shikiBusy ? 'Переносим…' : 'Перенести список' }}
          </button>
        </div>

        <p v-if="shikiBusy" class="am-meta" role="status">Идёт перенос, не закрывайте окно.</p>
        <div v-if="shikiReport || shikiError" class="am-settings-actions">
          <button
            v-if="shikiReport"
            ref="shikiReportButton"
            class="am-btn"
            type="button"
            @click="showReport"
          >
            Последний отчёт
          </button>
          <button
            v-if="shikiError"
            class="am-btn am-settings-danger"
            type="button"
            @click="detail = 'import-error'"
          >
            Ошибка переноса
          </button>
        </div>
      </template>

      <template v-else-if="openDoor === 'data'">
        <dl class="am-settings-facts">
          <div>
            <dt>Записей в списке</dt>
            <dd>{{ listCount }}</dd>
          </div>
          <div v-if="usedSize">
            <dt>Занято на диске</dt>
            <dd>{{ usedSize }}</dd>
          </div>
        </dl>
        <div class="am-settings-actions">
          <button
            ref="clearBtn"
            class="am-btn"
            type="button"
            :disabled="busy"
            @click="detail = 'clear'"
          >
            <SettingMark name="eraser" /> Очистить кэш
          </button>
          <button
            v-if="listCount > 0"
            class="am-btn am-settings-danger"
            type="button"
            :disabled="busy"
            @click="onAskDrop"
          >
            <SettingMark name="trash" /> Удалить список
          </button>
          <button v-if="cleared" class="am-btn" type="button" @click="onReload">
            <SettingMark name="reload" /> Перезагрузить
          </button>
        </div>
        <p v-if="note" class="am-note" role="status">{{ note }}</p>
        <p v-if="error" class="am-error" role="alert">{{ error }}</p>
      </template>

      <template v-else-if="openDoor === 'look'">
        <div
          class="am-skins"
          role="group"
          aria-label="Цветовая тема"
          @keydown.down.stop.prevent="focusLookOption($event, '.am-family__btn--on')"
        >
          <button
            v-for="item in APPEARANCES"
            :key="item.name"
            class="am-skins__btn"
            :class="{ 'am-skins__btn--on': item.name === appearance }"
            type="button"
            :aria-pressed="item.name === appearance"
            @click="setAppearance(item.name)"
          >
            <span class="am-skins__mark" aria-hidden="true">{{ item.mark }}</span>
            <span class="am-skins__name">{{ item.title }}</span>
          </button>
        </div>
        <div
          class="am-family"
          role="group"
          aria-label="Скин"
          @keydown.up.stop.prevent="focusLookOption($event, '.am-skins__btn--on')"
        >
          <button
            class="am-family__btn"
            :class="{ 'am-family__btn--on': visualTheme === 'standard' }"
            type="button"
            :aria-pressed="visualTheme === 'standard'"
            @click="setVisualTheme('standard')"
          >
            Стандартная
          </button>
          <button
            class="am-family__btn"
            :class="{ 'am-family__btn--on': visualTheme === 'lain' }"
            type="button"
            :aria-pressed="visualTheme === 'lain'"
            @click="setVisualTheme('lain')"
          >
            Lain
          </button>
        </div>
      </template>

      <template v-else-if="openDoor === 'adult'">
        <div class="am-adult-control" role="radiogroup" aria-label="Фильтрация контента 18+">
          <button
            v-for="mode in adultModes"
            :key="mode.value"
            class="am-adult-mode"
            :class="{ 'am-adult-mode--active': adultMode === mode.value }"
            type="button"
            role="radio"
            :aria-checked="adultMode === mode.value"
            @click="setAdultMode(mode.value)"
          >
            <span class="am-adult-chip" :class="`am-adult-chip--${mode.chip}`" aria-hidden="true"
              >18+</span
            >
            {{ mode.title }}
          </button>
        </div>

        <template v-if="ageVerified && adultMode !== 'full'">
          <p class="am-meta">
            {{
              adultMode === 'partial'
                ? 'Тайтлы с красной меткой скрыты. Для синих тегов действуют выбранные правила и пороги.'
                : 'Тайтлы с обеими метками доступны.'
            }}
          </p>
          <div class="am-adult-note">
            <p>
              <span class="am-adult-chip am-adult-chip--red" aria-label="Красная метка 18+"
                >18+</span
              >
              <span>Хентай и сексуальный контент по метке AniList.</span>
            </p>
            <p>
              <span class="am-adult-chip am-adult-chip--blue" aria-label="Синяя метка 18+"
                >18+</span
              >
              <span>Теги потенциально неприемлемого контента. Например, нагота.</span>
            </p>
          </div>
          <div v-if="adultMode === 'partial'" class="am-settings-actions">
            <button ref="tagButton" class="am-btn" type="button" @click="showTags">
              Настроить теги
            </button>
          </div>
        </template>
      </template>

      <CloudBox v-else-if="openDoor === 'cloud'" :list="listCount" @changed="onCloudChanged" />
      <ProxyBox v-else-if="openDoor === 'net'" />

      <template v-else-if="openDoor === 'about'">
        <dl class="am-settings-facts">
          <div>
            <dt>Версия</dt>
            <dd>{{ version }}</dd>
          </div>
          <div>
            <dt>Система</dt>
            <dd>{{ system }}</dd>
          </div>
          <div>
            <dt>База названий</dt>
            <dd :class="{ 'am-fact__value--stale': datasetStale }">{{ datasetText }}</dd>
          </div>
        </dl>
        <div class="am-settings-actions">
          <button
            ref="upBtn"
            class="am-btn"
            :class="{ 'am-btn--soft': updateOffer !== null }"
            type="button"
            :disabled="upBusy"
            @click="updateOffer !== null ? onUpInstall() : onUpCheck()"
          >
            {{
              upBusy
                ? 'Проверяем обновления…'
                : updateOffer
                  ? `Обновление до ${updateOffer.version}`
                  : 'Проверить обновления'
            }}
          </button>
          <CreditsBox />
        </div>
        <p v-if="upNote" class="am-note" role="status">{{ upNote }}</p>
        <p v-if="datasetStale" class="am-stale">
          База названий устарела.
          <button v-if="outside" class="am-link" type="button" @click="onDatasetLink">
            Открыть animori-data
          </button>
        </p>
      </template>

      <SettingsSheet
        :open="detail === 'import'"
        title="Перенос с Шикимори"
        icon="list"
        initial-focus=".am-settings-cancel"
        detail
        @close="detail = null"
      >
        <dl class="am-settings-facts">
          <div>
            <dt>Профиль</dt>
            <dd>{{ shikiNick.trim() }}</dd>
          </div>
          <div>
            <dt>Текущий список</dt>
            <dd>{{ listCount }} записей</dd>
          </div>
        </dl>
        <p class="am-meta">При замене текущий список будет удалён.</p>
        <template #actions>
          <button class="am-btn am-settings-cancel" type="button" @click="detail = null">
            Отмена
          </button>
          <button class="am-btn am-settings-danger" type="button" @click="onShikiPull('replace')">
            Заменить список
          </button>
          <button class="am-btn am-btn--soft" type="button" @click="onShikiPull('merge')">
            Дополнить список
          </button>
        </template>
      </SettingsSheet>

      <SettingsSheet
        :open="detail === 'report'"
        v-model:page="reportPage"
        :page-count="reportPages"
        :return-focus="() => shikiReportButton"
        title="Отчёт о переносе"
        icon="list"
        detail
        @close="detail = null"
      >
        <template v-if="shikiReport">
          <dl v-if="reportPage === 0" class="am-settings-facts">
            <div>
              <dt>Профиль Шикимори</dt>
              <dd>{{ shikiReport.nick }}</dd>
            </div>
            <div>
              <dt>Записей в списке</dt>
              <dd>{{ shikiReport.total }}</dd>
            </div>
            <div v-if="shikiReport.mode === 'merge'">
              <dt>Добавлено / обновлено</dt>
              <dd>{{ shikiReport.added }} / {{ shikiReport.updated }}</dd>
            </div>
            <div v-else>
              <dt>Результат</dt>
              <dd>Список заменён</dd>
            </div>
            <div>
              <dt>Перенесено дат просмотра</dt>
              <dd>{{ shikiReport.dated }}</dd>
            </div>
            <div>
              <dt>Без соответствия в AniList</dt>
              <dd>{{ shikiReport.lost }}</dd>
            </div>
          </dl>
          <template v-else>
            <p class="am-meta">Без соответствия в AniList</p>
            <ul class="am-settings-list">
              <li v-for="(title, index) in reportTitles" :key="index">{{ title }}</li>
            </ul>
            <p
              v-if="
                reportPage + 1 === reportPages && shikiReport.lost > shikiReport.lostTitles.length
              "
              class="am-meta"
            >
              Других записей без соответствия:
              {{ shikiReport.lost - shikiReport.lostTitles.length }}
            </p>
          </template>
        </template>
      </SettingsSheet>

      <SettingsSheet
        :open="detail === 'import-error'"
        :return-focus="() => shikiBtn"
        title="Ошибка переноса"
        detail
        compact
        @close="detail = null"
      >
        <p class="am-error" role="alert">{{ shikiError }}</p>
      </SettingsSheet>

      <SettingsSheet
        :open="detail === 'clear' || detail === 'drop'"
        :title="detail === 'drop' ? 'Удалить список?' : 'Очистить кэш?'"
        initial-focus=".am-settings-cancel"
        detail
        compact
        @close="detail = null"
      >
        <p v-if="detail === 'drop'" class="am-meta">
          Будет удалено записей: {{ listCount }}. Действие необратимо.
        </p>
        <p v-else class="am-meta">Постеры и описания загрузятся заново.</p>
        <template #actions>
          <button class="am-btn am-settings-cancel" type="button" @click="detail = null">
            Отмена
          </button>
          <button
            v-if="detail === 'drop'"
            class="am-btn am-settings-danger"
            type="button"
            :disabled="busy"
            @click="onDropList"
          >
            <SettingMark name="trash" /> Удалить список
          </button>
          <button
            v-else
            class="am-btn am-btn--soft"
            type="button"
            :disabled="busy"
            @click="onClear"
          >
            <SettingMark name="eraser" /> Очистить
          </button>
        </template>
      </SettingsSheet>

      <SettingsSheet
        :open="detail === 'tags'"
        v-model:page="tagPage"
        :page-count="tagPages"
        :return-focus="() => tagButton"
        title="Настройка тегов"
        icon="adult"
        detail
        @close="detail = null"
      >
        <p class="am-adult-tag-hint">
          <span class="am-adult-chip am-adult-chip--blue">18+</span>
          <span>Тайтл скрывается, когда доля выбранного тега достигает порога.</span>
        </p>
        <div class="am-adult-tag-list">
          <div v-for="[name, rule] in shownTags" :key="name" class="am-adult-tag">
            <span class="am-adult-tag__name">{{ tagWord(name) }}</span>
            <div class="am-adult-tag__controls">
              <button
                class="am-btn am-adult-tag__toggle"
                :aria-pressed="rule.hideInPartial"
                :aria-label="`${tagWord(name)}: ${rule.hideInPartial ? 'скрывать' : 'показывать'}`"
                type="button"
                @click="toggleAdultTagRule(name)"
              >
                {{ rule.hideInPartial ? 'Скрывать' : 'Показывать' }}
              </button>
              <button
                class="am-btn am-adult-tag__step"
                type="button"
                :aria-label="`Уменьшить порог: ${tagWord(name)}`"
                @click="adjustAdultTagThreshold(name, -5)"
              >
                −
              </button>
              <output>{{ rule.threshold }}%</output>
              <button
                class="am-btn am-adult-tag__step"
                type="button"
                :aria-label="`Увеличить порог: ${tagWord(name)}`"
                @click="adjustAdultTagThreshold(name, 5)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </SettingsSheet>

      <SettingsSheet
        :open="detail === 'age'"
        title="Подтверждение возраста"
        icon="adult"
        initial-focus="input"
        close-label="Отмена"
        detail
        compact
        @close="closeAge"
      >
        <DateField :value="birth" title="Дата рождения" @pick="onBirth" />
        <p v-if="ageError" class="am-error" role="alert">{{ ageError }}</p>
      </SettingsSheet>
    </SettingsSheet>
  </section>
</template>

<style scoped src="./settings-screen.css"></style>
