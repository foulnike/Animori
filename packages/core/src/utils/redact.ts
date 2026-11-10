// Очистка текста и значений от секретов перед журналом и текстами ошибок. Одна точка на всё
// ядро: журнал (logger.ts), отказы моста (IBridge.ts) и всё, что идёт в «Скопировать журнал».
// Правило: лучше вычеркнуть лишнее, чем пропустить пропуск.

/** Чем заменяется вычеркнутое. */
export const REDACTED = '[скрыто]'

/** Ключи объектов, значения которых не пишутся никогда (сравнение без регистра и разделителей). */
const SECRET_KEYS = new Set([
  'authorization',
  'proxyauthorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'oauthtoken',
  'cloudtoken',
  'authtoken',
  'amcloudtoken',
  'password',
  'passwd',
  'pass',
  'setproxypass',
  'secret',
  'clientsecret',
  'apikey',
  'cookie',
  'setcookie',
  'basicauth',
])

/** Ключи с пользовательским текстом и выгрузками: в журнал идёт только размер. */
const BULKY_KEYS = new Set(['notes', 'note', 'text', 'body', 'xml', 'payload', 'entries'])

function normKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(normKey(key))
}

/**
 * Адрес без запроса, якоря и учётных данных: в адресах тел Диска и в старых ссылках входа
 * подпись и пропуск живут именно там. Не адрес — возвращается как есть.
 */
export function redactUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return redactText(raw)
  }
  const hasQuery = url.search !== ''
  const hasHash = url.hash !== ''
  const auth = url.username !== '' || url.password !== '' ? `${REDACTED}@` : ''
  const tail = (hasQuery ? `?${REDACTED}` : '') + (hasHash ? `#${REDACTED}` : '')
  return `${url.protocol}//${auth}${url.host}${url.pathname}${tail}`
}

/** Шаблоны в произвольной строке: заголовки, параметры адреса, пары ключ=значение. */
const TEXT_RULES: Array<[RegExp, string]> = [
  // Authorization: Bearer xxx / OAuth xxx / Basic xxx — и в заголовке, и в тексте исключения.
  [/\b((?:proxy-)?authorization)(["']?\s*[:=]\s*["']?)[^"'\r\n,}]*/gi, `$1$2${REDACTED}`],
  [/\b(Bearer|OAuth|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${REDACTED}`],
  // Учётные данные внутри адреса: scheme://user:pass@host.
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi, `$1${REDACTED}@`],
  // Параметры с секретами в адресе или теле формы.
  [
    /([?&#](?:access_token|token|auth|key|sign|signature|password|pass|secret|code|state)=)[^&#\s"']*/gi,
    `$1${REDACTED}`,
  ],
  // JSON и пары ключ=значение с секретными именами.
  [
    /(["']?(?:auth_token|am_cloud_token|set_proxy_pass|access_token|refresh_token|cloudToken|password|token)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
    `$1"${REDACTED}"`,
  ],
  // Пропуск AniList (JWT) и Яндекса (y0_...) без подписи, просто внутри текста.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  [/\by[0-3]_[A-Za-z0-9_-]{20,}\b/g, REDACTED],
]

export function redactText(text: string): string {
  let out = text
  for (const [pattern, replacement] of TEXT_RULES) out = out.replace(pattern, replacement)
  return out
}

/** Предел глубины обхода: цикл или очень глубокая структура не должны вешать журнал. */
const MAX_DEPTH = 6

/** Предел длины строки в подробностях записи: полный экспорт коллекции журналу не нужен. */
const MAX_STRING = 2000

function redactAny(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    const clean = redactText(value)
    return clean.length > MAX_STRING
      ? `${clean.slice(0, MAX_STRING)}… [ещё ${clean.length - MAX_STRING} знаков]`
      : clean
  }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[цикл]'
  if (depth >= MAX_DEPTH) return '[глубже не пишется]'
  seen.add(value)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack === undefined ? undefined : redactText(value.stack),
    }
  }

  if (Array.isArray(value)) {
    if (value.length > 50) return `[массив: ${value.length} элементов]`
    return value.map((item) => redactAny(item, depth + 1, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key)) {
      out[key] = inner === '' || inner === null || inner === undefined ? inner : REDACTED
    } else if (BULKY_KEYS.has(normKey(key)) && typeof inner === 'string') {
      out[key] = `[${inner.length} знаков]`
    } else if (BULKY_KEYS.has(normKey(key)) && Array.isArray(inner)) {
      out[key] = `[массив: ${inner.length} элементов]`
    } else if (normKey(key) === 'url' && typeof inner === 'string') {
      out[key] = redactUrl(inner)
    } else {
      out[key] = redactAny(inner, depth + 1, seen)
    }
  }
  return out
}

/** Копия значения без секретов, пригодная для журнала. Исходник не меняется. */
export function redactValue(value: unknown): unknown {
  return redactAny(value, 0, new WeakSet())
}
