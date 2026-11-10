import { vi } from 'vitest'
import {
  BridgeHttpError,
  type CloudStep,
  type HttpErrorKind,
  type IBridge,
} from '../../src/bridge/IBridge'

export interface MockBridgeHandle {
  bridge: IBridge
  /** Ответ облачного шага по имени метода моста: connect, check, stat, save, restore, share, unshare. */
  setCloudStep(name: string, step: CloudStep): void
  /** Пропуск, будто уже сохранённый в оболочке. */
  setCloudToken(token: string): void
  /** Что сейчас «лежит в оболочке» — для проверки, что connect сохранил пропуск. */
  getCloudToken(): string
  setFile(name: string, text: string | null): void
  getFile(name: string): string | null
  setHttpResponse(url: string, response: unknown): void
  /** Отказ транспорта вместо ответа: то, что присылает мост при сети, таймауте или отмене. */
  setHttpError(url: string, kind: HttpErrorKind): void
  setHttpBytes(url: string, bytes: Uint8Array): void
  calls: {
    http: Array<{ url: string; method?: string }>
    httpBytes: Array<{ url: string; method?: string }>
    // Заголовки запросов лежат отдельно и параллельно http: добавление их в сам вызов
    // ломает тесты, сравнивающие его целиком.
    httpHeaders: Array<Record<string, string> | undefined>
    storageGet: string[]
    storageSet: Array<{ key: string; value: unknown }>
  }
}

/**
 * Статус ответа из заглушки. По умолчанию 200, но проверке описи датасета
 * нужен и 304: без него самый частый ответ сервера остался бы непроверенным.
 */
function statusOf(payload: unknown): number {
  if (typeof payload === 'object' && payload !== null && 'status' in payload) {
    const given = Number((payload as { status: unknown }).status)
    if (Number.isFinite(given)) return given
  }

  return 200
}

/** Заголовки из заглушки: нужны etag описи и его проверка через If-None-Match. */
function headersOf(payload: unknown): Record<string, string> {
  if (typeof payload === 'object' && payload !== null && 'headers' in payload) {
    const given = (payload as { headers: unknown }).headers
    if (typeof given === 'object' && given !== null) return given as Record<string, string>
  }

  return {}
}

function textResponse(url: string, payload: unknown, status = 200) {
  const text =
    typeof payload === 'object' && payload !== null && 'text' in payload
      ? String((payload as { text: unknown }).text)
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload)
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Failed',
    ok: status >= 200 && status < 300,
    headers: headersOf(payload),
    text,
    url,
  }
}

function bytesResponse(url: string, bytes: Uint8Array, status = 200) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0)
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Failed',
    ok: status >= 200 && status < 300,
    headers: {},
    bytesBase64: btoa(binary),
    url,
  }
}

export function createMockBridge(options: { filesAvailable?: boolean } = {}): MockBridgeHandle {
  const files = new Map<string, string>()
  const httpResponses = new Map<string, unknown>()
  const httpErrors = new Map<string, HttpErrorKind>()
  const byteResponses = new Map<string, Uint8Array>()
  const storage = new Map<string, unknown>()
  const cloudSteps = new Map<string, CloudStep>()
  let cloudToken = ''
  let proxyPassword = ''

  const handle: MockBridgeHandle = {
    setCloudStep: (name, step) => {
      cloudSteps.set(name, step)
    },
    setCloudToken: (token) => {
      cloudToken = token
    },
    getCloudToken: () => cloudToken,
    calls: {
      http: [],
      httpBytes: [],
      httpHeaders: [],
      storageGet: [],
      storageSet: [],
    },
    setFile: (name, text) => {
      if (text === null) files.delete(name)
      else files.set(name, text)
    },
    getFile: (name) => files.get(name) ?? null,
    setHttpResponse: (url, response) => {
      httpResponses.set(url, response)
    },
    setHttpError: (url, kind) => {
      httpErrors.set(url, kind)
    },
    setHttpBytes: (url, bytes) => {
      byteResponses.set(url, bytes)
    },
    bridge: {
      platform: 'tauri',
      files: {
        get available() {
          return options.filesAvailable ?? true
        },
        async read(name) {
          return files.get(name) ?? null
        },
        async write(name, text) {
          files.set(name, text)
          return true
        },
      },
      // Выгрузка файлом: окна выбора папки в проверках нет, поэтому оба вопроса отвечают null
      // (отмена), а запись возвращает собранный путь — проверять, куда уехало, удобнее по нему.
      exportFile: {
        get available() {
          return options.filesAvailable ?? true
        },
        async pickDir() {
          return null
        },
        async write(dir, name) {
          return `${dir}/${name}`
        },
        async pickTrackDir() {
          return null
        },
        async writeTrack(dir, name) {
          return `${dir}/${name}`
        },
      },
      http: {
        async request(request) {
          handle.calls.http.push({ url: request.url, method: request.method })
          handle.calls.httpHeaders.push(request.headers)
          // Отказ транспорта проверяется раньше ответа: в жизни сбой сети приходит вместо
          // кода, и подставить 503 вместо обрыва значит проверить не тот случай.
          const failure = httpErrors.get(request.url)
          if (failure) throw new BridgeHttpError(failure, request.url)
          const response = httpResponses.get(request.url)
          return textResponse(request.url, response ?? {}, statusOf(response))
        },
        async requestBytes(request) {
          handle.calls.httpBytes.push({ url: request.url, method: request.method })
          handle.calls.httpHeaders.push(request.headers)
          const bytes = byteResponses.get(request.url) ?? new Uint8Array()
          return bytesResponse(request.url, bytes)
        },
      },
      storage: {
        async get<T>(key: string, defaultValue?: T) {
          handle.calls.storageGet.push(key)
          const value = storage.get(key)
          return (value === undefined ? defaultValue : value) as T | undefined
        },
        async set(key, value) {
          handle.calls.storageSet.push({ key, value })
          storage.set(key, value)
        },
        async flush() {},
      },
      anilist: {
        query: vi.fn(),
      },
      clipboard: {
        writeText: vi.fn(),
      },
      shell: {
        // Заглушка объявляет умения десктопа: проверки общего ядра не должны зависеть от
        // того, на какой платформе их гоняют. Продукт без этих умений проверяет себя сам.
        can: { browser: true, history: true, fullscreen: true, cast: true, devtools: true },
        reload: vi.fn(),
        restart: vi.fn(),
        openExternal: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        toggleFullscreen: vi.fn(),
        castPanel: vi.fn(),
        devtools: vi.fn(),
      },
      proxyDiagnostics: {
        status: vi.fn(),
        probe: vi.fn(),
        passwordSet: vi.fn(async () => proxyPassword !== ''),
        setPassword: vi.fn(async (password: string) => {
          proxyPassword = password
          return password !== ''
        }),
      },
      // Облако: пропуск живёт в заглушке, как в оболочке, — окну он не возвращается.
      // Ответы шагов задаются через setCloudStep; по умолчанию 200 с пустым объектом.
      cloud: {
        status: vi.fn(async () => cloudToken !== ''),
        connect: vi.fn(async (token: string) => {
          const reply = cloudReply('connect')
          if (reply.status < 300 || reply.status === 404) cloudToken = token.trim()
          return reply
        }),
        forget: vi.fn(async () => {
          cloudToken = ''
        }),
        check: vi.fn(async () => cloudReply('check')),
        stat: vi.fn(async () => cloudReply('stat')),
        save: vi.fn(async () => cloudReply('save')),
        restore: vi.fn(async () => cloudReply('restore')),
        share: vi.fn(async () => cloudReply('share')),
        unshare: vi.fn(async () => cloudReply('unshare')),
      },
    },
  }

  function cloudReply(name: string): CloudStep {
    return cloudSteps.get(name) ?? { stage: 'api', status: 200, text: '{}' }
  }

  return handle
}
