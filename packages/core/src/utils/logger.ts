// Ядро журнала: запись, кольцевой буфер в памяти и глобальные перехватчики ошибок. UI сюда не входит,
// связь через registerLogSink(); буфер один на все виды, ERROR вытесняется последним.

export type LogType = 'INFO' | 'WARN' | 'ERROR' | 'DB' | 'API'

export interface LogEntry {
  id: number
  /** Часы и миллисекунды готовой строкой: и чтение, и копирование не пересчитывают время сами. */
  time: string
  /**
   * Момент записи в миллисекундах эпохи: без него журнал через полночь читался бы как один длинный день.
   * У записей прежних сборок поля нет, и подпись остаётся часами.
   */
  at?: number
  /**
   * Маршрут на момент записи — хэш приложения. Прежде здесь стоял путь к index.html: в приложении он всегда
   * один и ничего не говорил. У записей прежних сборок поля нет.
   */
  route?: string
  type: LogType | string
  message: string
  details: unknown
  stack: string
}

/** Сколько записей всего в памяти: буфер один на все виды записей. */
export const LOG_CAPACITY = 500

/** Сколько последних записей переживает переход между страницами (квота sessionStorage). */
const SESSION_KEEP = 200

/** Пауза между записями в sessionStorage. */
const FLUSH_DELAY_MS = 1000

/** Ключ хвоста журнала в памяти вкладки. */
const SESSION_KEY = 'animori_logs'

/**
 * Форма хвоста в хранилище. Записи прежней формы разбирать нечем: там лежало `path` вместо `route` и не было момента времени, а истёкших журналов за полсеанса никто не читает.
 */
const SESSION_FORMAT = 2

export let scriptLogs: LogEntry[] = []

/**
 * Записываем ли. По умолчанию — да, как и в настройках: до их чтения журнал писать уже есть чем, и молчаливая потеря первых записей после старта хуже лишних.
 */
let enabled = true

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushHooksInstalled = false
let handlersInstalled = false

/** Включение записи: зовёт главный запуск сразу после чтения настроек. */
export function setLogEnabled(value: boolean): void {
  enabled = value
}

/**
 * Значение, переживающее JSON.stringify. Один негодяй — цикл, DOM-узел, BigInt — иначе уронил бы запись
 * всего хвоста разом, а молчаливый перехват в flushSessionLogs отключил бы переживание перезагрузки.
 */
function plain(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? String(value) : value
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return `не приводится к строке: ${Object.prototype.toString.call(value)}`
  }
}

/**
 * Освобождает место под новую запись, если буфер полон. Вытесняется самая старая запись не-ERROR; в буфере из одних ошибок — самая старая из них.
 */
function makeRoom(): void {
  while (scriptLogs.length >= LOG_CAPACITY) {
    const victim = scriptLogs.findIndex((x) => x.type !== 'ERROR')
    scriptLogs.splice(victim >= 0 ? victim : 0, 1)
  }
}

/** Сбрасывает хвост логов в sessionStorage прямо сейчас. */
function flushSessionLogs(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    const rows = scriptLogs.slice(-SESSION_KEEP)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ v: SESSION_FORMAT, rows }))
  } catch {
    /* квота исчерпана — записи в памяти остались, потеряется только переживание перезагрузки */
  }
}

/**
 * Планирует запись; повторные вызовы в пределах окна ничего не стоят. При уходе со страницы хвост дописывается принудительно: иначе терялись бы последние секунды лога.
 */
function scheduleSessionFlush(): void {
  if (!flushHooksInstalled) {
    flushHooksInstalled = true
    window.addEventListener('pagehide', flushSessionLogs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSessionLogs()
    })
  }
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushSessionLogs()
  }, FLUSH_DELAY_MS)
}

/**
 * Восстановление логов из sessionStorage после чтения настроек и только при включённом журнале. Хвост прежней формы уходит молча: он истёк и по смыслу, и разбирать его нечем.
 */
function restoreSessionLogs(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (raw === null) return

    const saved = JSON.parse(raw) as { v?: number; rows?: unknown }
    if (saved?.v !== SESSION_FORMAT || !Array.isArray(saved.rows)) {
      sessionStorage.removeItem(SESSION_KEY)
      return
    }

    // Обрезка по LOG_CAPACITY: в хранилище может лежать больше, чем поместится в буфер.
    scriptLogs = (saved.rows as LogEntry[]).slice(-LOG_CAPACITY)
  } catch (e) {
    // Logger может быть не готов — прямой console.warn.
    console.warn('[AniMori] Не удалось восстановить логи сессии', e)
  }
}

/**
 * Подписчик показа: получает каждую новую запись, пока открыт. Один на всех — читателей журнала больше одного не бывает.
 */
let logSink: ((entry: LogEntry) => void) | null = null

export function registerLogSink(sink: ((entry: LogEntry) => void) | null): void {
  logSink = sink
}

/** Что уже накопилось: читателю нужен не только поток, но и предыстория. */
export function readLogs(): ReadonlyArray<LogEntry> {
  return scriptLogs
}

/** Забывает записи этого запуска вместе с их копией в памяти вкладки. */
export function clearLogs(): void {
  scriptLogs = []

  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* памяти вкладки может не быть — записи и так уже забыты */
  }
}

export function Logger(type: LogType | string, message: string, details: unknown = null): void {
  if (
    (globalThis as { __ANIMORI_LOGGER_ENABLED__?: boolean }).__ANIMORI_LOGGER_ENABLED__ === false
  ) {
    return
  }
  if (!enabled) return

  // Ошибка разворачивается в плоский объект: и стек полезен, и в строку он уходит без потерь.
  const value =
    details instanceof Error
      ? { name: details.name, message: details.message, stack: details.stack }
      : details

  const d = new Date()
  const time = `${d.toLocaleTimeString('ru-RU', { hour12: false })}.${String(
    d.getMilliseconds(),
  ).padStart(3, '0')}`

  // Маршрут, а не путь к файлу: приложение живёт на хэше, и путь у всех записей один.
  const route = window.location.hash === '' ? window.location.pathname : window.location.hash
  const stackLines =
    type === 'ERROR' || type === 'WARN' ? (new Error().stack ?? '').split('\n') : []
  const stack = stackLines.length > 2 ? stackLines.slice(2).join('\n') : ''

  const entry: LogEntry = {
    id: Date.now() + Math.random(),
    time,
    at: d.getTime(),
    route,
    type,
    message,
    details: plain(value),
    stack,
  }

  makeRoom()
  scriptLogs.push(entry)

  scheduleSessionFlush()

  // Читатель журнала — чужой код: упав он не должен уронить место, откуда пришла запись.
  try {
    if (logSink) logSink(entry)
  } catch (e) {
    console.error('[AniMori] Читатель журнала упал на записи', e)
  }

  if (type === 'ERROR') console.error(`[AniMori ERROR] ${message}`, details || '')
  else if (type === 'WARN') console.warn(`[AniMori WARN] ${message}`, details || '')
}

/** Перехватчики ошибок и восстановление прошлой сессии: ставятся из start(). Вешаются всегда, а не
 * по флагу:  флаг переключается на ходу. Хвост прошлой сессии восстанавливается только при включённом журнале. */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled) return
  handlersInstalled = true

  if (enabled) restoreSessionLogs()

  window.addEventListener('error', (e: ErrorEvent) => {
    Logger('ERROR', `Uncaught Error: ${e.message}`, {
      file: e.filename,
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack,
    })
  })

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    Logger(
      'ERROR',
      `Unhandled Promise Rejection: ${e.reason}`,
      typeof e.reason === 'object' ? e.reason : { reason: e.reason },
    )
  })
}
