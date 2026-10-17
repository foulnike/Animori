<script setup lang="ts">
// Окно настроек: одна плита мозаики — одно окно. Рамка одна на шесть окон, содержимое приходит слотом. Заголовка у рамки нет: его несёт панель внутри — одно и то же слово стояло бы дважды.

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'

const props = defineProps<{
  /** Открыто ли окно. */
  open: boolean
  /** Имя окна для читалок: на экране его несёт заголовок панели. */
  title: string
}>()

const emit = defineEmits<{ close: [] }>()

/** Коробка окна: её ищет above() среди всех открытых диалогов. */
const sheet = ref<HTMLElement | null>(null)

/** Тело окна: запасная цель, когда в панели не нашлось ни кнопки, ни поля. */
const body = ref<HTMLElement | null>(null)

/** Крестик шапки: видимая цель, когда панель пуста — у тела подсветки нет. */
const close = ref<HTMLElement | null>(null)

/// Поле ввода, кроме галочки: у поля программный фокус поднимает экранную клавиатуру, у галочки — нет.
function isTextField(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return el.type !== 'checkbox' && el.type !== 'radio'
  return false
}

/** Годная цель в `box` по порядку разметки. Текстовые поля просим отдельно: у поля
 *  программный фокус без блокировки поднимает экранную клавиатуру, у кнопки — нет. */
function pick(box: HTMLElement, withText: boolean): HTMLElement | null {
  const all = box.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )

  for (const el of all) {
    if (el.hasAttribute('disabled')) continue
    if (el.tabIndex < 0) continue
    if (!withText && isTextField(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    return el
  }

  return null
}

function onClose(): void {
  emit('close')
}

/** Есть ли открытое окно поверх этого: справка «Копии списка» лежит выше, и Escape её, а не этой.
 * Верхнее —
 *  последнее в разметке, как в обходе пульта: оба окна уходят из DOM по закрытии. */
function above(): boolean {
  const all = document.querySelectorAll<HTMLElement>('[role="dialog"]')
  for (let i = all.length - 1; i >= 0; i--) {
    const node = all[i]
    if (node === undefined) continue
    if (node === sheet.value) return false
    const shown =
      typeof node.checkVisibility === 'function'
        ? node.checkVisibility({ checkVisibilityCSS: true })
        : getComputedStyle(node).visibility !== 'hidden'
    if (shown) return true
  }
  return false
}

/** Escape: окно поверх экрана без него на компьютере не закрыть — там нет ни крестика
 *  в углу пульта, ни аппаратной кнопки. Слушатель живёт только пока окно открыто. */
function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (above()) return
  onClose()
}

// Шаг «Назад» ставится только на время окна: компонент живёт всё время работы экрана.
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

      document.addEventListener('keydown', onKey)

      // Фокус переезжает в окно: обход пульта ограничил бы себя окном, а фокус стоял бы снаружи. Проверяем,
      // а не верим: отказ `focus()` оставил бы окно пустым для обхода.
      void nextTick(() => {
        const box = body.value
        if (box === null) return

        // Порядок входа: первое действие панели → текстовое поле → крестик шапки → тело. Крестик важнее тела:
        // у тела подсветки нет. Поле ввода ждёт вторым — с фокуса на нём WebView поднимает клавиатуру.
        const control = pick(box, false) ?? pick(box, true) ?? close.value
        if (control !== null) {
          if (isTextField(control)) {
            // Блокировка та же, что у обхода пульта: без неё WebView открывает клавиатуру сразу.
            control.setAttribute('data-am-held', '')
            control.readOnly = true
          }
          control.focus({ preventScroll: true })
          if (document.activeElement === control) return
        }

        box.focus({ preventScroll: true })
      })
      return
    }

    document.removeEventListener('keydown', onKey)

    if (stopBack !== null) {
      stopBack()
      stopBack = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="am-sheet">
      <!-- Занавес — кнопка: клик мимо коробки закрывает, и это доступно с клавиатуры. -->
      <button class="am-sheet__veil" type="button" aria-label="Закрыть" @click="onClose" />

      <div ref="sheet" class="am-sheet__box" role="dialog" aria-modal="true" :aria-label="title">
        <!-- Крест один во всей рамке: заголовок несёт панель, шапке остаётся выход. -->
        <header class="am-sheet__top">
          <span class="am-bar__gap" />
          <button
            ref="close"
            class="am-sheet__close"
            type="button"
            data-am-last
            aria-label="Закрыть"
            @click="onClose"
          >
            ✕
          </button>
        </header>

        <!-- tabindex у тела: с фокусом на нём пульт видит, что находится внутри окна,
             и не считает окно пустым. Метка `data-am-seed` — тело контейнер, а не цель: ходить
             по нему нельзя, его прямоугольник перекрывает всю панель, и фокус вставал бы туда,
             где подсветки нет. -->
        <div ref="body" class="am-sheet__body" tabindex="0" data-am-seed>
          <slot />
        </div>

        <!-- «Готово» — общий выход: панель правят по месту, подтверждать нечего. -->
        <footer class="am-sheet__foot">
          <button class="am-btn am-btn--soft am-sheet__go" type="button" @click="onClose">
            Готово
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Окно поверх всего: мозаика под ним остаётся на месте, чтобы возврат не сбрасывал прокрутку. */
.am-sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 32px);
}

.am-sheet__veil {
  position: absolute;
  inset: 0;
  padding: 0;
  cursor: default;
  background: var(--am-veil);
  border: 0;
  backdrop-filter: blur(6px);
  animation: am-sheet-veil var(--am-mid) var(--am-ease) both;
}

.am-sheet__box {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(880px, 100%);
  max-height: min(90vh, 940px);
  overflow: hidden;
  background: var(--am-panel);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-drop);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  animation: am-sheet-in var(--am-mid) var(--am-ease-soft) both;
}

@keyframes am-sheet-veil {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes am-sheet-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Шапка тонкая: она держит один выход, и высота окна уходит содержимому. */
.am-sheet__top {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px 0 clamp(14px, 1.8vw, 22px);
}

.am-sheet__close {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  font: inherit;
  font-size: 15px;
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

.am-sheet__close:hover:where(:not(.am-lite *)),
.am-sheet__close:focus-visible {
  color: var(--am-text);
  background: var(--am-hover);
  border-color: rgb(var(--am-accent-rgb) / 0.45);
}

/* Тело едет, шапка и низ стоят: «Готово» не уезжает за край длинной панели. min-height: 0
   обязателен: в гибкой колонке блок по умолчанию не сжимается ниже содержимого. */
.am-sheet__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 12px clamp(14px, 1.8vw, 22px) 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Тело берёт фокус, но подсветки на нём быть не должно: правило .am-lite :focus-visible
   залило бы акцентом всю панель. */
.am-sheet__body:focus-visible {
  outline: none;
  box-shadow: none;
}

.am-sheet__foot {
  display: flex;
  flex: 0 0 auto;
  padding: 12px clamp(14px, 1.8vw, 22px) 14px;
  border-top: 1px solid var(--am-line-soft);
}

/* Главная кнопка тянется: на пульте попасть в широкую цель легче, чем в узкую. */
.am-sheet__go {
  flex: 1 1 auto;
}

/* Телевизор: у пульта нет Escape, и крест — выход из окна. Тридцати шести пикселей
   для цели с трёх метров мало. */
.am-lite .am-sheet__close {
  width: 52px;
  height: 52px;
  font-size: 24px;
}

/* На узком экране окно становится нижним листом: строка на всю ширину читается лучше коробки по центру. */
@media (max-width: 640px) {
  .am-sheet {
    align-items: flex-end;
    padding: 0;
  }

  .am-sheet__box {
    width: 100%;
    max-height: 92vh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: var(--am-r-drop) var(--am-r-drop) 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .am-sheet__veil,
  .am-sheet__box {
    animation: none;
  }
}
</style>
