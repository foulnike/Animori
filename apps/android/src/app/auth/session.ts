// Единственное место с вызовами Rust; экраны видят только authStatus. Токена здесь нет —
// он в auth.rs, туда же идут запросы. Вход через приёмник на 127.0.0.1 и системный браузер.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { computed, ref, type ComputedRef } from 'vue'

import { setShellSigned } from '@/api/anilist'

/// Форма ответа команд входа. Совпадает с AuthStatus в auth.rs.
export type AuthStatus = {
  authorized: boolean
  /// Секунды эпохи Unix. null — срок неизвестен.
  expiresAt: number | null
}

/// Ответ на начало входа. Совпадает с LoginStart в auth.rs.
export type LoginStart = {
  /// Сколько секунд приёмник ждёт пропуск.
  waitSecs: number
}

// Повторяет EVENT_CHANGED в auth.rs: два места расходиться не должны.
const EVENT_CHANGED = 'animori://auth-changed'

const state = ref<AuthStatus>({ authorized: false, expiresAt: null })

export const authStatus: ComputedRef<AuthStatus> = computed(() => state.value)

/// В браузере (npm run dev:app) моста нет, и вызов invoke упал бы с ошибкой при первой же отрисовке настроек.
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/// Запоминает состояние и сообщает клиенту AniList: без этого общий код судил бы о входе
/// по своему токену в разметке, списка не было бы после входа.
function remember(status: AuthStatus): void {
  state.value = status
  setShellSigned(status.authorized)
}

/// Спросить состояние входа у Rust. Зовётся на старте приложения и при каждом открытии настроек.
export async function refreshAuth(): Promise<void> {
  if (!isTauri()) return
  remember(await invoke<AuthStatus>('animori_auth_status'))
}

/// Начать вход: Rust поднимает приёмник и открывает адрес в системном браузере.
export async function startLogin(): Promise<LoginStart> {
  return invoke<LoginStart>('animori_auth_start')
}

/// Запасной путь: токен, вставленный руками. Срок не передаётся: его нет ни в токене, ни у человека перед глазами.
export async function submitToken(token: string): Promise<void> {
  remember(await invoke<AuthStatus>('animori_auth_submit', { token, expiresIn: null }))
}

/// Выйти из аккаунта.
export async function logout(): Promise<void> {
  remember(await invoke<AuthStatus>('animori_auth_logout'))
}

/// Подписка на событие входа. Возвращает отключатель — так же, как startRouter. Вход случается
/// в браузере, и событие — единственный способ узнать об успехе сразу.
export async function watchAuth(): Promise<() => void> {
  if (!isTauri()) return () => {}

  return listen<AuthStatus>(EVENT_CHANGED, (event) => {
    remember(event.payload)
  })
}
