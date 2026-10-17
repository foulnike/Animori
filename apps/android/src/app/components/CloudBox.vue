<script setup lang="ts">
// Копия списка по ссылке. Из шести кнопок на приставке работает одна: пропуск под шестьдесят
// знаков пультом не набрать. Порядок обязателен: сперва показать найденное, потом класть поверх.

import { ref } from 'vue'

import { Bridge } from '@/bridge'
import { linkInfo, pullByLink, type CloudLink } from '@/core/cloud'
import type { PullMode } from '@/core/collection'

import { restoreFocus } from '../focus-return'
import { canOpenOutside } from '../platform'
import BrandMark from './BrandMark.vue'
import CloudHelp from './CloudHelp.vue'

/** Есть ли куда уводить ссылки: на приставке браузера нет, адрес показывается текстом. */
const canDocs = canOpenOutside()

/** Адрес Политики: один источник правды — файл в репозитории. */
const DOCS = { privacy: 'https://github.com/foulnike/Animori/blob/main/docs/PRIVACY.md' }

function onDoc(url: string): void {
  void Bridge.shell.openExternal(url)
}

defineProps<{
  /** Записей в списке сейчас: это число стоит в вопросе перед заменой. */
  list: number
}>()

/** Список сменился: копия легла поверх, числа снаружи пора переспросить. */
const emit = defineEmits<{ changed: [] }>()

/** Ссылка, введённая для чтения копии, или только её хвост. */
const linkDraft = ref('')

/** Что нашлось по введённой ссылке. null — ещё не искали или не нашли. */
const linkFound = ref<CloudLink | null>(null)

/** Открыта ли справка; состояние здесь, а не внутри неё — нажимают отсюда. */
const helpOpen = ref(false)

// Своя заметка и своя ошибка: отказ облака не должен красить соседние панели
// настроек и затирать их ответы.
const cloudNote = ref('')
const cloudError = ref('')
const cloudBusy = ref(false)

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/// Ошибки показываются рядом с кнопкой, а не глотаются: молчаливый catch
/// здесь означал бы кнопку, которая не делает ничего и не говорит почему.
async function cloudGuard(action: () => Promise<void>): Promise<void> {
  // Держатель запоминается до busy: кнопка гаснет disabled и отдаёт фокус, а после работы
  // обход оставил бы пульт на крестике окна — мимо строки с ответом.
  const from = document.activeElement
  cloudBusy.value = true
  cloudError.value = ''
  try {
    await action()
  } catch (e) {
    cloudError.value = describe(e)
  } finally {
    cloudBusy.value = false
    restoreFocus(from)
  }
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

/** Поиск копии по ссылке. Пропуска не требует — на этом и держится первый запуск
 * на устройстве без клавиатуры. Показать размер и время, и лишь затем предлагать замену. */
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

/** Чтение по ссылке; отметок о своей копии не двигает — их у читателя нет. */
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

/// Итог словами. Числа те же, что у переноса с Шикимори: после слияния важно
/// не общее число, а что стало с набранным здесь.
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
</script>

<template>
  <div class="am-panel am-box">
    <div class="am-bar">
      <h3 class="am-h3">Копия списка</h3>
      <span class="am-bar__gap" />
      <button
        v-tip="'Откуда взять ссылку и что набирать'"
        class="am-icon"
        type="button"
        aria-label="Как получить ссылку"
        @click="helpOpen = true"
      >
        i
      </button>
    </div>

    <!-- Строкой сервиса: знак, название, короткая заметка, под ними поле и кнопка. Знак рисует
         BrandMark.vue из src/app/brand/yandex-disk.svg — красная плита Яндекса с глифом диска. -->
    <div class="am-serv">
      <div class="am-serv__head">
        <BrandMark class="am-serv__logo" name="yandex-disk" />

        <span class="am-serv__text">
          <span class="am-serv__name">Яндекс Диск</span>
          <span class="am-serv__note">Ссылку создаёт компьютер, здесь набирают её хвост.</span>
        </span>
      </div>

      <!-- Правовые документы: на приставке браузера нет — адрес показывается текстом. -->
      <p class="am-meta">
        Условия обработки данных копии — в
        <template v-if="canDocs">
          <button class="am-link" type="button" @click="onDoc(DOCS.privacy)">
            Политике обработки персональных данных
          </button>
        </template>
        <template v-else>{{ DOCS.privacy }}</template
        >.
      </p>

      <div class="am-row">
        <label class="am-field">
          <input
            v-model="linkDraft"
            class="am-input"
            type="text"
            placeholder="Ссылка на копию или её хвост"
            :disabled="cloudBusy"
            @keyup.enter="onLinkFind"
          />
        </label>
        <button
          v-tip="'Спросить, что лежит по ссылке. Список пока не меняется'"
          class="am-btn"
          type="button"
          :disabled="cloudBusy || !linkDraft.trim()"
          @click="onLinkFind"
        >
          {{ cloudBusy ? 'Смотрим…' : 'Найти копию' }}
        </button>
      </div>

      <!-- Сперва показываем, что нашлось: размер и время говорят, свежее там или старее, решение — за человеком. -->
      <div v-if="linkFound" class="am-ask">
        <p class="am-ask__text">
          По ссылке лежит копия: {{ sizeText(linkFound.bytes)
          }}<template v-if="linkFound.modified">
            · {{ whenText(Date.parse(linkFound.modified)) }}</template
          >. Здесь записей: {{ list }}.
        </p>

        <div class="am-row">
          <button class="am-btn" type="button" :disabled="cloudBusy" @click="onLinkPull('merge')">
            Добавить недостающее
          </button>
          <button
            v-tip="'Заменить свой список копией по ссылке целиком'"
            class="am-btn am-btn--ghost"
            type="button"
            :disabled="cloudBusy"
            @click="onLinkPull('replace')"
          >
            Заменить целиком
          </button>
          <button class="am-btn am-btn--ghost" type="button" @click="onLinkCancel">Отмена</button>
        </div>
      </div>

      <p v-if="cloudError" class="am-error">{{ cloudError }}</p>
      <p v-if="cloudNote" class="am-note">{{ cloudNote }}</p>
    </div>

    <!-- Справка отдельным узлом и модалкой: читать её будут один раз, когда впервые переносят список. -->
    <CloudHelp :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>

<style scoped src="../screens/settings-screen.css"></style>
