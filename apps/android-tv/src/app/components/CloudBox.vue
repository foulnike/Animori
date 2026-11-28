<script setup lang="ts">
// Копия списка по ссылке. Из шести кнопок на приставке работает одна: пропуск под шестьдесят
// знаков пультом не набрать. Порядок обязателен: сперва показать найденное, потом класть поверх.

import { ref } from 'vue'

import { linkInfo, pullByLink, type CloudLink } from '@/core/cloud'
import type { PullMode } from '@/core/collection'

import { restoreFocus } from '../focus-return'
import CloudHelp from './CloudHelp.vue'
import SettingsSheet from './SettingsSheet.vue'

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
const resultOpen = ref(false)
const findButton = ref<HTMLButtonElement | null>(null)

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
  if (cloudBusy.value) return
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
    if (cloudError.value || cloudNote.value) resultOpen.value = true
    else if (linkFound.value === null) restoreFocus(from, () => findButton.value)
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
  if (!linkDraft.value.trim()) return
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
  <div class="am-settings-content">
    <div class="am-settings-form">
      <label class="am-settings-field">
        <span>Ссылка или код копии с Яндекс Диска</span>
        <input
          v-model="linkDraft"
          class="am-input"
          type="text"
          :disabled="cloudBusy"
          @keyup.enter="onLinkFind"
        />
      </label>
      <button
        ref="findButton"
        class="am-btn am-btn--soft"
        type="button"
        :disabled="cloudBusy || !linkDraft.trim()"
        @click="onLinkFind"
      >
        {{ cloudBusy ? 'Подождите…' : 'Найти копию' }}
      </button>
    </div>
    <div class="am-settings-actions">
      <button class="am-btn" type="button" :disabled="cloudBusy" @click="helpOpen = true">
        Перенос списка на телевизор
      </button>
      <button
        v-if="cloudNote || cloudError"
        class="am-btn"
        type="button"
        :disabled="cloudBusy"
        @click="resultOpen = true"
      >
        Результат восстановления
      </button>
    </div>

    <CloudHelp :open="helpOpen" @close="helpOpen = false" />

    <SettingsSheet
      :open="linkFound !== null"
      :return-focus="() => findButton"
      title="Восстановление списка"
      icon="cloud"
      initial-focus=".am-settings-cancel"
      detail
      @close="onLinkCancel"
    >
      <dl v-if="linkFound" class="am-settings-facts">
        <div>
          <dt>Размер копии</dt>
          <dd>{{ sizeText(linkFound.bytes) }}</dd>
        </div>
        <div v-if="linkFound.modified">
          <dt>Дата копии</dt>
          <dd>{{ whenText(Date.parse(linkFound.modified)) }}</dd>
        </div>
        <div>
          <dt>Текущий список</dt>
          <dd>{{ list }} записей</dd>
        </div>
      </dl>
      <p class="am-meta">При замене текущий список будет удалён.</p>
      <template #actions>
        <button class="am-btn am-settings-cancel" type="button" @click="onLinkCancel">
          Отмена
        </button>
        <button class="am-btn am-settings-danger" type="button" @click="onLinkPull('replace')">
          Заменить список
        </button>
        <button class="am-btn am-btn--soft" type="button" @click="onLinkPull('merge')">
          Дополнить список
        </button>
      </template>
    </SettingsSheet>

    <SettingsSheet
      :open="resultOpen"
      :return-focus="() => findButton"
      :title="cloudError ? 'Ошибка восстановления' : 'Список восстановлен'"
      icon="cloud"
      detail
      compact
      @close="resultOpen = false"
    >
      <p v-if="cloudError" class="am-error" role="alert">{{ cloudError }}</p>
      <p v-else class="am-meta" role="status">{{ cloudNote }}</p>
    </SettingsSheet>
  </div>
</template>

<style scoped src="../screens/settings-screen.css"></style>
