<script setup lang="ts">
// Облачная копия своим узлом: место, вход, копия туда и обратно; каждую кнопку нажимает человек.
// Запись поверх незнакомой копии спрашивает; чтение по ссылке не требует ни пропуска, ни места.
import { onMounted, ref } from 'vue'

import { Bridge } from '@/bridge'
import { amCopy } from '@/utils/dom'
import {
  checkChosenPlace,
  connectPlace,
  disconnectPlace,
  choosePlace,
  cloudPathText,
  copyInfo,
  linkInfo,
  pullByLink,
  pullCopy,
  saveCopy,
  shareCopy,
  unshareCopy,
  type CloudLink,
  type CloudStranger,
} from '@/core/cloud'
import type { PullMode } from '@/core/collection'
import { settings } from '@/core/settings'

import BrandMark from './BrandMark.vue'
import CloudHelp from './CloudHelp.vue'
import TileMark from './TileMark.vue'

const props = defineProps<{
  /** Записей в списке сейчас: это число стоит в вопросах перед заменой. */
  list: number
  /** Как звать это устройство в файле копии. */
  device: string
}>()

/** Список сменился: копия легла поверх, и числа снаружи пора переспросить. */
const emit = defineEmits<{ changed: [] }>()

/** Где лежит копия. Списывается с настроек один раз: объект настроек не реактивен. */
const cloudPlace = ref(settings.cloudPlace)

/** Есть ли сохранённый пропуск. Хранится признак, а не сам пропуск: в разметку ему попадать незачем. */
const cloudSaved = ref(settings.cloudConnected)

/** Вставленный, но ещё не проверенный пропуск. Живёт только до сохранения. */
const tokenDraft = ref('')

/** Открыто ли поле пропуска при уже сохранённом: смена бывает редко. */
const tokenOpen = ref(false)

const cloudSavedAt = ref(settings.cloudSavedAt)
const cloudSavedCount = ref(settings.cloudSavedCount)

/** Что лежит в облаке сейчас, строкой. Пустая строка — «не спрашивали». */
const cloudThere = ref('')

/** Ссылка на нашу копию. В настройках не хранится: публикация может пропасть при перезаписи,
 *  поэтому ссылку всегда спрашивают у облака заново. */
const shareLink = ref('')

/** Ссылка, введённая для чтения чужой копии. */
const linkDraft = ref('')

/** Что нашлось по введённой ссылке. null — ещё не искали или не нашли. */
const linkFound = ref<CloudLink | null>(null)

/** Открыта ли справка. Состояние здесь, а не внутри неё: нажимают отсюда. */
const helpOpen = ref(false)

// Своя заметка и своя ошибка: отказ облака не должен красить соседние панели
// настроек и затирать их ответы.
const cloudNote = ref('')
const cloudError = ref('')
const cloudBusy = ref(false)

/** Спрошено ли подтверждение перед тем, как копия ляжет поверх списка. */
const askingCloud = ref(false)

/** Незнакомая копия, найденная перед записью; null — вопроса нет. Хранится сама находка:
 *  размер и время чужой копии — то, по чему человек решает, замещать её или забрать. */
const strangerAsk = ref<CloudStranger | null>(null)

const panelOpen = ref(false)

function togglePanel(): void {
  panelOpen.value = !panelOpen.value
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/// Ошибки показываются рядом с кнопкой, а не глотаются: молчаливый catch
/// здесь означал бы кнопку, которая не делает ничего и не говорит почему.
async function cloudGuard(action: () => Promise<void>): Promise<void> {
  cloudBusy.value = true
  cloudError.value = ''
  try {
    await action()
  } catch (e) {
    cloudError.value = describe(e)
  } finally {
    cloudBusy.value = false
  }
}

/** Готово ли облако к работе: место выбрано и пропуск к нему сохранён. */
function cloudOn(): boolean {
  return cloudPlace.value === 'yandex' && cloudSaved.value
}

/** Показывать ли поле пропуска: пока его нет или пока меняют руками. */
function tokenNeeded(): boolean {
  return cloudPlace.value === 'yandex' && (!cloudSaved.value || tokenOpen.value)
}

/// Подпись под названием площадки: одна строка на все состояния,
/// а не три абзаца в разных местах панели, как раньше.
function placeNote(): string {
  if (!cloudOn() || cloudThere.value === '') return ''
  return `В облаке: ${cloudThere.value}`
}

/// Время человеку — местное и словами. Ноль и нечитаемая дата дают прочерк:
/// «1 января 1970» на месте «копии не было» хуже пустоты.
function whenText(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString('ru-RU')
}

/// Размер копии в килобайтах: байты человеку ничего не говорят, а мегабайта
/// список не набирает даже в тысячу записей.
function sizeText(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`
}

/// Чужая копия одной строкой: размер и время правки. Ровно те два числа,
/// по которым видно, свежее там или старее нашего.
function strangerText(found: CloudStranger): string {
  const when = found.modified === null ? '' : ` · ${whenText(Date.parse(found.modified))}`
  return `${sizeText(found.bytes)}${when}`
}

/// Хвост ссылки: то немногое, что придётся набирать пультом. Ядро принимает
/// и хвост, и ссылку целиком, поэтому показываем короткое.
function linkTail(link: string): string {
  const cut = link.replace(/\/+$/, '')
  return cut.slice(cut.lastIndexOf('/') + 1)
}

/** Спрашивает облако, что там лежит. Отказ не кричит: это строка факта, а не ответ на нажатие;
 *  красная надпись пугала бы там, где всего лишь нет сети. Кнопки ниже скажут громко. */
async function readCloud(): Promise<void> {
  if (!cloudOn()) {
    cloudThere.value = ''
    shareLink.value = ''
    return
  }

  const got = await copyInfo()
  if (!got.ok) {
    cloudThere.value = 'не удалось проверить копию'
    return
  }

  // Ссылка приходит вместе со сведениями о файле: отдельный запрос ради неё
  // был бы лишним, а пропавшую публикацию видно сразу.
  shareLink.value = got.value.share ?? ''

  if (!got.value.there) {
    cloudThere.value = 'копии нет'
    return
  }

  const when = got.value.modified === null ? '' : ` · ${whenText(Date.parse(got.value.modified))}`
  cloudThere.value = `${sizeText(got.value.bytes)}${when}`
}

/** Подключение площадки. Смена места стирает память о чужой копии и прошлые числа:
 *  в другом облаке другой файл. Здесь остаётся переспросить и открыть поле пропуска. */
function onConnect(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''
    strangerAsk.value = null

    if (cloudPlace.value !== 'yandex') {
      await choosePlace('yandex')
      cloudPlace.value = 'yandex'
      cloudSavedAt.value = settings.cloudSavedAt
      cloudSavedCount.value = settings.cloudSavedCount
      cloudThere.value = ''
      shareLink.value = ''
    }

    tokenOpen.value = true
    await readCloud()
  })
}

/** Проверка и сохранение пропуска. Проверяется ДО записи: молча запомнить негодную строку —
 *  соврать, что облако подключено. */
function onCloudToken(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''

    const token = tokenDraft.value.trim()
    const done = await connectPlace(token)
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    cloudSaved.value = true
    tokenDraft.value = ''
    tokenOpen.value = false
    cloudNote.value = 'Яндекс Диск подключён'
    await readCloud()
  })
}

/// Отказ от смены пропуска. Черновик стирается: недонабранная строка,
/// всплывшая через месяц, читалась бы как сохранённый пропуск.
function onTokenCancel(): void {
  tokenDraft.value = ''
  tokenOpen.value = false
}

/** Проверка связи по кнопке: пропуск можно отозвать со стороны, и узнать об этом лучше сейчас. */
function onCloudCheck(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''

    const done = await checkChosenPlace()
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    cloudNote.value = 'Яндекс Диск доступен'
    await readCloud()
  })
}

/** Запись копии: метка устройства идёт в файл, чтобы на ТВ было видно, с какой машины копия.
 *  Отказ двух видов: незнакомая копия — вопрос в своём узле, всё прочее — красная строка. */
async function writeCopy(force: boolean): Promise<void> {
  cloudNote.value = ''

  const done = await saveCopy(props.device, force)
  if (!done.ok) {
    if (done.stranger !== undefined) {
      strangerAsk.value = done.stranger
      return
    }

    cloudError.value = done.problem
    return
  }

  strangerAsk.value = null
  cloudSavedAt.value = done.value.savedAt
  cloudSavedCount.value = done.value.count
  cloudNote.value = `Копия сохранена: записей ${done.value.count}, ${sizeText(done.value.bytes)}.`
  await readCloud()
}

function onCloudSave(): void {
  strangerAsk.value = null
  void cloudGuard(() => writeCopy(false))
}

/** «Заменить»: та же запись, но с явным разрешением затереть чужую копию. */
function onCloudReplace(): void {
  strangerAsk.value = null
  void cloudGuard(() => writeCopy(true))
}

/// «Восстановить копию»: вопрос сменяется вопросом о способе, ничего не записывается —
/// человек почти всегда хочет сперва увидеть чужие записи у себя.
function onStrangerPull(): void {
  strangerAsk.value = null
  onCloudAsk()
}

function onStrangerCancel(): void {
  strangerAsk.value = null
}

/** Нажатие «Забрать»: сначала вопрос — копия ляжет поверх живого списка. */
function onCloudAsk(): void {
  cloudNote.value = ''
  cloudError.value = ''
  askingCloud.value = true
}

function onCloudCancel(): void {
  askingCloud.value = false
}

/** Возвращение копии. Числа как у переноса с AniList: после слияния важно,
 *  что стало с набранным здесь, а не общее число. */
function onCloudPull(mode: PullMode): void {
  askingCloud.value = false

  void cloudGuard(async () => {
    cloudNote.value = ''

    const done = await pullCopy(mode)
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    // Список сменился: числа снаружи переспрашивает тот, кто их показывает.
    emit('changed')

    // Прочитанная копия теперь знакомая, и панель говорит о ней же:
    // числа обновляет ядро, здесь остаётся их переспросить.
    cloudSavedAt.value = settings.cloudSavedAt
    cloudSavedCount.value = settings.cloudSavedCount

    cloudNote.value = pullText(done.value)
    await readCloud()
  })
}

/// Итог возвращения словами. Один текст на оба пути — по пропуску и по ссылке:
/// разница и так видна по нажатой кнопке.
function pullText(got: {
  mode: PullMode
  total: number
  added: number
  updated: number
  kept: number
  onlyHere: number
  dropped: number
  from: { device: string }
}): string {
  const from = got.from.device === '' ? '' : ` Копия с устройства «${got.from.device}».`
  const lost = got.dropped > 0 ? ` Битых записей в копии: ${got.dropped} — их пропустили.` : ''

  return got.mode === 'replace'
    ? `Список замещён копией: записей ${got.total}.${from}${lost}`
    : `Копия приложена: всего ${got.total}, новых ${got.added}, ` +
        `обновлено ${got.updated}, своих правок сохранено ${got.kept}, ` +
        `только здесь ${got.onlyHere}.${from}${lost}`
}

/** Публикация копии: единственное место, где список доступен кому-то ещё, — предупреждение под ссылкой.
 *  Повторное нажатие законно и вернёт ту же ссылку, если перезапись файла сбросила публикацию. */
function onShare(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''

    const done = await shareCopy()
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    shareLink.value = done.value
    cloudNote.value = 'Ссылка создана'
  })
}

/** Закрытие доступа. Сам файл копии остаётся на месте и в работе. */
function onUnshare(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''

    const done = await unshareCopy()
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    shareLink.value = ''
    cloudNote.value = 'Доступ по ссылке закрыт'
  })
}

/** Адрес ссылки открывает оболочка: по нему браузер просто скачает файл. */
function onShareOpen(): void {
  if (shareLink.value === '') return
  void Bridge.shell.openExternal(shareLink.value)
}

/** Поиск копии по ссылке: пропуска не требует — на этом держится первый запуск без клавиатуры.
 *  Сперва показываются размер и время, и только потом предлагается положить копию поверх списка. */
function onLinkFind(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''
    linkFound.value = null

    const done = await linkInfo(linkDraft.value.trim())
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    linkFound.value = done.value
  })
}

function onLinkCancel(): void {
  linkFound.value = null
}

/** Чтение по ссылке. Отметок о своей копии не двигает: их у читателя нет. */
function onLinkPull(mode: PullMode): void {
  const found = linkFound.value
  if (found === null) return

  linkFound.value = null

  void cloudGuard(async () => {
    cloudNote.value = ''

    const done = await pullByLink(found.key, mode)
    if (!done.ok) {
      cloudError.value = done.problem
      return
    }

    emit('changed')
    linkDraft.value = ''
    cloudNote.value = pullText(done.value)
  })
}

/** Отключение облака: файл на Диске остаётся нетронутым — стирать чужое хранилище программа не вправе.
 *  Память о правке стирается с пропуском: с новым пропуском прежняя метка выдала бы чужую копию за свою. */
function onCloudForget(): void {
  void cloudGuard(async () => {
    cloudNote.value = ''

    const gone = await disconnectPlace()
    if (!gone.ok) {
      cloudError.value = gone.problem
      return
    }
    await choosePlace('none')

    cloudPlace.value = 'none'
    cloudSaved.value = false
    cloudSavedAt.value = 0
    cloudSavedCount.value = 0
    cloudThere.value = ''
    shareLink.value = ''
    tokenDraft.value = ''
    tokenOpen.value = false
    strangerAsk.value = null

    cloudNote.value = 'Яндекс Диск отключён'
  })
}

onMounted(() => {
  void readCloud()
})
</script>

<template>
  <div class="am-panel am-box" :class="{ 'am-panel--closed': !panelOpen }">
    <div
      class="am-bar am-panel__title"
      role="button"
      tabindex="0"
      :aria-expanded="panelOpen"
      @click="togglePanel"
      @keydown.enter.prevent="togglePanel"
      @keydown.space.prevent="togglePanel"
    >
      <h3 class="am-h3"><TileMark name="cloud" /> Облачная копия</h3>
      <span class="am-bar__gap" />
      <span class="am-flag" :class="{ 'am-flag--on': cloudOn() }">
        <span class="am-flag__dot" aria-hidden="true" />
        {{ cloudOn() ? 'подключено' : 'не подключено' }}
      </span>
    </div>

    <!-- Площадка строкой: знак, название, состояние и действия; служебные — значками с подсказками.
         Знак — components/BrandMark.vue: фирменного вектора Диска нет, узнаваемость даёт плита цвета. -->
    <div class="am-place">
      <BrandMark class="am-place__mark" name="yandex-disk" />

      <span class="am-place__text">
        <span class="am-place__name">Яндекс Диск</span>
        <span v-if="placeNote()" class="am-place__note">{{ placeNote() }}</span>
      </span>

      <button
        v-tip="'Справка по облачной копии'"
        class="am-icon"
        type="button"
        aria-label="Справка по облачной копии"
        @click="helpOpen = true"
      >
        i
      </button>

      <span class="am-place__acts">
        <template v-if="cloudOn()">
          <button
            v-tip="'Проверить связь'"
            class="am-icon"
            type="button"
            aria-label="Проверить связь"
            :disabled="cloudBusy"
            @click="onCloudCheck"
          >
            ↻
          </button>
          <button
            v-tip="'Сменить токен'"
            class="am-icon"
            type="button"
            aria-label="Сменить токен"
            :disabled="cloudBusy || tokenOpen"
            @click="tokenOpen = true"
          >
            🔑
          </button>
          <button
            v-tip="'Отключить облако'"
            class="am-icon"
            type="button"
            aria-label="Отключить облако"
            :disabled="cloudBusy"
            @click="onCloudForget"
          >
            ✕
          </button>
        </template>

        <button
          v-else
          v-tip="'Ввести токен Яндекс Диска'"
          class="am-btn"
          type="button"
          :disabled="cloudBusy || tokenNeeded()"
          @click="onConnect"
        >
          Подключить
        </button>
      </span>
    </div>

    <p v-if="cloudPlace === 'google'" class="am-meta">
      Подключите Яндекс Диск для новых копий. Предыдущая копия осталась на Google Диске.
    </p>

    <template v-if="tokenNeeded()">
      <div class="am-row">
        <label class="am-field">
          <input
            v-model="tokenDraft"
            class="am-input"
            type="password"
            aria-label="Токен Яндекс Диска"
            placeholder="Токен Яндекс Диска"
          />
        </label>
        <button
          class="am-btn"
          type="button"
          :disabled="cloudBusy || !tokenDraft.trim()"
          @click="onCloudToken"
        >
          {{ cloudBusy ? 'Проверяем…' : 'Проверить и сохранить' }}
        </button>
        <button
          v-if="cloudSaved"
          class="am-btn am-btn--ghost"
          type="button"
          :disabled="cloudBusy"
          @click="onTokenCancel"
        >
          Отмена
        </button>
      </div>
    </template>

    <template v-if="cloudPlace === 'yandex'">
      <!-- То, что делают каждый день: две крупные кнопки со значком направления —
           общепринятый лоток со стрелкой; направление продублировано словами. -->
      <div class="am-duo">
        <button
          class="am-duo__btn"
          type="button"
          :disabled="!cloudOn() || cloudBusy"
          @click="onCloudSave"
        >
          <svg
            class="am-duo__mark"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M12 3v13" />
            <path d="m7 8 5-5 5 5" />
          </svg>
          <span class="am-duo__name">Сохранить копию</span>
        </button>

        <button
          class="am-duo__btn"
          type="button"
          :disabled="!cloudOn() || cloudBusy"
          @click="onCloudAsk"
        >
          <svg
            class="am-duo__mark"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M12 4v13" />
            <path d="m7 12 5 5 5-5" />
          </svg>
          <span class="am-duo__name">Восстановить копию</span>
        </button>
      </div>

      <ul class="am-facts">
        <li class="am-fact">
          <span class="am-fact__name">Файл копии</span>
          <span class="am-fact__value"
            ><code>{{ cloudPathText() }}</code></span
          >
        </li>
        <li class="am-fact">
          <span class="am-fact__name">Последняя копия</span>
          <span class="am-fact__value">{{ whenText(cloudSavedAt) }}</span>
        </li>
        <li class="am-fact">
          <span class="am-fact__name">Записей в копии</span>
          <span class="am-fact__value">
            {{ cloudSavedCount > 0 ? cloudSavedCount : '—' }}
          </span>
        </li>
      </ul>

      <!-- Незнакомая копия: узел вопроса как у переноса, но первым стоит «Восстановить копию» —
           предлагать необратимую замену главной кнопкой значило бы толкать под руку. -->
      <div v-if="strangerAsk" class="am-ask">
        <p class="am-ask__text">
          Найдена копия с другого устройства: {{ strangerText(strangerAsk) }}. Здесь записей:
          {{ list }}.
        </p>

        <div class="am-row">
          <button class="am-btn" type="button" :disabled="cloudBusy" @click="onStrangerPull">
            Восстановить копию
          </button>
          <button
            v-tip="'Записать свой список поверх. Чужую копию не вернуть'"
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="cloudBusy"
            @click="onCloudReplace"
          >
            Заменить копию
          </button>
          <button class="am-btn am-btn--ghost" type="button" @click="onStrangerCancel">
            Отмена
          </button>
        </div>
      </div>

      <!-- Копия ложится поверх живого списка: спрашиваем всегда, теми же
           словами и тем же узлом, что и перенос с AniList. -->
      <div v-if="askingCloud" class="am-ask">
        <p class="am-ask__text">При замене текущие записи будут удалены.</p>

        <div class="am-row">
          <button class="am-btn" type="button" :disabled="cloudBusy" @click="onCloudPull('merge')">
            Добавить недостающие записи
          </button>
          <button
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="cloudBusy"
            @click="onCloudPull('replace')"
          >
            Заменить текущий список
          </button>
          <button class="am-btn am-btn--ghost" type="button" @click="onCloudCancel">Отмена</button>
        </div>
      </div>

      <!-- Ссылка своим разделом: это не ещё одна кнопка в общем ряду,
           а единственное место, где список открывается кому-то ещё. -->
      <template v-if="cloudOn()">
        <p class="am-sub">Ссылка для телевизора</p>
        <p class="am-meta">
          {{
            shareLink
              ? 'Копия доступна всем, у кого есть ссылка.'
              : 'После публикации копия будет доступна всем, у кого есть ссылка.'
          }}
        </p>

        <div class="am-row">
          <button
            v-if="!shareLink"
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="cloudBusy"
            @click="onShare"
          >
            Создать ссылку
          </button>

          <template v-else>
            <label class="am-field">
              <input class="am-input" type="text" readonly :value="shareLink" />
            </label>
            <button
              v-tip="'Скопировать ссылку'"
              class="am-icon am-cloud-copy"
              type="button"
              aria-label="Скопировать ссылку"
              @click="amCopy(shareLink, $event.currentTarget as HTMLElement)"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
              </svg>
            </button>
            <button
              v-tip="'Открыть ссылку в браузере'"
              class="am-icon"
              type="button"
              aria-label="Открыть ссылку"
              @click="onShareOpen"
            >
              ↗
            </button>
            <button
              v-tip="'Закрыть доступ по ссылке. Файл копии останется на месте'"
              class="am-btn am-btn--ghost"
              type="button"
              :disabled="cloudBusy"
              @click="onUnshare"
            >
              Закрыть доступ
            </button>
          </template>
        </div>

        <p v-if="shareLink" class="am-meta">
          Код копии: <code>{{ linkTail(shareLink) }}</code>
        </p>
      </template>
    </template>

    <!-- Чтение по ссылке стоит последним и живёт отдельно от места:
         ни пропуска, ни выбранного облака оно не требует — только хвост ссылки. -->
    <p class="am-sub">Восстановить по ссылке</p>

    <div class="am-row">
      <label class="am-field">
        <input
          v-model="linkDraft"
          class="am-input"
          type="text"
          aria-label="Ссылка или код копии"
          placeholder="Ссылка или код копии"
        />
      </label>
      <button
        class="am-btn"
        type="button"
        :disabled="cloudBusy || !linkDraft.trim()"
        @click="onLinkFind"
      >
        {{ cloudBusy ? 'Поиск…' : 'Найти копию' }}
      </button>
    </div>

    <div v-if="linkFound" class="am-ask">
      <p class="am-ask__text">
        Найдена копия: {{ sizeText(linkFound.bytes)
        }}<template v-if="linkFound.modified">
          · {{ whenText(Date.parse(linkFound.modified)) }}</template
        >. При замене текущие записи ({{ list }}) будут удалены.
      </p>

      <div class="am-row">
        <button class="am-btn" type="button" :disabled="cloudBusy" @click="onLinkPull('merge')">
          Добавить недостающие записи
        </button>
        <button
          class="am-btn am-btn--ghost"
          type="button"
          :disabled="cloudBusy"
          @click="onLinkPull('replace')"
        >
          Заменить текущий список
        </button>
        <button class="am-btn am-btn--ghost" type="button" @click="onLinkCancel">Отмена</button>
      </div>
    </div>

    <p v-if="cloudError" class="am-error">{{ cloudError }}</p>
    <p v-if="cloudNote" class="am-note">{{ cloudNote }}</p>

    <!-- Справка отдельным узлом и модалкой: длинные объяснения нужны один
         раз, а в панели они стояли абзацами и мешали каждый день. -->
    <CloudHelp :open="helpOpen" :path="cloudPathText()" @close="helpOpen = false" />
  </div>
</template>

<style scoped src="../screens/settings-screen.css"></style>
