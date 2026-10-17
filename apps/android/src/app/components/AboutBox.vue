<script setup lang="ts">
// Описание крупным планом: в плитке карточки текст идёт 11.5px, и с трёх метров его не читают. То же
// описание с кеглем под чтение; разметку источника разбирает RichText. Отдельным окном.

import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { pushBackStop } from '../back-stop'

import RichText from './RichText.vue'

const props = defineProps<{
  /** Открыта ли модалка. */
  open: boolean
  /** Описание как оно пришло от источника: разбор — дело RichText. */
  text: string
}>()

const emit = defineEmits<{ close: [] }>()

/** Тело описания: его листают стрелками. */
const body = ref<HTMLElement | null>(null)

function onClose(): void {
  emit('close')
}

/// Сколько прокручивать за нажатие. Шестьдесят пикселей — примерно две строки текста: с трёх метров видно, что страница поехала, и до конца описания — десяток нажатий.
const STEP = 60

/** Клавиши внутри окна: Esc закрывает, стрелки листают текст. Листаем сами, а не отдаём
 *  обходу: фокус стоит на теле описания, и прокрутить его обход не умеет. */
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    onClose()
    return
  }

  const box = body.value
  if (box === null) return

  let step: number
  if (e.key === 'ArrowDown') step = STEP
  else if (e.key === 'ArrowUp') step = -STEP
  else if (e.key === 'PageDown') step = STEP * 4
  else if (e.key === 'PageUp') step = -STEP * 4
  else return

  e.preventDefault()
  e.stopPropagation()
  box.scrollBy({ top: step, behavior: 'smooth' })
}

// Шаг «Назад» ставится только на время модалки: без своей записи аппаратная кнопка снимала бы разом и окно, и карточку под ним — стопов в очереди два, а закрывается последний поставленный.
let stopBack: (() => void) | null = null

// Слушатель живёт только пока окно открыто: висящий на document обработчик закрытого окна перехватывал бы Esc у карточки под ним.
watch(
  () => props.open,
  (open) => {
    if (!open) {
      document.removeEventListener('keydown', onKey)
      stopBack?.()
      stopBack = null
      return
    }

    document.addEventListener('keydown', onKey)

    if (stopBack === null) {
      stopBack = pushBackStop(function () {
        onClose()
        return true
      })
    }

    // Фокус переезжает в текст описания. Без этого он остаётся на цели под окном: обход пульта ограничил бы себя окном, а фокус стоял снаружи, и первое нажатие стрелки ушло бы в никуда.
    void nextTick(() => body.value?.focus())
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  stopBack?.()
  stopBack = null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="am-modal" role="dialog" aria-modal="true" aria-label="Описание">
      <!-- Клик мимо закрывает: это описание, и держать его силой незачем. -->
      <div class="am-modal__veil" @click="onClose" />

      <div class="am-modal__box">
        <div class="am-modal__head">
          <h3 class="am-modal__title">Описание</h3>
          <button class="am-modal__x" type="button" aria-label="Закрыть" @click="onClose">✕</button>
        </div>

        <!-- tabindex у тела: с фокусом на нём пульт видит, что находится внутри окна, и не считает окно пустым. -->
        <div ref="body" class="am-modal__body" tabindex="0" data-am-seed>
          <RichText class="am-about--zoom" :text="text" plain />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Модалка на весь экран: само описание уже, но подложка обязана перекрыть всё, иначе клик
   мимо уходит в карточку под ней. */
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
  width: min(680px, 100%);
  max-height: min(760px, 88vh);
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

/* Текст прокручивается внутри рамки. `min-height: 0` обязателен: в гибкой колонке блок не
   сжимается ниже содержимого, и `overflow-y` не даёт ничего — рамка уходит за экран. */
.am-modal__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 18px 20px 22px;
  overflow-y: auto;
}

/* Тело берёт фокус, но подсветки на нём быть не должно: правило `.am-lite :focus-visible`
   залило бы акцентом всю страницу текста — это читалось бы не «здесь ты», а «здесь сломано». */
.am-modal__body:focus-visible {
  outline: none;
  box-shadow: none;
}

/* Кегль и полоса — под чтение с трёх метров, а не под сводку карточки: то же описание,
   но заметно крупнее. Остальное — абзацы, ссылки, спойлеры — одето самим RichText. */
.am-about--zoom {
  font-size: clamp(15px, 1.35vw, 18px);
  line-height: 1.62;
  color: color-mix(in srgb, var(--am-text) 92%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .am-modal__box {
    animation: none;
  }
}
</style>
