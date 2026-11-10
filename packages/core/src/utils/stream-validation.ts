// Проверка адреса потока перед передачей в hls.js или video.src. Адреса приходят из
// ответов API (Kodik, Aniliberty), и их хост не зафиксирован в hosts.rs: плеер берёт
// manifest и сегменты напрямую из webview, мимо Rust. Здесь — вторые ворота.
//
// Разрешён только https, без учётных данных, длина ограничена, хост в списке известных CDN.

/** Список разрешённых хостов потоков. Шаблоны вида https://host/path: `*.` в хосте —
 *  любой поддомен (не сам домен), `*` в конце — любой хвост пути. */
const ALLOWED_STREAM_HOSTS: ReadonlyArray<string> = [
  'https://*.kodik-cdn.com/*',
  'https://*.solodcdn.com/*',
  'https://anilibria.top/*',
  'https://*.anilibria.top/*',
  'https://*.animethemes.moe/*',
]

/** Максимальная длина URL потока. Подписанные адреса Kodik длинные, но не настолько. */
const MAX_STREAM_URL_LEN = 4096

/** Результат проверки: valid — адрес прошёл, reason — почему нет. */
export interface StreamValidation {
  valid: boolean
  reason?: string
}

/** Сопоставляет хост и путь с шаблоном вида https://host/path*. */
function matchesPattern(pattern: string, url: URL): boolean {
  if (!pattern.startsWith('https://')) return false
  const rest = pattern.slice('https://'.length)
  const slashAt = rest.indexOf('/')
  const pHost = slashAt >= 0 ? rest.slice(0, slashAt) : rest
  const pPath = slashAt >= 0 ? rest.slice(slashAt) : '/'

  const host = url.hostname
  const hostOk = pHost.startsWith('*.')
    ? (() => {
        const suffix = pHost.slice(2) // kodik-cdn.com (без *.)
        return (
          host.length > suffix.length + 1 &&
          host.endsWith(suffix) &&
          host[host.length - suffix.length - 1] === '.'
        )
      })()
    : host === pHost

  if (!hostOk) return false

  const path = url.pathname
  if (pPath.endsWith('*')) return path.startsWith(pPath.slice(0, -1))
  return path === pPath
}

/** Проверяет URL потока. Возвращает { valid, reason }. Сам URL не логируется наружу. */
export function validateStreamUrl(url: string): StreamValidation {
  if (url.includes('\r') || url.includes('\n')) {
    return { valid: false, reason: 'Управляющие символы в адресе' }
  }

  if (url.length > MAX_STREAM_URL_LEN) {
    return { valid: false, reason: `Адрес слишком длинный: ${url.length}` }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { valid: false, reason: 'Адрес не распознан' }
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: `Только https разрешён: ${parsed.protocol}` }
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Логин/пароль в адресе не разрешены' }
  }

  if (parsed.port) {
    return { valid: false, reason: 'Явный порт не разрешён' }
  }

  const matches = ALLOWED_STREAM_HOSTS.some((pattern) => matchesPattern(pattern, parsed))
  if (!matches) {
    return {
      valid: false,
      reason: `Хост не в списке разрешённых: ${parsed.hostname}`,
    }
  }

  return { valid: true }
}

/** Извлекает только хост для логирования, не полный URL. */
export function streamHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return '?'
  }
}
