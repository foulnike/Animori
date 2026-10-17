// Свой маршрутизатор на хэше: страница живёт файлом внутри приложения, обычный путь искал бы такой файл.
// Переход бывает обычным (новая запись истории) и заменой: без замены плеер и карточка образуют кольцо «назад».

import { computed, ref, type ComputedRef } from 'vue'

import { DEFAULT_ROUTE, SCREEN_DEPTH, SCREEN_NAMES, type Route, type ScreenName } from './routes'

const state = ref<Route>(DEFAULT_ROUTE)

/// Направление смены экрана: `deep` — внутрь, `back` — наружу, `even` — смена вкладки на той же глубине.
export type NavDirection = 'deep' | 'back' | 'even'

const direction = ref<NavDirection>('even')

export const navDirection: ComputedRef<NavDirection> = computed(() => direction.value)

let before: Route | null = null

const SCREENS_WITH_ID: ReadonlyArray<ScreenName> = ['media', 'studio', 'player']

export interface NavigateOptions {
  replace?: boolean
}

// Снаружи адрес только читают; менять его можно только через navigate.
export const currentRoute: ComputedRef<Route> = computed(() => state.value)

function isScreenName(value: string): value is ScreenName {
  return (SCREEN_NAMES as readonly string[]).includes(value)
}

// Неизвестный или битый адрес ведёт на главную: пустого экрана быть не должно.
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter((part) => part !== '')
  const head = parts[0] ?? ''
  if (!isScreenName(head)) return DEFAULT_ROUTE

  const params: Record<string, string> = {}
  const tail = parts[1]
  if (SCREENS_WITH_ID.includes(head) && tail !== undefined) {
    try {
      params.id = decodeURIComponent(tail)
    } catch {
      return DEFAULT_ROUTE
    }
  }
  return { name: head, params }
}

export function buildHash(name: ScreenName, params: Record<string, string> = {}): string {
  const id = params.id
  return id === undefined ? `#/${name}` : `#/${name}/${encodeURIComponent(id)}`
}

/// Адрес, с которого пришли на нынешний экран. Нужен экранам, которые сами выбирают между шагом назад и переходом
/// вперёд: возврат на пройденное историю не растит, а переход вперёд на него же заводит кольцо.
export function peekPrevious(): Route | null {
  return before
}

/// Направление берётся из глубины экранов, а не из истории: история помнит, откуда пришли, но не говорит, куда идём.
/// Два экрана одной глубины дают `even` — это соседний тайтл того же уровня, а не углубление.
function step(from: ScreenName, to: ScreenName): NavDirection {
  const gap = SCREEN_DEPTH[to] - SCREEN_DEPTH[from]
  if (gap > 0) return 'deep'
  if (gap < 0) return 'back'
  return 'even'
}

/** Повтор того же адреса за переход не в счёт. */
function land(next: Route): void {
  const now = state.value
  if (next.name === now.name && next.params.id === now.params.id) return

  direction.value = step(now.name, next.name)
  before = now
  state.value = next
}

export function navigate(
  name: ScreenName,
  params: Record<string, string> = {},
  options: NavigateOptions = {},
): void {
  const next = buildHash(name, params)
  if (window.location.hash === next) return

  if (options.replace !== true) {
    window.location.hash = next
    return
  }

  // replaceState молчит: hashchange он не поднимает, поэтому land() зовём сами.
  window.history.replaceState(null, '', next)
  land(parseHash(next))
}

// На телевизоре «Назад» будет жать сюда же, поэтому шаг назад один.
export function goBack(): void {
  window.history.back()
}

// Возвращает отключатель: иначе горячая замена в разработке копила бы подписчиков.
export function startRouter(): () => void {
  const apply = (): void => {
    land(parseHash(window.location.hash))
  }

  apply()
  window.addEventListener('hashchange', apply)
  return () => window.removeEventListener('hashchange', apply)
}
