<script setup lang="ts">
// Тосты о сети: когда источник отказал дважды подряд, человек узнаёт об этом плашкой, а не
// пустым экраном. Текст собирает core/net-toast — здесь только подписка и показ.

import { onBeforeUnmount, onMounted, ref } from 'vue'

import { subscribeNetHealth } from '@/core/net-health'
import { MAX_TOASTS, pickToasts, type NetToast } from '@/core/net-toast'

/** Сколько плашка висит сама. Дольше не надо: человек уже прочитал. */
const LIFT_MS = 9000

const toasts = ref<NetToast[]>([])
// Что уже объявляли за сессию: память не зависит от того, висит плашка на экране или нет.
// Иначе плашка, ушедшая по таймеру, возвращалась бы при следующем же отчёте.
const announced = new Set<string>()
let stop: (() => void) | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Снимает плашку и запоминает: повтор этого отвала больше не покажется. */
function drop(id: string): void {
  announced.add(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

onMounted(() => {
  stop = subscribeNetHealth((rows) => {
    // Отчёт о том, что источник ожил, снимает запрет: поломка после лечения — новая новость.
    for (const row of rows) {
      if (row.state === 'ok') announced.delete(row.id)
    }

    const fresh = pickToasts(rows, [...announced])
    if (fresh.length === 0) return
    for (const toast of fresh) announced.add(toast.id)

    toasts.value = [...toasts.value, ...fresh].slice(-MAX_TOASTS)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      // Исчезновение с экрана не отменяет объявления — иначе тост вернётся через минуту.
      toasts.value = toasts.value.slice(1)
    }, LIFT_MS)
  })
})

onBeforeUnmount(() => {
  stop?.()
  stop = null
  if (timer) clearTimeout(timer)
  timer = null
})
</script>

<template>
  <div v-if="toasts.length" class="am-toasts" role="status" aria-live="polite">
    <p v-for="toast in toasts" :key="toast.id" class="am-toast">
      <span class="am-toast__src">{{ toast.label }}</span>
      <span class="am-toast__code">{{ toast.code }}</span>
      <span class="am-toast__cause">{{ toast.cause }}.</span>
      <span class="am-toast__advice">{{ toast.advice }}.</span>
      <!-- Крестик обязателен: плашка без выхода запирает человека на чужой проблеме. -->
      <button
        class="am-toast__x"
        type="button"
        :aria-label="`Скрыть: ${toast.label}`"
        @click="drop(toast.id)"
      >
        <span aria-hidden="true">×</span>
      </button>
    </p>
  </div>
</template>

<style scoped>
/* Правый нижний угол: плашка не должна закрывать заголовок и кнопки экрана. */
.am-toasts {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(420px, calc(100vw - 36px));
}

.am-toast {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 9px 34px 9px 14px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--am-text);
  background: var(--am-panel);
  /* Симметричный обоюдоскруглённый чип: срезанный слева край читался как обрыв вёрстки. */
  border: 1px solid color-mix(in srgb, var(--am-bad) 42%, transparent);
  border-radius: var(--am-r-m);
  box-shadow: 0 6px 22px rgb(0 0 0 / 28%);
}

/* Крестик наезжает на плашку, а не жмёт её по кнопке: на самом краю полосы он промахнётся. */
.am-toast__x {
  position: absolute;
  top: 4px;
  right: 5px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--am-dim);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}

.am-toast__x:hover {
  color: var(--am-text);
  background: color-mix(in srgb, var(--am-text) 10%, transparent);
}

.am-toast__x:focus-visible {
  outline: 2px solid var(--am-accent);
}

.am-toast__src {
  font-weight: 600;
}

.am-toast__code {
  color: var(--am-bad);
  font-variant-numeric: tabular-nums;
}

.am-toast__cause {
  color: var(--am-dim);
}

.am-toast__advice {
  color: var(--am-dim);
}
</style>
