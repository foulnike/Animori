<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import type { PersonFact } from '@/core/person-summary'

import RichText from './RichText.vue'

const props = defineProps<{ facts: PersonFact[] }>()
const emit = defineEmits<{ (e: 'inside'): void }>()

const titleId = useId()
const listId = useId()
const expanded = ref(false)
const rows = computed(() => props.facts.map((fact, index) => ({ fact, index })))
const preview = computed(() =>
  rows.value
    .filter(
      ({ fact }) => !fact.text.includes('\n') && (fact.label?.length ?? 0) + fact.text.length <= 72,
    )
    .slice(0, 5),
)
const canExpand = computed(() => preview.value.length < rows.value.length)
</script>

<template>
  <section class="am-person-summary" :aria-labelledby="titleId">
    <div class="am-person-summary__head">
      <h2 :id="titleId">Краткие сведения</h2>
      <button
        v-if="canExpand"
        class="am-btn am-btn--ghost am-person-summary__toggle"
        type="button"
        :aria-expanded="expanded"
        :aria-controls="listId"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Свернуть сведения' : 'Все сведения' }}
      </button>
    </div>

    <ul :id="listId" class="am-person-summary__facts">
      <li v-for="{ fact, index } in expanded ? rows : preview" :key="index">
        <span v-if="fact.label" class="am-person-summary__label">{{ fact.label }}</span>
        <RichText
          v-if="fact.rich"
          class="am-person-summary__value"
          :text="fact.text"
          plain
          @inside="emit('inside')"
        />
        <span v-else class="am-person-summary__value">{{ fact.text }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.am-person-summary {
  flex: none;
  min-width: 0;
  padding: 8px 12px 10px;
  color: var(--am-dim);
  background: var(--am-fill-1);
  border: 1px solid var(--am-line-soft);
  border-radius: var(--am-r-l);
}

.am-person-summary__head {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  align-items: center;
  justify-content: space-between;
}

.am-person-summary__head h2 {
  margin: 0;
  font-size: 1em;
  font-weight: 700;
  color: var(--am-text);
}

.am-person-summary__toggle {
  min-height: 32px;
  padding-inline: 10px;
  font-size: 0.9em;
}

.am-person-summary__facts {
  display: grid;
  gap: 4px;
  margin: 4px 0 0;
  padding: 0;
  font-size: 0.94em;
  line-height: 1.45;
  list-style: none;
  overflow-wrap: anywhere;
}

.am-person-summary__facts li {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  align-items: baseline;
}

.am-person-summary__label {
  font-weight: 600;
  color: var(--am-text);
}

.am-person-summary__value {
  flex: 1 1 9ch;
  min-width: 0;
}

.am-person-summary__value:deep(.am-rich__spoil) {
  gap: 4px;
  padding: 0;
  background: none;
  border: 0;
}

.am-person-summary__value:deep(.am-rich__reveal) {
  min-height: 28px;
  color: var(--am-accent);
}
</style>
