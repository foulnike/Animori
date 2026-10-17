<script setup lang="ts">
// Значки плит настроек: нарисованы, а не набраны знаками Юникода — у тех своя величина и толщина. Вектор в клетке 20×20, одна толщина линии, цвет по тексту, все знаки центрированы по (10, 10).

/// Имена плит мозаики. У каждой своё окно, и на него приходится свой знак.
type Kind = 'list' | 'look' | 'data' | 'cloud' | 'net' | 'about'

const props = defineProps<{ name: Kind }>()
</script>

<template>
  <svg
    class="am-setmark"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Импорт списка: строки и стрелка, приходящая в них сверху. -->
    <template v-if="props.name === 'list'">
      <path d="M3.4 6.6h8.2" />
      <path d="M3.4 10.4h8.2" />
      <path d="M3.4 14.2h5.4" />
      <path d="M15.4 5.8v7.2" />
      <path d="M12.8 10.4 15.4 13 18 10.4" />
    </template>

    <!-- Оформление: круг, залитый наполовину, — знак смены вида. -->
    <template v-else-if="props.name === 'look'">
      <circle cx="10" cy="10" r="6.4" />
      <path d="M10 3.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" stroke="none" />
    </template>

    <!-- Данные: столбик записей с двумя кромками, как у базы. -->
    <template v-else-if="props.name === 'data'">
      <ellipse cx="10" cy="5.9" rx="5.9" ry="2.5" />
      <path d="M4.1 5.9v8.2c0 1.38 2.64 2.5 5.9 2.5s5.9-1.12 5.9-2.5V5.9" />
      <path d="M4.1 10c0 1.38 2.64 2.5 5.9 2.5s5.9-1.12 5.9-2.5" />
    </template>

    <!-- Копия списка: облако — копия ушла в облако. На плитке знак стоит в 42px (пульт),
         и облако читается там, где на двадцати пикселях читалось бы пятном. -->
    <template v-else-if="props.name === 'cloud'">
      <path d="M13.5 8.5h-0.95A6 6 0 1 0 6.75 16h6.75a3.75 3.75 0 0 0 0-7.5z" />
    </template>

    <!-- Прокси: шар с меридианами — сеть. -->
    <template v-else-if="props.name === 'net'">
      <circle cx="10" cy="10" r="6.6" />
      <path d="M3.4 10h13.2" />
      <path d="M10 3.4c2.7 2.9 2.7 10.3 0 13.2" />
      <path d="M10 3.4c-2.7 2.9-2.7 10.3 0 13.2" />
    </template>

    <!-- О программе: сведения о сборке. -->
    <template v-else-if="props.name === 'about'">
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 9.2v5" />
      <circle cx="10" cy="6.6" r="0.85" fill="currentColor" stroke="none" />
    </template>
  </svg>
</template>

<style scoped>
/* Размер задаёт тот, кто ставит знак (у плиты — .am-door__mark); здесь только то,
   без чего вектор ломает строку. */
.am-setmark {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
