<script setup lang="ts">
// Окно обновления на приставке. Своего апдейтера у Tauri на Android нет: версию сверяем по
// выпускам GitHub, установку отдаёт система. Состояния «проверено» нет: спрашивает при открытии.

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'
import { checkUpdate, installUpdate, updateOffer } from '../update'

const props = defineProps<{
  /** Открыто ли окно. */
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

/** Главная кнопка окна: на неё приходит фокус, иначе обход пульта посчитал бы окно пустым. */
const go = ref<HTMLButtonElement | null>(null)

/** Идёт ли вопрос к GitHub. */
const busy = ref(false)

/** Слово окна, когда предложить нечего: последняя версия или неудача. */
const said = ref('')

/** Оболочка увела человека в настройки Android за правом установки: скачивания не было. */
const away = ref(false)

function onClose(): void {
  emit('close')
}

/** Вопрос к GitHub. Неудача здесь не поломка: обновление просто не находится,
 * и окно говорит это словами, а не молча закрывается. */
async function onCheck(): Promise<void> {
  busy.value = true
  said.value = ''
  away.value = false

  try {
    updateOffer.value = await checkUpdate()
    if (updateOffer.value === null) said.value = 'Обновлений нет — это последняя версия.'
  } catch {
    updateOffer.value = null
    said.value = 'Спросить не удалось: GitHub не ответил. Попробуйте позже.'
  } finally {
    busy.value = false
  }

  // Кнопка появляется вместе с ответом: до ответа фокусу некуда приходить.
  void nextTick(() => go.value?.focus())
}

/** Отдаёт файл системе. Ответ false означает не отказ, а первый шаг: права
 * установки из неизвестных источников у приложения ещё нет. */
function onInstall(): void {
  const offer = updateOffer.value
  if (offer === null) return

  away.value = !installUpdate(offer.url)
}

// Готовое предложение не переспрашивается: его уже показала проверка при старте.
// Шаг «Назад» ставится только на время окна: компонент живёт всё время работы приложения.
let stopBack: (() => void) | null = null

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (stopBack === null) {
        stopBack = pushBackStop(function () {
          onClose()
          return true
        })
      }

      if (updateOffer.value === null) void onCheck()
      else void nextTick(() => go.value?.focus())
      return
    }

    if (stopBack !== null) {
      stopBack()
      stopBack = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopBack?.()
  stopBack = null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="am-modal" role="dialog" aria-modal="true" aria-label="Обновление">
      <!-- Клик мимо закрывает: окно не держит человека силой, обновление можно отложить. -->
      <div class="am-modal__veil" @click="onClose" />

      <div class="am-modal__box">
        <div class="am-modal__head">
          <h3 class="am-modal__title">
            {{ updateOffer ? `Обновление до ${updateOffer.version}` : 'Обновление' }}
          </h3>
          <button class="am-modal__x" type="button" aria-label="Закрыть" @click="onClose">✕</button>
        </div>

        <!-- tabindex у тела: с фокусом на кнопке обход пульта видит, что находится внутри окна. -->
        <div class="am-modal__body" tabindex="0" data-am-seed>
          <p v-if="busy">Спрашиваю GitHub…</p>

          <template v-else-if="updateOffer">
            <p class="am-up__lead">
              Выпуск новее установленного. Файл скачивается в кэш приложения, установку подтверждает
              система.
            </p>

            <!-- Переносы в описании выпуска сохранены: его пишут списком, и склеенный в строку список не читается. -->
            <p v-if="updateOffer.notes" class="am-up__notes">{{ updateOffer.notes }}</p>

            <div v-if="away" class="am-up__warn">
              Скачивания не было: у приложения нет права устанавливать пакеты. Откройте настройки
              Android, разрешите установку из неизвестных источников для AniMori и вернитесь —
              нажмите «Установить» снова.
            </div>
          </template>

          <p v-else>{{ said }}</p>
        </div>

        <div class="am-modal__foot">
          <button
            v-if="updateOffer"
            ref="go"
            class="am-btn am-up__go"
            type="button"
            @click="onInstall"
          >
            Установить
          </button>

          <button
            v-else
            ref="go"
            class="am-btn am-btn--soft am-up__go"
            type="button"
            @click="onClose"
          >
            Понятно
          </button>

          <button v-if="updateOffer" class="am-btn am-btn--soft" type="button" @click="onClose">
            Позже
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Окно на весь экран: подложка обязана перекрыть всё, иначе клик мимо уходит в панель под ней. */
.am-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 24px;
}

/* Подложка красится темой, а не чёрным литералом: на светлой теме чёрная вуаль читалась провалом в экране. */
.am-modal__veil {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--am-bg) 76%, transparent);
  backdrop-filter: blur(var(--am-blur-strong));
}

.am-modal__box {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(640px, 88vh);
  background: var(--am-panel-2);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-m);
  box-shadow: var(--am-sh-2);
  animation: am-modal-in var(--am-mid) var(--am-ease) both;
}

@keyframes am-modal-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.am-modal__head {
  display: flex;
  flex: none;
  gap: 12px;
  align-items: center;
  padding: 15px 15px 13px 18px;
  border-bottom: 1px solid var(--am-line-soft);
}

.am-modal__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--am-text);
}

.am-modal__x {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  font: inherit;
  font-size: 13px;
  line-height: 1;
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

.am-modal__x:hover:where(:not(.am-lite *)) {
  color: var(--am-text);
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}

/* min-height: 0 обязателен: в гибкой колонке блок по умолчанию не сжимается ниже
   содержимого, и overflow-y: auto такому блоку ничего не даёт. */
.am-modal__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 11px;
  min-height: 0;
  padding: 16px 18px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.6;
  color: var(--am-dim);
}

/* Тело берёт фокус, но подсветки на нём быть не должно: правило .am-lite :focus-visible
   залило бы акцентом всю страницу текста. */
.am-modal__body:focus-visible {
  outline: none;
  box-shadow: none;
}

.am-modal__body p {
  margin: 0;
}

.am-up__lead {
  color: var(--am-text);
}

/* Описание выпуска — как его написали: переносы сохранены, шрифт ровный, без моноширинной сетки. */
.am-up__notes {
  padding: 11px 13px;
  color: var(--am-dim);
  white-space: pre-wrap;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-m);
}

/* Предупреждение тем же тоном, что и вопросы в панели: это не поломка, красным его показывать неправильно. */
.am-up__warn {
  padding: 11px 13px;
  background: color-mix(in srgb, var(--am-warn) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--am-warn) 42%, transparent);
  border-radius: var(--am-r-m);
}

/* Кнопки стоят внизу рамки, а не в теле: прокручивается только текст выпуска. */
.am-modal__foot {
  display: flex;
  flex: none;
  gap: 10px;
  padding: 13px 18px 16px;
  border-top: 1px solid var(--am-line-soft);
}

/* Главная кнопка тянется: на пульте попасть в широкую цель легче, чем в узкую. */
.am-up__go {
  flex: 1 1 auto;
}

@media (prefers-reduced-motion: reduce) {
  .am-modal__box {
    animation: none;
  }
}
</style>
