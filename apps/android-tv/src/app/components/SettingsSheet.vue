<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'
import SettingMark from './SettingMark.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    icon?: InstanceType<typeof SettingMark>['$props']['name']
    initialFocus?: string
    closeLabel?: string
    detail?: boolean
    compact?: boolean
    page?: number
    pageCount?: number
    returnFocus?: () => HTMLElement | null
  }>(),
  {
    icon: undefined,
    initialFocus: undefined,
    returnFocus: undefined,
    closeLabel: 'Готово',
    page: 0,
    pageCount: 1,
  },
)

const emit = defineEmits<{ close: []; 'update:page': [number] }>()
const sheet = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const done = ref<HTMLButtonElement | null>(null)
const previous = ref<HTMLButtonElement | null>(null)
const next = ref<HTMLButtonElement | null>(null)
let opener: HTMLElement | null = null
let stopBack: (() => void) | undefined

function topDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
  return (
    dialogs.reverse().find((dialog) => {
      if (dialog.classList.contains('am-settings-window__box')) return true
      if (typeof dialog.checkVisibility === 'function') {
        return dialog.checkVisibility({ checkVisibilityCSS: true })
      }
      return !dialog.hidden && getComputedStyle(dialog).visibility !== 'hidden'
    }) ?? null
  )
}

function canFocus(el: HTMLElement | null): el is HTMLElement {
  return el !== null && el.isConnected && !el.matches(':disabled') && el.tabIndex >= 0
}

function controls(box: HTMLElement): HTMLElement[] {
  return Array.from(
    box.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([data-am-seed])',
    ),
  ).filter((el) => canFocus(el) && el.closest('[hidden], [inert], [aria-hidden="true"]') === null)
}

function isTextField(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return (
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio')
  )
}

function focusInitial(): void {
  const box = body.value
  if (!props.open || box === null || topDialog() !== sheet.value) return
  const items = controls(box)
  const preferred = props.initialFocus
    ? (sheet.value?.querySelector<HTMLElement>(props.initialFocus) ?? null)
    : null
  const target = [
    preferred,
    ...items.filter((el) => !isTextField(el)),
    ...items,
    previous.value,
    next.value,
    done.value,
  ].find(canFocus)
  if (target && isTextField(target)) {
    target.setAttribute('data-am-held', '')
    target.readOnly = true
  }
  ;(target ?? box).focus({ preventScroll: true })
}

function detach(): void {
  document.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = undefined
}

function onKey(event: KeyboardEvent): void {
  const dialog = sheet.value
  if (event.defaultPrevented || dialog === null || topDialog() !== dialog) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  } else if (event.key === 'Tab') {
    const items = controls(dialog)
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at === -1 || (event.shiftKey ? at === 0 : at === items.length - 1)) {
      event.preventDefault()
      const target = event.shiftKey ? items[items.length - 1] : items[0]
      target?.focus()
    }
  }
}

function changePage(page: number): void {
  if (page < 0 || page >= props.pageCount) return
  const current = document.activeElement
  emit('update:page', page)
  void nextTick(() => {
    if (body.value) body.value.scrollTop = 0
    if (current instanceof HTMLElement && !canFocus(current)) {
      const other = current === next.value ? previous.value : next.value
      ;(canFocus(other) ? other : done.value)?.focus({ preventScroll: true })
    }
  })
}

// На малом экране или при длинном сообщении тело может прокручиваться отдельно.
// Когда фокус уже в подвале, стрелки всё равно позволяют дочитать текст.
function scrollOverflow(event: KeyboardEvent): void {
  const box = body.value
  const holder = event.target
  if (box === null || !(holder instanceof HTMLElement)) return
  const footer = holder.closest('.am-settings-window__foot') !== null
  const down = event.key === 'PageDown' || (footer && event.key === 'ArrowDown')
  const up = event.key === 'PageUp' || (footer && event.key === 'ArrowUp' && box.scrollTop > 0)
  if (!up && !down) return
  const edge = box.scrollHeight - box.clientHeight
  if (edge <= 1 || (down ? box.scrollTop >= edge - 1 : box.scrollTop <= 0)) return
  box.scrollTop += (down ? 1 : -1) * Math.max(48, Math.round(box.clientHeight * 0.75))
  event.preventDefault()
  event.stopPropagation()
}

watch(
  () => props.open,
  (open, wasOpen) => {
    if (open) {
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      stopBack = pushBackStop(() => {
        emit('close')
        return true
      })
      document.addEventListener('keydown', onKey)
      void nextTick(focusInitial)
    } else {
      detach()
      if (!wasOpen) return
      const origin = opener
      opener = null
      void nextTick(() => {
        const top = topDialog()
        const target = [props.returnFocus?.() ?? null, origin].find(
          (el): el is HTMLElement => canFocus(el) && (top === null || top.contains(el)),
        )
        target?.focus({ preventScroll: true })
      })
    }
  },
  { immediate: true },
)

onBeforeUnmount(detach)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="am-settings-window" :class="{ 'am-settings-window--detail': detail }">
      <div class="am-settings-window__veil" aria-hidden="true" @click="emit('close')" />

      <div
        ref="sheet"
        class="am-settings-window__box"
        :class="{ 'am-settings-window__box--compact': compact }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @keydown="scrollOverflow"
      >
        <header class="am-settings-window__head">
          <span v-if="icon" class="am-settings-window__icon"><SettingMark :name="icon" /></span>
          <h2>{{ title }}</h2>
        </header>

        <div ref="body" class="am-settings-window__body" tabindex="0" data-am-seed data-am-scroll>
          <slot />
        </div>

        <footer class="am-settings-window__foot">
          <template v-if="pageCount > 1">
            <span class="am-settings-window__page" aria-live="polite">
              Страница {{ page + 1 }} из {{ pageCount }}
            </span>
            <button
              ref="previous"
              class="am-btn am-settings-window__arrow"
              type="button"
              aria-label="Предыдущая страница"
              :disabled="page === 0"
              @click="changePage(page - 1)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5 M12 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              ref="next"
              class="am-btn am-settings-window__arrow"
              type="button"
              aria-label="Следующая страница"
              :disabled="page + 1 === pageCount"
              @click="changePage(page + 1)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14 M12 5l7 7-7 7" />
              </svg>
            </button>
          </template>
          <slot name="actions">
            <button
              ref="done"
              class="am-btn am-settings-window__done"
              :class="{ 'am-btn--soft': detail }"
              type="button"
              @click="emit('close')"
            >
              <svg
                v-if="!detail"
                class="am-settings-window__back"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M19 12H5 M12 5l-7 7 7 7" />
              </svg>
              {{ closeLabel }}
            </button>
          </slot>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.am-settings-window {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  align-items: center;
  justify-items: center;
  padding: clamp(10px, 3vmin, 32px);
}

.am-settings-window--detail {
  z-index: 61;
}

.am-settings-window__veil {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--am-bg) 76%, transparent);
}

.am-settings-window__box {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(720px, 100%);
  max-height: calc(100vh - 2 * clamp(10px, 3vmin, 32px));
  max-height: calc(100dvh - 2 * clamp(10px, 3vmin, 32px));
  min-height: 0;
  padding: clamp(12px, 2.6vmin, 24px);
  background: var(--am-panel);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-m);
  box-shadow: var(--am-sh-2);
  animation: am-settings-open var(--am-fast) var(--am-ease-soft) both;
}

.am-settings-window__box--compact {
  width: min(540px, 100%);
}

.am-settings-window__head,
.am-settings-window__foot {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.am-settings-window__head {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--am-line-soft);
}

.am-settings-window__head h2 {
  margin: 0;
  font-size: clamp(19px, 3.4vmin, 28px);
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.am-settings-window__icon {
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  height: 36px;
  color: var(--am-accent);
  background: var(--am-accent-soft);
  border-radius: var(--am-r-s);
}

.am-settings-window__icon :deep(svg) {
  width: 23px;
  height: 23px;
}

.am-settings-window__body {
  display: grid;
  flex: 1 1 auto;
  gap: 10px;
  min-height: 0;
  padding: 4px;
  margin: -4px;
  overflow: auto;
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
}

.am-settings-window .am-settings-window__body:focus-visible {
  outline: none;
  box-shadow: none;
}

.am-lite .am-settings-window__box :deep(button:focus-visible),
.am-lite .am-settings-window__box :deep(input:focus-visible) {
  box-shadow: 0 0 0 3px var(--am-accent-soft);
}

.am-settings-window__foot {
  flex-wrap: wrap;
  padding-top: 10px;
  border-top: 1px solid var(--am-line-soft);
}

.am-settings-window__foot > :deep(.am-btn) {
  min-height: 44px;
  padding-inline: 14px;
}

.am-settings-window__foot > .am-settings-window__arrow {
  width: 44px;
  padding-inline: 0;
}

.am-settings-window__arrow svg,
.am-settings-window__back {
  flex: 0 0 18px;
  width: 18px;
  height: 18px;
}

.am-settings-window__box :deep(button:disabled) {
  color: var(--am-dim);
  cursor: default;
  background: var(--am-fill-1);
  border-color: var(--am-line-soft);
  opacity: 0.36;
}

.am-settings-window--detail .am-settings-window__foot {
  justify-content: flex-end;
}

.am-settings-window__page {
  margin-inline-end: auto;
  color: var(--am-dim);
  font-variant-numeric: tabular-nums;
}

@keyframes am-settings-open {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .am-settings-window__box {
    animation: none;
  }
}
</style>
