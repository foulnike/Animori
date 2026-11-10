// Реализация ICloud для оболочки Tauri. Вынесена из TauriBridge.ts ради размера.
// Пропуск уходит в оболочку один раз — в connect(); дальше команды берут его сами (cloud.rs).

import { invoke } from '@tauri-apps/api/core'

import { BridgeHttpError, type CloudStep, type ICloud } from './IBridge'

/** Адрес для BridgeHttpError: сам запрос собирает оболочка, окно знает только API. */
const API = 'https://cloud-api.yandex.net/v1/disk/resources'

/**
 * Отказ команды в ошибку моста. Префикс строки — вид сбоя (classify() в net.rs, cloud.rs):
 * транспорт становится BridgeHttpError, остальное — Error со словами без префикса.
 */
function toError(error: unknown): Error {
  const text =
    typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)

  if (text.startsWith('timeout:')) return new BridgeHttpError('timeout', API, text)
  if (text.startsWith('network:')) return new BridgeHttpError('network', API, text)

  return new Error(text.replace(/^(auth|blocked|request):\s*/, ''))
}

async function step(command: string, args?: Record<string, unknown>): Promise<CloudStep> {
  try {
    return await invoke<CloudStep>(command, args)
  } catch (e) {
    throw toError(e)
  }
}

export const tauriCloud: ICloud = {
  async status(): Promise<boolean> {
    const raw = await invoke<{ connected: boolean }>('animori_cloud_status')
    return raw.connected
  },

  connect: (token: string) => step('animori_cloud_connect', { token }),

  async forget(): Promise<void> {
    try {
      await invoke('animori_cloud_delete')
    } catch (e) {
      throw toError(e)
    }
  },

  check: () => step('animori_cloud_check'),
  stat: () => step('animori_cloud_stat'),
  save: (text: string) => step('animori_cloud_save', { text }),
  restore: () => step('animori_cloud_restore'),
  share: () => step('animori_cloud_share'),
  unshare: () => step('animori_cloud_unshare'),
}
