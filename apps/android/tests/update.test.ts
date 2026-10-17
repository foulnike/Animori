// Обновление на телефоне. Проверяется выбор файла в выпуске: при сбое сети приложение
// молча остаётся без обновления, и заметить это можно только здесь.
//
// Мост подменён заглушкой ядра, окно — настоящее: `deviceAbi` читает разрядность из
// `window.AnimoriUpdate`, и без окна проверить выбор между armv7 и arm64 нечем.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type MockBridgeHandle } from '@core-tests/bridge'
import { useInstantPace } from '@core-tests/instant-pace'

type Update = typeof import('../src/app/update')

const RELEASES = 'https://api.github.com/repos/foulnike/Animori/releases?per_page=30'

/** Адрес файла в выпуске: имя и ссылка идут в паре, как их отдаёт GitHub. */
function asset(name: string): { name: string; browser_download_url: string } {
  return { name, browser_download_url: `https://example.invalid/${name}` }
}

/** Выпуск с тегом приставки: тело нужно только потому, что его читает разбор. */
function release(tag: string, files: Array<{ name: string; browser_download_url: string }>) {
  return {
    tag_name: tag,
    body: 'Правки',
    assets: files,
  }
}

let update: Update
let bridge: MockBridgeHandle

/** Ответ списка выпусков: порядок в нём — как у GitHub, от новых к старым. */
function releases(list: unknown[]): void {
  bridge.setHttpResponse(RELEASES, {
    status: 200,
    statusText: 'OK',
    ok: true,
    headers: {},
    text: JSON.stringify(list),
  })
}

/** Расставляет разрядность устройства: апдейтер без неё не знает, какой файл брать. */
function withAbi(abi: string): void {
  ;(window as unknown as { AnimoriUpdate?: { abi?: () => string } }).AnimoriUpdate = {
    abi: () => abi,
  }
}

beforeEach(async () => {
  vi.resetModules()

  useInstantPace()

  const mocks = await import('@core-tests/bridge-module')
  bridge = mocks.installMockBridge()
  update = await import('../src/app/update')
})

afterEach(() => {
  vi.doUnmock('@/api/rate-limit')
  delete (window as unknown as { AnimoriUpdate?: unknown }).AnimoriUpdate
})

describe('выбор файла в выпуске', () => {
  it('берёт файл своей разрядности по точному имени', async () => {
    withAbi('arm64-v8a')
    releases([
      release('android-v3.2.0', [
        asset('AniMori_3.2.0_armv7.apk'),
        asset('AniMori_3.2.0_arm64.apk'),
      ]),
    ])

    const offer = await update.checkUpdate()

    expect(offer?.url).toBe('https://example.invalid/AniMori_3.2.0_arm64.apk')
  })

  it('на 32-разрядной приставке берёт свой файл, а не чужой', async () => {
    withAbi('armeabi-v7a')
    releases([
      release('android-v3.2.0', [
        asset('AniMori_3.2.0_armv7.apk'),
        asset('AniMori_3.2.0_arm64.apk'),
      ]),
    ])

    const offer = await update.checkUpdate()

    expect(offer?.url).toBe('https://example.invalid/AniMori_3.2.0_armv7.apk')
  })

  it('переименованный файл не принимается: молча ставить чужое нельзя', async () => {
    withAbi('arm64-v8a')
    // Файл выпуска назван иначе, чем ждёт приложение. Раньше запасной перебор взял бы его.
    releases([release('android-v3.2.0', [asset('AniMori_3.2.0.apk')])])

    const offer = await update.checkUpdate()

    expect(offer).toBeNull()
  })

  it('файл чужой версии не принимается: запасного круга больше нет', async () => {
    withAbi('arm64-v8a')
    // Тот же вид файла и то же окончание — но другой номер. Раньше такой подходил.
    releases([release('android-v3.2.0', [asset('AniMori_9.9.9_arm64.apk')])])

    const offer = await update.checkUpdate()

    expect(offer).toBeNull()
  })

  it('файл с тем же именем, но чужой разрядности, не подставляется', async () => {
    withAbi('arm64-v8a')
    releases([release('android-v3.2.0', [asset('AniMori_3.2.0_armv7.apk')])])

    const offer = await update.checkUpdate()

    expect(offer).toBeNull()
  })

  it('неизвестная разрядность берёт 32-разрядный файл, а не отказывает', async () => {
    // Устройство без разрядности в мосте — обычное дело для отладочной сборки.
    releases([
      release('android-v3.2.0', [
        asset('AniMori_3.2.0_armv7.apk'),
        asset('AniMori_3.2.0_arm64.apk'),
      ]),
    ])

    const offer = await update.checkUpdate()

    expect(offer?.url).toBe('https://example.invalid/AniMori_3.2.0_armv7.apk')
  })

  it('выпуск вовсе без файлов — это не обновление, а не поломка', async () => {
    withAbi('arm64-v8a')
    releases([release('android-v3.2.0', [])])

    await expect(update.checkUpdate()).resolves.toBeNull()
  })
})

describe('сравнение версий', () => {
  it('двузначный номер больше однозначного, а строками — нет', () => {
    expect(update.newer('3.0.10', '3.0.9')).toBe(true)
    expect(update.newer('3.0.9', '3.0.10')).toBe(false)
  })

  it('та же версия обновлением не считается', () => {
    expect(update.newer('3.1.0', '3.1.0')).toBe(false)
  })

  it('короткий номер не отличается от длинного: 3.1 — это 3.1.0', () => {
    // Строковое сравнение решило бы иначе, а числа по частям — как человек и ждёт:
    // нули в конце ничего не значат, и обновлением это не считается.
    expect(update.newer('3.1', '3.1.0')).toBe(false)
    expect(update.newer('3.1.1', '3.1.0')).toBe(true)
  })

  it('мусор в номере не ломает сравнение', () => {
    expect(update.newer('3.1.x', '3.0.9')).toBe(true)
  })
})

describe('отбор выпуска', () => {
  it('чужой тег игнорируется: у настольного приложения свой апдейтер', async () => {
    withAbi('arm64-v8a')
    // Выпуск настольного приложения стоит в том же списке и по времени новее.
    releases([
      release('windows-v9.0.0', [asset('AniMori_9.0.0_arm64.apk')]),
      release('android-v3.2.0', [asset('AniMori_3.2.0_arm64.apk')]),
    ])

    const offer = await update.checkUpdate()

    expect(offer?.version).toBe('3.2.0')
  })

  it('тег приставки не берётся: префиксы android-v и android-tv-v не пересекаются', async () => {
    withAbi('arm64-v8a')
    // После 'android-' у тега приставки идёт 't', а не 'v', и startsWith отклоняет его.
    releases([release('android-tv-v9.9.9', [asset('AniMori_9.9.9_arm64.apk')])])

    const offer = await update.checkUpdate()

    expect(offer).toBeNull()
  })

  it('префикс тега отрезается по нему же, а не по длине', async () => {
    // Префикс уже менялся один раз, и отрез по номеру длины съел бы версию.
    withAbi('arm64-v8a')
    releases([release('android-v3.2.0', [asset('AniMori_3.2.0_arm64.apk')])])

    const offer = await update.checkUpdate()

    expect(offer?.version).toBe('3.2.0')
  })

  it('заметки обрезаются до потолка, а короткие идут как есть', async () => {
    withAbi('arm64-v8a')

    const long = 'я'.repeat(900)
    releases([
      { tag_name: 'android-v3.2.0', body: long, assets: [asset('AniMori_3.2.0_arm64.apk')] },
    ])

    const cut = await update.checkUpdate()
    expect(cut?.notes.length).toBeLessThanOrEqual(601)
    expect(cut?.notes.endsWith('…')).toBe(true)

    bridge.setHttpResponse(RELEASES, {
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: {},
      text: JSON.stringify([release('android-v3.2.0', [asset('AniMori_3.2.0_arm64.apk')])]),
    })

    const whole = await update.checkUpdate()
    expect(whole?.notes).toBe('Правки')
  })

  it('выпуск не новее установленной не предлагается', async () => {
    withAbi('arm64-v8a')
    // В конфиге проверок версия стоит 'test' и разбирается в числа как ноль, поэтому
    // отказ даёт только нулевой выпуск: любой настоящий номер здесь «новее».
    releases([release('android-v0.0.0', [asset('AniMori_0.0.0_arm64.apk')])])

    const offer = await update.checkUpdate()

    expect(offer).toBeNull()
  })

  it('отказ сети не превращается в предложение обновиться', async () => {
    withAbi('arm64-v8a')
    bridge.setHttpError(RELEASES, 'network')

    await expect(update.checkUpdate()).rejects.toThrow()
  })
})

describe('фоновая проверка', () => {
  it('неудача не выходит наружу: обновление просто не находится', async () => {
    withAbi('arm64-v8a')
    bridge.setHttpError(RELEASES, 'network')

    // Обещание разрешается, а не отбрасывается: вызывающий не должен ловить отказ.
    await expect(update.startUpdateCheck()).resolves.toBeUndefined()
    expect(update.updateOffer.value).toBeNull()
  })

  it('удачная проверка кладёт предложение на место', async () => {
    withAbi('arm64-v8a')
    releases([release('android-v3.2.0', [asset('AniMori_3.2.0_arm64.apk')])])

    await update.startUpdateCheck()

    expect(update.updateOffer.value?.version).toBe('3.2.0')
  })
})

describe('передача файла системе', () => {
  it('моста нет — это не отказ, а ожидаемый первый шаг', () => {
    // Человек ушёл в настройки за правом установки: скачивания не было.
    expect(update.installUpdate('https://example.invalid/a.apk')).toBe(false)
  })

  it('файл уходит системе, когда право уже есть', () => {
    let given = ''
    ;(window as unknown as { AnimoriUpdate?: { install?: (u: string) => boolean } }).AnimoriUpdate =
      {
        install: (url: string) => {
          given = url
          return true
        },
      }

    expect(update.installUpdate('https://example.invalid/a.apk')).toBe(true)
    expect(given).toBe('https://example.invalid/a.apk')
  })
})
