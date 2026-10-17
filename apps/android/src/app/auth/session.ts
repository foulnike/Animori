// Единственное место, которое знает про вызовы Rust: токен живёт в src-tauri/src/auth.rs.
// Здесь только состояние пропуска: без него общий код считал бы, что входа нет.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { setShellSigned } from '@/api/anilist'

/// Совпадает с AuthStatus в auth.rs. Срок — секунды эпохи Unix, null — неизвестен.
type AuthStatus = { authorized: boolean; expiresAt: number | null }

// Повторяет EVENT_CHANGED в auth.rs: два места расходиться не должны.
const EVENT_CHANGED = 'animori://auth-changed'

/// В браузере (npm run dev:app) моста нет, и invoke упал бы на первой отрисовке.
function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function remember(status: AuthStatus): void {
  setShellSigned(status.authorized)
}

/// Спросить состояние входа у Rust: на старте и при каждом открытии настроек.
export async function refreshAuth(): Promise<void> {
  if (!isDesktop()) return
  remember(await invoke<AuthStatus>('animori_auth_status'))
}

/// Подписка на событие входа: вход случается вне разметки, событие — единственный
/// способ узнать об успехе сразу. Возвращает отключатель, как startRouter.
export async function watchAuth(): Promise<() => void> {
  if (!isDesktop()) return () => {}

  return listen<AuthStatus>(EVENT_CHANGED, (event) => {
    remember(event.payload)
  })
}
