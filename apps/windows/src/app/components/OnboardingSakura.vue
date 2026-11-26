<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { SAKURA_ROSETTE, SAKURA_ROSETTE_BOX } from '../sakura'
import { sprayGrains, type Grain } from '../screens/home-spray'

const stage = ref<HTMLElement | null>(null)
const grains = ref<Grain[]>([])
let observer: ResizeObserver | undefined

onMounted(() => {
  const layer = stage.value
  if (!layer) return

  function layout(width: number, height: number): void {
    if (!width || !height) return
    // Сохраняем плотность на небольшом окне и ограничиваем число цветков на 4K.
    const fieldWidth = Math.min(width, 1500)
    const fieldHeight = Math.min(height, 860)
    grains.value = sprayGrains(fieldWidth, fieldHeight, []).map((grain) => ({
      ...grain,
      left: (grain.left / fieldWidth) * 100,
      top: (grain.top / fieldHeight) * 100,
    }))
  }

  layout(layer.clientWidth, layer.clientHeight)
  observer = new ResizeObserver(([entry]) => {
    if (entry) layout(entry.contentRect.width, entry.contentRect.height)
  })
  observer.observe(layer)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="stage" class="am-intro-sakura" aria-hidden="true">
    <span
      v-for="grain in grains"
      :key="grain.key"
      class="am-intro-sakura__flower"
      :class="`am-intro-sakura__flower--${grain.depth}`"
      :style="{
        left: `${grain.left}%`,
        top: `${grain.top}%`,
        width: `${grain.size}px`,
        height: `${grain.tall}px`,
        '--sakura-turn': `${grain.turn}deg`,
        '--sakura-tilt': `${grain.rot}deg`,
        '--sakura-from-x': `${grain.fx}px`,
        '--sakura-from-y': `${grain.fy}px`,
        '--sakura-to-x': `${grain.tx}px`,
        '--sakura-to-y': `${grain.ty}px`,
        '--sakura-duration': `${grain.dur}s`,
        '--sakura-delay': `${grain.delay}s`,
      }"
    >
      <svg :viewBox="SAKURA_ROSETTE_BOX"><path :d="SAKURA_ROSETTE" /></svg>
    </span>
  </div>
</template>

<style scoped>
.am-intro-sakura {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.am-intro-sakura__flower {
  position: absolute;
  color: rgb(var(--am-accent-2-rgb));
  opacity: 0.22;
  rotate: var(--sakura-turn);
  animation: am-intro-sakura-drift var(--sakura-duration) var(--am-ease-soft) var(--sakura-delay)
    infinite alternate;
}

.am-intro-sakura__flower--far {
  opacity: 0.12;
  filter: blur(2px);
}

.am-intro-sakura__flower--near {
  opacity: 0.34;
}

.am-intro-sakura__flower svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentColor;
}

@keyframes am-intro-sakura-drift {
  from {
    translate: var(--sakura-from-x) var(--sakura-from-y);
    rotate: calc(var(--sakura-turn) - var(--sakura-tilt));
  }
  to {
    translate: var(--sakura-to-x) var(--sakura-to-y);
    rotate: calc(var(--sakura-turn) + var(--sakura-tilt));
  }
}

@media (prefers-reduced-motion: reduce) {
  .am-intro-sakura__flower {
    animation: none;
  }
}
</style>
