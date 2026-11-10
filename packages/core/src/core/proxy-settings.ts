// Настройка прокси со стороны разметки: чтение, запись и вопрос о перезапуске.
// Разбор значений обязан совпадать с Rust (proxy.rs, anilist.rs) — там те же ключи.

import { Bridge, type ProxyStatus } from '@/bridge'
import { Logger } from '../utils/logger'

import {
  DEFAULT_PROXY,
  PROXY_KEYS,
  normalizeProxyKind,
  normalizeProxyPort,
  proxyUrl,
  type ProxyConfig,
} from './proxy'

/**
 * Что записано в настройках; дефолт — только при отсутствии ключа (пустая строка — выбор человека).
 */
export async function readProxyConfig(): Promise<ProxyConfig> {
  const storage = Bridge.storage

  const [enabled, kind, host, port, login, bypass] = await Promise.all([
    storage.get(PROXY_KEYS.enabled, DEFAULT_PROXY.enabled),
    storage.get(PROXY_KEYS.kind, DEFAULT_PROXY.kind),
    storage.get(PROXY_KEYS.host, DEFAULT_PROXY.host),
    storage.get(PROXY_KEYS.port, DEFAULT_PROXY.port),
    storage.get(PROXY_KEYS.login, DEFAULT_PROXY.login),
    storage.get(PROXY_KEYS.bypass, DEFAULT_PROXY.bypass),
  ])

  return {
    // Строго true, как и matches!(…, Bool(true)) в proxy.rs: «да» строкой
    // движок за включение не считает, и панель врать про это не должна.
    enabled: enabled === true,
    kind: normalizeProxyKind(kind),
    // Обрезка пробелов — как read_string() в Rust.
    host: String(host ?? '').trim(),
    port: normalizeProxyPort(port),
    login: String(login ?? '').trim(),
    bypass: String(bypass ?? ''),
  }
}

/**
 * Записать одно поле и сразу вернуть управление; отказ записи остаётся в журнале, как у saveSetting.
 */
export async function saveProxyField<K extends keyof ProxyConfig>(
  field: K,
  value: ProxyConfig[K],
): Promise<void> {
  try {
    await Bridge.storage.set(PROXY_KEYS[field], value)
  } catch (e) {
    Logger('ERROR', `Не удалось сохранить настройку прокси ${PROXY_KEYS[field]}`, e)
  }
}

/** Задан ли пароль прокси. Сам пароль окну не отдаётся; отказ оболочки — «не задан». */
export async function proxyPasswordSet(): Promise<boolean> {
  try {
    return await Bridge.proxyDiagnostics.passwordSet()
  } catch (e) {
    Logger('ERROR', 'Не удалось узнать, задан ли пароль прокси', e)
    return false
  }
}

/**
 * Задаёт пароль прокси (пустая строка стирает) и отвечает, задан ли он теперь. Пароль не
 * обрезается: пробел по краям законен. null — оболочка отказала, причина в журнале.
 */
export async function saveProxyPassword(password: string): Promise<boolean | null> {
  try {
    return await Bridge.proxyDiagnostics.setPassword(password)
  } catch (e) {
    Logger('ERROR', 'Не удалось сохранить пароль прокси', e)
    return null
  }
}

/**
 * Нужен ли перезапуск: ключи WebView2 читаются один раз, сравнивается адрес у движка с записанным.
 */
export function proxyRestartNeeded(
  applied: Pick<ProxyStatus, 'outcome' | 'server'>,
  config: ProxyConfig,
): boolean {
  const wanted = proxyUrl(config)

  // Настройка снята: перезапуск нужен, только если движок всё ещё с прокси.
  if (wanted === null) return applied.outcome === 'applied'

  return applied.server !== wanted
}
