<script setup lang="ts">
import { ref, watch } from 'vue'

import SettingsSheet from './SettingsSheet.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const page = ref(0)

watch(
  () => props.open,
  (open) => {
    if (open) page.value = 0
  },
)
</script>

<template>
  <SettingsSheet
    :open="open"
    v-model:page="page"
    :page-count="2"
    title="Перенос списка на телевизор"
    icon="cloud"
    detail
    @close="emit('close')"
  >
    <template v-if="page === 0">
      <h3>Создать ссылку на ПК или телефоне</h3>
      <ol>
        <li>Откройте «Облачная копия» и подключите Яндекс Диск.</li>
        <li>Нажмите «Сохранить копию», затем «Создать ссылку».</li>
        <li>Запишите код копии.</li>
      </ol>
    </template>
    <template v-else>
      <h3>Восстановить на ТВ</h3>
      <ol>
        <li>Введите ссылку или код и нажмите «Найти копию».</li>
        <li>Дополните текущий список или замените его.</li>
      </ol>
      <p>
        Копия доступна всем, у кого есть ссылка. После переноса нажмите «Закрыть доступ» на
        устройстве, где создали ссылку.
      </p>
    </template>
  </SettingsSheet>
</template>

<style scoped>
h3,
ol,
p {
  margin: 0;
}

ol {
  display: grid;
  gap: 6px;
  padding-inline-start: 1.4em;
}

p {
  color: var(--am-dim);
}
</style>
