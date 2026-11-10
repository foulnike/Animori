// Регрессия: секреты не попадают ни в журнал, ни в тексты ошибок, ни в консоль.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearLogs, Logger, readLogs, setLogEnabled } from '../src/utils/logger'
import { REDACTED, redactText, redactUrl, redactValue } from '../src/utils/redact'

const ANILIST_JWT =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI0ODUxMyIsInN1YiI6IjEyMyJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU'
const YANDEX = 'y0_AgAAAAAbcdefGHIJklmnOPQRstuvWXyz0123456789'
const PROXY_PASS = 'hunter2-proxy-pass'

describe('redactText', () => {
  it('вычёркивает заголовок Authorization в любом виде', () => {
    for (const text of [
      `Authorization: Bearer ${ANILIST_JWT}`,
      `authorization=OAuth ${YANDEX}`,
      `{"Authorization":"OAuth ${YANDEX}"}`,
      `Proxy-Authorization: Basic dXNlcjpwYXNzd29yZA==`,
    ]) {
      const out = redactText(text)
      expect(out).not.toContain(YANDEX)
      expect(out).not.toContain(ANILIST_JWT)
      expect(out).not.toContain('dXNlcjpwYXNzd29yZA')
      expect(out).toContain(REDACTED)
    }
  })

  it('вычёркивает голые пропуски AniList и Яндекса', () => {
    const out = redactText(`ошибка при запросе с ${ANILIST_JWT} и ${YANDEX}`)
    expect(out).not.toContain(ANILIST_JWT)
    expect(out).not.toContain(YANDEX)
  })

  it('вычёркивает пары ключ=значение с секретными именами', () => {
    const out = redactText(
      `auth_token=${ANILIST_JWT}; am_cloud_token: "${YANDEX}", set_proxy_pass=${PROXY_PASS}`,
    )
    expect(out).not.toContain(ANILIST_JWT)
    expect(out).not.toContain(YANDEX)
    expect(out).not.toContain(PROXY_PASS)
  })

  it('вычёркивает учётные данные внутри адреса', () => {
    const out = redactText(`proxy socks5://user:${PROXY_PASS}@10.0.0.1:1080 не ответил`)
    expect(out).not.toContain(PROXY_PASS)
    expect(out).toContain('10.0.0.1:1080')
  })

  it('обычный текст не трогает', () => {
    const text = 'Яндекс Диск: копия сохранена (1234 знаков)'
    expect(redactText(text)).toBe(text)
  })
})

describe('redactUrl', () => {
  it('срезает запрос, якорь и учётные данные', () => {
    const out = redactUrl(
      `https://user:pw@downloader.disk.yandex.ru/disk/abc?sign=SECRETSIGN&token=${YANDEX}#frag`,
    )
    expect(out).toBe(
      `https://${REDACTED}@downloader.disk.yandex.ru/disk/abc?${REDACTED}#${REDACTED}`,
    )
    expect(out).not.toContain('SECRETSIGN')
    expect(out).not.toContain(YANDEX)
  })

  it('адрес без запроса остаётся как был', () => {
    expect(redactUrl('https://graphql.anilist.co/')).toBe('https://graphql.anilist.co/')
  })

  it('не адрес чистится как текст', () => {
    expect(redactUrl(`not a url ${YANDEX}`)).not.toContain(YANDEX)
  })
})

describe('redactValue', () => {
  it('секретные ключи вычёркиваются на любой глубине', () => {
    const out = JSON.stringify(
      redactValue({
        headers: { Authorization: `OAuth ${YANDEX}`, Accept: 'application/json' },
        nested: { deep: { password: PROXY_PASS, cloudToken: YANDEX } },
        list: [{ token: ANILIST_JWT }],
      }),
    )
    expect(out).not.toContain(YANDEX)
    expect(out).not.toContain(PROXY_PASS)
    expect(out).not.toContain(ANILIST_JWT)
    expect(out).toContain('application/json')
  })

  it('ключ url чистится как адрес', () => {
    const out = redactValue({ url: 'https://x.disk.yandex.net/a?sign=SECRET' }) as { url: string }
    expect(out.url).not.toContain('SECRET')
  })

  it('заметки и выгрузки идут в журнал только размером', () => {
    const out = redactValue({
      notes: 'личная заметка пользователя',
      xml: '<myanimelist>…</myanimelist>',
      entries: [1, 2, 3],
    }) as Record<string, string>
    expect(out.notes).toBe('[27 знаков]')
    expect(out.xml).not.toContain('myanimelist')
    expect(out.entries).toBe('[массив: 3 элементов]')
  })

  it('длинная строка обрезается', () => {
    const out = redactValue('a'.repeat(5000)) as string
    expect(out.length).toBeLessThan(2100)
  })

  it('исключение теряет секрет и в сообщении, и в стеке', () => {
    const e = new Error(`request failed: Authorization: Bearer ${ANILIST_JWT}`)
    e.stack = `Error: token=${YANDEX}\n    at x`
    const out = JSON.stringify(redactValue(e))
    expect(out).not.toContain(ANILIST_JWT)
    expect(out).not.toContain(YANDEX)
  })

  it('цикл не роняет обход', () => {
    const a: Record<string, unknown> = { password: PROXY_PASS }
    a.self = a
    const out = JSON.stringify(redactValue(a))
    expect(out).not.toContain(PROXY_PASS)
    expect(out).toContain('[цикл]')
  })
})

describe('Logger', () => {
  beforeEach(() => {
    setLogEnabled(true)
    clearLogs()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearLogs()
  })

  it('token не присутствует в log output', () => {
    Logger('API', `Запрос с пропуском ${ANILIST_JWT}`, { token: YANDEX })
    const dump = JSON.stringify(readLogs())
    expect(dump).not.toContain(ANILIST_JWT)
    expect(dump).not.toContain(YANDEX)
  })

  it('Authorization не присутствует в exception text', () => {
    Logger('ERROR', 'Запрос не ушёл', new Error(`header Authorization: OAuth ${YANDEX}`))
    const dump = JSON.stringify(readLogs())
    expect(dump).not.toContain(YANDEX)

    // В консоль тоже уходит очищенное значение, а не исходное исключение.
    const consoleDump = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(consoleDump).not.toContain(YANDEX)
  })

  it('cloud URL очищается от query credentials', () => {
    Logger('WARN', 'Тело не пришло', {
      url: 'https://downloader.disk.yandex.ru/disk/x?sign=SIGNATURE&uid=1',
    })
    Logger('WARN', 'Запрос не ушёл: https://uploader.disk.yandex.net/u?sign=SIGNATURE2')
    const dump = JSON.stringify(readLogs())
    expect(dump).not.toContain('SIGNATURE')
  })

  it('пароль прокси не попадает в журнал ни ключом, ни адресом', () => {
    Logger('WARN', `Прокси http://u:${PROXY_PASS}@1.2.3.4:8080 молчит`, {
      set_proxy_pass: PROXY_PASS,
    })
    expect(JSON.stringify(readLogs())).not.toContain(PROXY_PASS)
  })

  it('хвост в sessionStorage тоже чистый', async () => {
    Logger('API', `x ${YANDEX}`)
    window.dispatchEvent(new Event('pagehide'))
    expect(sessionStorage.getItem('animori_logs') ?? '').not.toContain(YANDEX)
  })
})
