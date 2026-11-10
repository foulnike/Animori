// Регрессия 1.4: пропуск Яндекс Диска не возвращается в окно. Разметка отдаёт его оболочке один
// раз (connect) и больше не видит: ни в настройках, ни в хранилище окна, ни в журнале, ни в HTTP.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { installMockBridge, type MockBridgeHandle } from './mocks/bridge-module'

import { cloudReady, connectPlace, copyInfo, disconnectPlace } from '../src/core/cloud'
import { loadSettings, settings } from '../src/core/settings'
import { clearLogs, readLogs, setLogEnabled } from '../src/utils/logger'

const TOKEN = 'y0_AgAAAAAcloudSecretTokenValue0123456789'

describe('облачный пропуск не живёт в окне', () => {
  let mock: MockBridgeHandle

  beforeEach(async () => {
    mock = installMockBridge()
    setLogEnabled(true)
    clearLogs()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadSettings()
    settings.cloudPlace = 'yandex'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    settings.cloudConnected = false
    settings.cloudPlace = 'none'
  })

  it('старый открытый пропуск в хранилище окна не читается настройками', async () => {
    await mock.bridge.storage.set('am_cloud_token', TOKEN)
    mock.calls.storageGet.length = 0

    await loadSettings()

    expect(mock.calls.storageGet).not.toContain('am_cloud_token')
    expect(JSON.stringify(settings)).not.toContain(TOKEN)
    expect(settings.cloudConnected).toBe(false)
  })

  it('признак подключения берётся у оболочки', async () => {
    mock.setCloudToken(TOKEN)
    await loadSettings()

    expect(settings.cloudConnected).toBe(true)
    expect(JSON.stringify(settings)).not.toContain(TOKEN)
  })

  it('connect отдаёт пропуск оболочке и не кладёт его в хранилище окна', async () => {
    const done = await connectPlace(`  ${TOKEN}  `)

    expect(done.ok).toBe(true)
    expect(mock.getCloudToken()).toBe(TOKEN)
    expect(settings.cloudConnected).toBe(true)
    expect(cloudReady()).toBe(true)
    expect(JSON.stringify(mock.calls.storageSet)).not.toContain(TOKEN)
    expect(JSON.stringify(settings)).not.toContain(TOKEN)
  })

  it('негодный пропуск не сохраняется и не попадает в текст отказа', async () => {
    mock.setCloudStep('connect', { stage: 'api', status: 401, text: '{}' })

    const done = await connectPlace(TOKEN)

    expect(done.ok).toBe(false)
    if (!done.ok) expect(done.problem).not.toContain(TOKEN)
    expect(mock.getCloudToken()).toBe('')
    expect(settings.cloudConnected).toBe(false)
  })

  it('запросы облака не идут через HTTP окна и не несут Authorization', async () => {
    mock.setCloudToken(TOKEN)
    settings.cloudConnected = true
    mock.setCloudStep('stat', {
      stage: 'api',
      status: 200,
      text: JSON.stringify({ name: 'animori-list.json', size: 10, modified: null }),
    })

    const info = await copyInfo()

    expect(info.ok).toBe(true)
    expect(mock.bridge.cloud.stat).toHaveBeenCalledWith()
    expect(mock.calls.http).toHaveLength(0)
    expect(JSON.stringify(mock.calls.httpHeaders)).not.toContain('OAuth')
  })

  it('в журнале нет пропуска ни после успеха, ни после отказа', async () => {
    await connectPlace(TOKEN)
    mock.bridge.cloud.check = vi.fn(async () => {
      throw new Error(`auth: header Authorization: OAuth ${TOKEN}`)
    })
    settings.cloudConnected = true
    const { checkChosenPlace } = await import('../src/core/cloud')
    const done = await checkChosenPlace()

    expect(done.ok).toBe(false)
    expect(JSON.stringify(readLogs())).not.toContain(TOKEN)
  })

  it('отключение стирает пропуск в оболочке', async () => {
    await connectPlace(TOKEN)
    const done = await disconnectPlace()

    expect(done.ok).toBe(true)
    expect(mock.getCloudToken()).toBe('')
    expect(settings.cloudConnected).toBe(false)
    expect(cloudReady()).toBe(false)
  })
})
