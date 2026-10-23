<script setup lang="ts">
// Меню долгого нажатия на постере: действия над записью вместо открытия карточки.
// Нижняя шторка под палец, тот же путь закрытия, что у прочих окон: тап мимо, Escape, «Назад».
import { onBeforeUnmount, onMounted } from 'vue'

import { pushBackStop } from '../back-stop'
import { useScrollLock } from '../scroll-lock'

const props = defineProps<{
  /** Название тайтла: шапка меню. */
  title: string
  /** Показывать ли «Не интересует»: у полки продолжения записи скрытие бессмысленно. */
  hide: boolean
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'hide'): void
  (e: 'close'): void
}>()

useScrollLock(() => true)

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

let stopBack: (() => void) | null = null

onMounted(() => {
  window.addEventListener('keydown', onKey)
  stopBack = pushBackStop(function () {
    emit('close')
    return true
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = null
})
</script>

<template>
  <Teleport to="body">
    <div class="am-tap" @click.self="emit('close')">
      <div
        class="am-tap__box"
        role="dialog"
        aria-modal="true"
        :aria-label="`Действия: ${props.title}`"
      >
        <p class="am-tap__name">{{ props.title }}</p>

        <button class="am-tap__item" type="button" @click="emit('edit')">Изменить запись</button>

        <button
          v-if="props.hide"
          class="am-tap__item am-tap__item--bad"
          type="button"
          @click="emit('hide')"
        >
          Не интересует
        </button>

        <button class="am-btn am-btn--ghost am-tap__cancel" type="button" @click="emit('close')">
          Отмена
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Подложка во весь экран; поля системных полос держит токен из темы. */
.am-tap {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-block: var(--am-modal-top) var(--am-modal-bottom);
  padding-inline: 0;
  background: var(--am-veil);
  backdrop-filter: blur(6px);
  animation: am-tap-veil var(--am-fast) var(--am-ease-soft) both;
}

.am-tap__box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 16px 16px 12px;
  background: var(--am-panel);
  /* Шторка парит над навбаром: прямой низ читался срезом. */
  border-radius: var(--am-r-xl);
  box-shadow:
    var(--am-sh-2),
    inset 0 1px 0 var(--am-edge);
  animation: am-tap-up var(--am-mid) var(--am-ease) both;
}

@keyframes am-tap-veil {
  from {
    opacity: 0;
  }
}

@keyframes am-tap-up {
  from {
    transform: translateY(20px);
  }
}

.am-tap-leave-active {
  pointer-events: none;
  animation: am-tap-veil-out var(--am-mid) var(--am-ease-soft) both;
}

.am-tap-leave-active .am-tap__box {
  animation: am-tap-down var(--am-mid) var(--am-ease) both;
}

@keyframes am-tap-veil-out {
  to {
    opacity: 0;
  }
}

@keyframes am-tap-down {
  from {
    transform: none;
  }
  to {
    transform: translateY(20px);
  }
}

.am-tap__name {
  overflow: hidden;
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--am-faint);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.am-tap__item {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 14px;
  font: inherit;
  font-size: 16px;
  font-weight: 550;
  color: var(--am-text);
  text-align: left;
  cursor: pointer;
  background: var(--am-fill-1);
  border: 0;
  border-radius: var(--am-r-m);
  transition: background-color var(--am-fast) var(--am-ease);
}

.am-tap__item:active {
  background: var(--am-fill-2);
}

.am-tap__item--bad {
  color: var(--am-bad);
}

.am-tap__cancel {
  justify-content: center;
  width: 100%;
  margin-top: 4px;
  min-height: 48px;
}

@media (prefers-reduced-motion: reduce) {
  .am-tap,
  .am-tap__box,
  .am-tap-leave-active,
  .am-tap-leave-active .am-tap__box {
    animation: none;
  }
}
</style>
