<script setup lang="ts">
// Корень приложения — только выбор экрана по адресу; разметка рамки в AppShell. Окошко человека живёт здесь: его открывают и состав тайтла, и ссылка из любого описания.
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, type Component } from 'vue'

import { markFirstPaint } from '@/core/playable'
import { Logger } from '@/utils/logger'

import { refreshAuth, watchAuth } from './auth/session'
import AppShell from './components/AppShell.vue'
import NetToast from './components/NetToast.vue'
import { closePerson, shownPerson } from './person-layer'
import { currentRoute, startRouter } from './router'
import type { ScreenName } from './router/routes'
import './styles/theme.css'

// Полный набор имён обязателен: забытый экран уронит проверку типов, а не вскроется пустым окном у пользователя.
const SCREENS: Record<ScreenName, Component> = {
  home: defineAsyncComponent(() => import('./screens/HomeScreen.vue')),
  lists: defineAsyncComponent(() => import('./screens/ListsScreen.vue')),
  stats: defineAsyncComponent(() => import('./screens/StatsScreen.vue')),
  history: defineAsyncComponent(() => import('./screens/HistoryScreen.vue')),
  search: defineAsyncComponent(() => import('./screens/SearchScreen.vue')),
  media: defineAsyncComponent(() => import('./screens/MediaScreen.vue')),
  studio: defineAsyncComponent(() => import('./screens/StudioScreen.vue')),
  // Плеер тянет за собой hls.js: отложенная загрузка здесь не украшение.
  player: defineAsyncComponent(() => import('./screens/PlayerScreen.vue')),
  settings: defineAsyncComponent(() => import('./screens/SettingsScreen.vue')),
  log: defineAsyncComponent(() => import('./screens/LogScreen.vue')),
}

// Окошко грузится по надобности: большая часть запусков обходится без него.
const PersonSheet = defineAsyncComponent(() => import('./components/PersonSheet.vue'))

const screen = computed<Component>(() => SCREENS[currentRoute.value.name])

let stopRouter: (() => void) | null = null
let stopAuth: (() => void) | null = null

onMounted(() => {
  stopRouter = startRouter()

  // Состояние входа нужно всем экранам: без него запросы идут без подписи, а список выглядит пустым. Ошибка не роняет запуск: без входа приложение работает.
  void refreshAuth().catch((e: unknown) => {
    Logger('ERROR', 'Состояние входа не прочитано', e)
  })

  // Вход случается в стороннем окне, и ждать его надо всю жизнь окна, а не пока открыт экран настроек.
  void watchAuth()
    .then((stop) => {
      stopAuth = stop
    })
    .catch((e: unknown) => {
      Logger('ERROR', 'Подписка на вход не удалась', e)
    })

  // Очередь меток доступности ждёт этого сигнала: до первой отрисовки её запросы отнимали бы слоты у полок. Два кадра: первый лишь сообщает, что разметка собрана.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markFirstPaint()
    })
  })
})

onBeforeUnmount(() => {
  stopAuth?.()
  stopAuth = null

  if (stopRouter === null) return
  stopRouter()
  stopRouter = null
})
</script>

<template>
  <AppShell>
    <component :is="screen" />
  </AppShell>

  <!-- Вне рамки: плашка лежит поверх всего окна и не должна попадать под блюр рельса. -->
  <NetToast />

  <!-- Рядом с рамкой, а не внутри неё: блюр рельса создаёт свой контекст
       наложения, и окошко внутри него прижалось бы к содержимому. -->
  <Transition name="am-sheet">
    <PersonSheet v-if="shownPerson" :start="shownPerson" @close="closePerson" />
  </Transition>
</template>
