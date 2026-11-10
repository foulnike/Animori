// IBridge для десктопной оболочки Tauri. Единственная реализация: псевдопуть '@bridge-impl' из vite.config.ts ведёт сюда.

import { invoke } from '@tauri-apps/api/core'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

import { Logger } from '@/utils/logger'
import { redactUrl } from '@/utils/redact'

import {
  BridgeHttpError,
  type HttpBytesResponse,
  type HttpRequestOptions,
  type HttpResponse,
  type IBridge,
  type IClipboard,
  type IExport,
  type IFiles,
  type IHttp,
  type IShell,
  type IStorage,
} from './IBridge'
import { tauriAniList } from './TauriAniList'
import { tauriCloud } from './TauriCloud'
import { tauriProxyDiagnostics } from './TauriProxyDiagnostics'

// ==== storage ====

/** Снимок файла настроек в памяти: одно чтение вместо трёх десятков get() на старте. */
let snapshot: Map<string, unknown> | null = null

/** Незавершённая загрузка снимка: параллельные чтения не дёргают команду повторно. */
let snapshotLoading: Promise<Map<string, unknown> | null> | null = null

/** Закрытые ключи оболочки: дубль запрета, основной в команде хранилища (storage.rs).
 *  Секреты окну не выдаются вовсе: их читают только команды Rust через secrets.rs. */
const CLOSED_KEYS = new Set(['auth_token', 'auth_expires_at', 'am_cloud_token', 'set_proxy_pass'])

async function loadSnapshot(): Promise<Map<string, unknown> | null> {
  if (snapshot) return snapshot
  if (snapshotLoading) return snapshotLoading

  snapshotLoading = (async () => {
    try {
      const entries = await invoke<Record<string, unknown>>('animori_storage_read')
      snapshot = new Map(Object.entries(entries))
      return snapshot
    } catch (e) {
      // Падать незачем: чтение повторится при следующем обращении.
      Logger('ERROR', 'Файл настроек не прочитан целиком', e)
      return null
    } finally {
      snapshotLoading = null
    }
  })()

  return snapshotLoading
}

/** Незавершённые записи: вызывающие set() его не ждут, а flush() обязан их дождаться. */
const pendingWrites = new Set<Promise<void>>()

/** Предел проходов flush(): без него непрерывный поток set() держит ожидание вечно. */
const FLUSH_MAX_ROUNDS = 5

// Перегрузки объявлены функцией: объектный литерал перегруженный метод не реализует.
async function storageGet<T>(key: string, defaultValue: T): Promise<T>
async function storageGet<T = unknown>(key: string): Promise<T | undefined>
async function storageGet<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const hasDefault = arguments.length >= 2

  // Закрытые ключи минуют снимок: вторая сетка поверх запрета в оболочке.
  if (CLOSED_KEYS.has(key)) return defaultValue as T

  const cache = await loadSnapshot()
  const value = cache?.get(key) as T | undefined

  if (value === undefined && hasDefault) return defaultValue as T
  return value
}

/** Запись значения и немедленная выгрузка файла на диск. */
async function writeValue(key: string, value: unknown): Promise<void> {
  // Снимок правится сразу: чтение сразу после set() обязано видеть новое значение.
  if (snapshot) snapshot.set(key, value)

  await invoke('animori_storage_write', { key, value })
}

const tauriStorage: IStorage = {
  get: storageGet,

  set(key: string, value: unknown): Promise<void> {
    const write = writeValue(key, value)

    // В реестр идёт ветвь без отклонения: flush() не должен падать из-за чужой ошибки.
    const tracked = write.catch(() => undefined)
    pendingWrites.add(tracked)
    void tracked.then(() => {
      pendingWrites.delete(tracked)
    })

    return write
  },

  async flush(): Promise<void> {
    // Несколько проходов: пока ждём партию, могли прийти новые записи.
    for (let round = 0; round < FLUSH_MAX_ROUNDS; round++) {
      if (pendingWrites.size === 0) return
      await Promise.all([...pendingWrites])
    }
  },
}

// ==== files ====

/**
 * Запасная копия снимка файлом в приватном каталоге; каталог и имена — в files.rs. Отказ не отклоняется: дубль — страховка и портить сохранение в основное хранилище не должен.
 */
const tauriFiles: IFiles = {
  available: true,

  async read(name: string): Promise<string | null> {
    try {
      const text = await invoke<string | null>('animori_file_read', { name })
      return text ?? null
    } catch (e) {
      Logger('ERROR', `Файл приложения не прочитан: ${name}`, e)
      return null
    }
  },

  async write(name: string, text: string): Promise<boolean> {
    try {
      await invoke('animori_file_write', { name, text })
      return true
    } catch (e) {
      Logger('ERROR', `Файл приложения не записан: ${name}`, e)
      return false
    }
  },
}

// ==== выгрузка ====

/**
 * Выгрузка в папку человека  и сохранение трека; окно выбора открывает Rust (export.rs). Отказы не глотаются, в отличие от tauriFiles: выгрузку человек затеял руками и ждёт ответа.
 */
const tauriExport: IExport = {
  available: true,

  async pickDir(): Promise<string | null> {
    // null — человек закрыл окно выбора. Это не ошибка и наверх идёт как есть.
    const picked = await invoke<string | null>('animori_export_pick_dir')
    return picked ?? null
  },

  async write(dir: string, name: string, text: string): Promise<string> {
    // Ответ команды — полный путь записанного файла, его и отдаём.
    return await invoke<string>('animori_export_write', { dir, name, text })
  },

  async pickTrackDir(): Promise<string | null> {
    // Своя команда, а не animori_export_pick_dir: разница в заголовке окна выбора. Выбранная папка никуда не записывается: спрашиваем каждый раз.
    const picked = await invoke<string | null>('animori_track_pick_dir')
    return picked ?? null
  },

  async writeTrack(dir: string, name: string, bytesBase64: string): Promise<string> {
    // Ключ именно bytes: в export.rs параметр назван одним словом, иначе пришлось бы помнить про перевод camelCase в snake_case на стороне Tauri.
    return await invoke<string>('animori_track_write', { dir, name, bytes: bytesBase64 })
  },
}

// ==== http ====

/**
 * Запросы окна идут через Rust (net.rs): прокси вместе с паролем собирает оболочка, адрес сверяется
 * со списком hosts.rs до сети. Окно передаёт только адрес, заголовки и тело — пароля прокси оно не
 * видит. Куки окна не участвуют: их не было и у прежнего плагина HTTP.
 */
type RawNetReply = {
  status: number
  statusText: string
  headers: Record<string, string>
  text: string | null
  bytesBase64: string | null
  url: string
}

/**
 * Отказ команды в вид сбоя моста. Через invoke приходит только строка, её префикс и есть вид сбоя
 * (classify() в net.rs). Адрес в журнал идёт без запроса: в адресах тел Диска лежит подпись доступа.
 */
function toHttpError(error: unknown, url: string): BridgeHttpError {
  const text =
    typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)

  Logger('ERROR', `Запрос не ушёл: ${redactUrl(url)}`, text)

  if (text.startsWith('timeout:')) return new BridgeHttpError('timeout', url)
  return new BridgeHttpError('network', url)
}

/** Общая часть обоих запросов. Коды вне 2xx не трогаем: их разбирает вызывающий. */
async function sendRequest(options: HttpRequestOptions, bytes: boolean): Promise<RawNetReply> {
  const { url, method = 'GET', headers, body, timeoutMs } = options

  try {
    return await invoke<RawNetReply>('animori_http_request', {
      request: { method, url, headers: headers ?? {}, body, timeoutMs, bytes },
    })
  } catch (e) {
    throw toHttpError(e, url)
  }
}

const tauriHttp: IHttp = {
  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const raw = await sendRequest(options, false)

    return {
      status: raw.status,
      statusText: raw.statusText,
      ok: raw.status >= 200 && raw.status < 300,
      headers: raw.headers,
      text: raw.text ?? '',
      url: raw.url || options.url,
    }
  },

  async requestBytes(options: HttpRequestOptions): Promise<HttpBytesResponse> {
    const raw = await sendRequest(options, true)

    return {
      status: raw.status,
      statusText: raw.statusText,
      ok: raw.status >= 200 && raw.status < 300,
      headers: raw.headers,
      bytesBase64: raw.bytesBase64 ?? '',
      url: raw.url || options.url,
    }
  },
}

// ==== clipboard ====

const tauriClipboard: IClipboard = {
  async writeText(text: string): Promise<void> {
    // Без фоллбэка: отказ означает невыданное разрешение, это надо видеть.
    await writeText(text)
  },
}

// ==== shell ====

/**
 * Оболочка: свои команды из lib.rs плюс история WebView; они требуют разрешений (build.rs и capabilities). Перезагрузка, внешние ссылки, полный экран и трансляция — только командами.
 */
const tauriShell: IShell = {
  // Умения приходят из сборки, а не живут здесь литералом: файл моста общий у двух продуктов, оболочки разные.
  // Окно Windows умеет все пять, телевизор — ни одного (__ANIMORI_SHELL_CAN__ в vite.config.ts).
  can: __ANIMORI_SHELL_CAN__,

  async reload(): Promise<void> {
    await invoke('animori_reload')
  },

  restart(): Promise<void> {
    // Ответа не будет: команда уводит процесс целиком, и обещание invoke не разрешится никогда — отдаём управление сразу. Отказ не глотается: невыданное разрешение или нет команды.
    void invoke('animori_restart').catch((e) => {
      Logger('ERROR', 'Перезапуск не удался', e)
    })

    return Promise.resolve()
  },

  async openExternal(url: string): Promise<void> {
    // Проверка схемы на стороне Rust: разметка вправе позвать это с любым адресом.
    await invoke('animori_open_external', { url })
  },

  back(): Promise<void> {
    // Через историю WebView: шаг по истории окна, а не по своему стеку экранов.
    history.back()
    return Promise.resolve()
  },

  forward(): Promise<void> {
    history.forward()
    return Promise.resolve()
  },

  async toggleFullscreen(): Promise<boolean> {
    // Ответ команды — состояние ПОСЛЕ переключения, его и отдаём как есть.
    return await invoke<boolean>('animori_toggle_fullscreen')
  },

  async castPanel(): Promise<void> {
    // Своя команда, а не animori_open_external: там разрешены только http и https, а панель системы живёт по своей схеме. Ответа нет намеренно: какая панель открылась, знает Rust.
    await invoke('animori_cast_panel')
  },

  async devtools(): Promise<void> {
    // Своя команда: панель открывает WebView2 изнутри, и никакой разрешённый адрес её не откроет.
    await invoke('animori_devtools')
  },
}

// ==== сборка ====

export const tauriBridge: IBridge = {
  platform: 'tauri',
  storage: tauriStorage,
  files: tauriFiles,
  // Реализация выше: чужая папка и окно выбора, отдельно от служебных files.
  exportFile: tauriExport,
  http: tauriHttp,
  // Реализация в TauriAniList.ts: запрос собирает Rust вместе с пропуском.
  anilist: tauriAniList,
  clipboard: tauriClipboard,
  shell: tauriShell,
  // Реализация в TauriProxyDiagnostics.ts.
  proxyDiagnostics: tauriProxyDiagnostics,
  // Реализация в TauriCloud.ts: пропуск Диска живёт только в оболочке.
  cloud: tauriCloud,
}

// Имя экспорта, которого ждёт '@bridge-impl'. Общее для любой реализации.
export { tauriBridge as platformBridge }
