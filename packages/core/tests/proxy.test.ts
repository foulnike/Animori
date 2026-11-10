// Проверки настройки прокси. Смотрим на разбор значений и на вопрос о перезапуске: и то и другое
// читают три места — панель настроек, мост и Rust,.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installMockBridge, type MockBridgeHandle } from './mocks/bridge-module'

import {
  DEFAULT_PROXY,
  isProxyUsable,
  normalizeProxyKind,
  normalizeProxyPort,
  proxyBypassList,
  proxyUrl,
  type ProxyConfig,
} from '../src/core/proxy'
import {
  proxyPasswordSet,
  proxyRestartNeeded,
  readProxyConfig,
  saveProxyField,
  saveProxyPassword,
} from '../src/core/proxy-settings'

/** Настройка со всеми полями на месте: тест меняет только то, что проверяет. */
function config(over: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    enabled: true,
    kind: 'http',
    host: '127.0.0.1',
    port: 8080,
    login: '',
    bypass: '',
    ...over,
  }
}

describe('разбор порта', () => {
  it('принимает число и строку из панели', () => {
    expect(normalizeProxyPort(8080)).toBe(8080)
    expect(normalizeProxyPort('1080')).toBe(1080)
    expect(normalizeProxyPort(' 3128 ')).toBe(3128)
  })

  it('на негодном вводе отдаёт ноль, а не исключение', () => {
    expect(normalizeProxyPort('')).toBe(0)
    expect(normalizeProxyPort('порт')).toBe(0)
    expect(normalizeProxyPort(null)).toBe(0)
    expect(normalizeProxyPort(undefined)).toBe(0)
    expect(normalizeProxyPort('1080.5')).toBe(1080)
  })

  it('держит границы диапазона', () => {
    expect(normalizeProxyPort(0)).toBe(0)
    expect(normalizeProxyPort(1)).toBe(1)
    expect(normalizeProxyPort(65535)).toBe(65535)
    expect(normalizeProxyPort(65536)).toBe(0)
    expect(normalizeProxyPort(-1)).toBe(0)
  })
})

describe('разбор вида прокси', () => {
  it('знает два вида, остальное считает http', () => {
    expect(normalizeProxyKind('http')).toBe('http')
    expect(normalizeProxyKind('socks5')).toBe('socks5')
    expect(normalizeProxyKind('socks4')).toBe('http')
    expect(normalizeProxyKind(null)).toBe('http')
  })
})

describe('пригодность настройки', () => {
  it('включённая настройка с адресом и портом пригодна', () => {
    expect(isProxyUsable(config())).toBe(true)
  })

  it('выключенная непригодна, даже если адрес набран', () => {
    expect(isProxyUsable(config({ enabled: false }))).toBe(false)
  })

  it('адрес из пробелов — не адрес', () => {
    expect(isProxyUsable(config({ host: '   ' }))).toBe(false)
  })

  it('нулевой порт значит «значения нет»', () => {
    expect(isProxyUsable(config({ port: 0 }))).toBe(false)
  })
})

describe('адрес прокси', () => {
  it('собирается со схемой по виду', () => {
    expect(proxyUrl(config())).toBe('http://127.0.0.1:8080')
    expect(proxyUrl(config({ kind: 'socks5', port: 1080 }))).toBe('socks5://127.0.0.1:1080')
  })

  it('обрезка пробелов в адресе видна и здесь', () => {
    expect(proxyUrl(config({ host: '  proxy.local  ' }))).toBe('http://proxy.local:8080')
  })

  it('у непригодной настройки адреса нет', () => {
    expect(proxyUrl(config({ enabled: false }))).toBeNull()
    expect(proxyUrl(config({ port: 0 }))).toBeNull()
  })

  it('учётные данные в адрес не попадают', () => {
    // Учётные данные в адрес не склеиваются: логин и пароль подставляет оболочка отдельно.
    expect(proxyUrl(config({ login: 'u' }))).toBe('http://127.0.0.1:8080')
  })
})

describe('исключения', () => {
  it('разделители — запятая, точка с запятой и перевод строки', () => {
    expect(proxyBypassList(config({ bypass: 'localhost, 127.0.0.1; .local\n10.0.0.1' }))).toEqual([
      'localhost',
      '127.0.0.1',
      '.local',
      '10.0.0.1',
    ])
  })

  it('пустые записи уходят, пустое поле даёт пустой список', () => {
    expect(proxyBypassList(config({ bypass: ' a ,, ; \n ' }))).toEqual(['a'])
    expect(proxyBypassList(config({ bypass: '' }))).toEqual([])
  })
})

describe('нужен ли перезапуск', () => {
  it('адрес у движка тот же — не нужен', () => {
    expect(
      proxyRestartNeeded({ outcome: 'applied', server: 'http://127.0.0.1:8080' }, config()),
    ).toBe(false)
  })

  it('движок с другим адресом — нужен', () => {
    expect(
      proxyRestartNeeded({ outcome: 'applied', server: 'http://127.0.0.1:3128' }, config()),
    ).toBe(true)
  })

  it('движок не достучался до того же адреса — не нужен', () => {
    // Второй заход в тот же мёртвый адрес ничего не изменит: об этом говорит
    // строка состояния, а кнопка была бы враньём.
    expect(
      proxyRestartNeeded({ outcome: 'unreachable', server: 'http://127.0.0.1:8080' }, config()),
    ).toBe(false)
  })

  it('окно на этой платформе прокси не умеет — перезапуск не изменит ничего', () => {
    // Исход не-Windows: адрес отвечает, но передать его окну нечем. Адрес тот же,
    // значит и кнопке взяться неоткуда — перезапуск платформу не переменит.
    expect(
      proxyRestartNeeded(
        { outcome: 'windowUnsupported', server: 'http://127.0.0.1:8080' },
        config(),
      ),
    ).toBe(false)
  })

  it('настройка снята, а движок всё ещё с прокси — нужен', () => {
    expect(
      proxyRestartNeeded(
        { outcome: 'applied', server: 'http://127.0.0.1:8080' },
        config({ enabled: false }),
      ),
    ).toBe(true)
  })

  it('настройка снята и движок без прокси — не нужен', () => {
    // Адрес при выключенном движке пустой строкой, а не null: так его отдаёт Rust,
    // и `server` в мосте объявлен строкой именно поэтому.
    expect(proxyRestartNeeded({ outcome: 'off', server: '' }, config({ enabled: false }))).toBe(false)
  })

  it('негодная настройка при пустом движке перезапуска не просит', () => {
    // Включённый тумблер с недонабранным адресом — обычное состояние на полпути:
    // приложение поднималось бы с негодной настройкой и просило перезапуск снова.
    expect(proxyRestartNeeded({ outcome: 'off', server: '' }, config({ host: '' }))).toBe(false)
  })

  it('негодная настройка при живом прокси перезапуск просит', () => {
    expect(
      proxyRestartNeeded(
        { outcome: 'applied', server: 'http://127.0.0.1:8080' },
        config({ host: '' }),
      ),
    ).toBe(true)
  })
})

describe('чтение и запись настроек', () => {
  let mock: MockBridgeHandle

  beforeEach(() => {
    mock = installMockBridge()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('без ключей отдаёт значения по умолчанию', async () => {
    expect(await readProxyConfig()).toEqual(DEFAULT_PROXY)
  })

  it('пустая строка в файле остаётся пустой', async () => {
    // Осознанно очищенное поле не перебивается дефолтом — то же правило в proxy.rs.
    await mock.bridge.storage.set('set_proxy_bypass', '')

    expect((await readProxyConfig()).bypass).toBe('')
  })

  it('«да» строкой за включение не считается', async () => {
    // В Rust включение — это matches!(…, Bool(true)); разойдись панель с ним,
    // тумблер показывал бы включённый прокси при выключенном движке.
    await mock.bridge.storage.set('set_proxy_on', 'true')

    expect((await readProxyConfig()).enabled).toBe(false)
  })

  it('пробелы обрезаются у адреса и логина', async () => {
    await mock.bridge.storage.set('set_proxy_host', ' 127.0.0.1 ')
    await mock.bridge.storage.set('set_proxy_login', ' user ')

    const read = await readProxyConfig()

    expect(read.host).toBe('127.0.0.1')
    expect(read.login).toBe('user')
  })

  it('пароль в настройку окна не попадает, даже если лежит в хранилище', async () => {
    // Старый файл настроек: пароль открытым текстом. Окно не должно ни читать, ни видеть его.
    await mock.bridge.storage.set('set_proxy_pass', ' pass ')

    const read = await readProxyConfig()

    expect('password' in read).toBe(false)
    expect(JSON.stringify(read)).not.toContain('pass ')
    expect(mock.calls.storageGet).not.toContain('set_proxy_pass')
  })

  it('пароль уходит в оболочку, а не в хранилище окна, и не обрезается', async () => {
    expect(await proxyPasswordSet()).toBe(false)

    expect(await saveProxyPassword(' p@ss word ')).toBe(true)
    expect(mock.bridge.proxyDiagnostics.setPassword).toHaveBeenCalledWith(' p@ss word ')
    expect(mock.calls.storageSet.map((c) => c.key)).not.toContain('set_proxy_pass')
    expect(await proxyPasswordSet()).toBe(true)

    expect(await saveProxyPassword('')).toBe(false)
    expect(await proxyPasswordSet()).toBe(false)
  })

  it('отказ оболочки при записи пароля даёт null и запись в журнал без пароля', async () => {
    mock.bridge.proxyDiagnostics.setPassword = vi.fn(async () => {
      throw new Error('секреты: шифр системы недоступен')
    })

    expect(await saveProxyPassword('hunter2-secret')).toBeNull()
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls)
    expect(logged).not.toContain('hunter2-secret')
  })

  it('порт читается из строки', async () => {
    await mock.bridge.storage.set('set_proxy_port', '1080')

    expect((await readProxyConfig()).port).toBe(1080)
  })

  it('запись уходит под ключом хранилища', async () => {
    await saveProxyField('port', 1080)

    expect(mock.calls.storageSet).toEqual([{ key: 'set_proxy_port', value: 1080 }])
  })

  it('отказ записи не отклоняет обещание', async () => {
    // Зовут из обработчиков разметки, где дождаться результата негде:
    // отклонение всплыло бы глобальным unhandledrejection.
    mock.bridge.storage.set = async () => {
      throw new Error('файл настроек недоступен')
    }

    await expect(saveProxyField('host', '127.0.0.1')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
