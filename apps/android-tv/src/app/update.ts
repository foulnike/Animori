// Обновление на приставке. Своего апдейтера у Tauri на Android нет: плагин только для десктопа, поэтому версию сверяем сами, а установку отдаём системе.

import { ref } from 'vue'

import { Bridge } from '@/bridge'
import { Logger } from '@/utils/logger'

// Выпуски лежат в общем репозитории с настольным приложением. Старые сборки приставки смотрят в Animori-TV
// и потому перестанут находить обновления: их адрес вшит в APK и уже не меняется.
const RELEASES = 'https://api.github.com/repos/foulnike/Animori/releases?per_page=30'

/** Приставка тегируется своим именем продукта. Отрезать надо по нему же, а не числом:
 * длина префикса менялась уже один раз и тихо съела бы номер версии. */
const TAG_PREFIX = 'android-tv-v'

/** Разрядность устройства → приставка в имени файла выпуска. */
const SUFFIX: Record<string, string> = {
  'armeabi-v7a': 'armv7',
  'arm64-v8a': 'arm64',
}

/** Потолок длины: окно показывает кратко, полный список — в CHANGELOG. */
const NOTES_LIMIT = 600

export interface UpdateOffer {
  version: string
  notes: string
  url: string
}

/** Что показала проверка. Пусто — обновлять нечего или спросить не удалось. */
export const updateOffer = ref<UpdateOffer | null>(null)

/** Открыто ли окно обновления. Открыть его могут и рельс, и настройки, поэтому
 * состояние общее, а окно стоит в корне приложения рядом с карточкой персоны. */
export const updateOpen = ref(false)

/** Номер версии числами: '3.0.10' больше '3.0.9', чего строковое сравнение не даёт. */
function numbers(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

/** Новее ли найденный номер установленного. */
export function newer(found: string, have: string): boolean {
  const a = numbers(found)
  const b = numbers(have)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left !== right) return left > right
  }
  return false
}

/** Разрядность по устройству; вне Android моста нет. */
function deviceAbi(): string {
  const bridge = (window as unknown as { AnimoriUpdate?: { abi?: () => string } }).AnimoriUpdate
  return bridge?.abi?.() ?? 'armeabi-v7a'
}

/**
 * Файл выпуска — строго по имени (AniMori_<версия>_<разрядность>.apk), без запасного перебора:
 * перебор по окончанию не сверяет версию и поставил бы подложенный файл. Имя проверяет конвейер.
 */
function pickAsset(
  assets: Array<{ name: string; browser_download_url: string }>,
  version: string,
): string | null {
  const suffix = SUFFIX[deviceAbi()] ?? 'armv7'
  const exact = `AniMori_${version}_${suffix}.apk`

  const found = assets.find((asset) => asset.name === exact)

  if (!found) {
    // Имена файлов в журнал: по одной этой строке видно, что приехало и что ждали.
    Logger(
      'WARN',
      `Обновление: файла ${exact} в выпуске нет, пришли: ` +
        (assets.length > 0 ? assets.map((asset) => asset.name).join(', ') : 'ни одного'),
    )
    return null
  }

  return found.browser_download_url
}

/** Один вопрос к GitHub: список выпусков, из них — последний с приставкой `android-tv-v`.
 *  Запрос идёт мостом, а не `fetch` окна: весь трафик идёт через оболочку. */
export async function checkUpdate(): Promise<UpdateOffer | null> {
  const answer = await Bridge.http.request({
    url: RELEASES,
    headers: { accept: 'application/vnd.github+json' },
    timeoutMs: 15_000,
  })
  if (!answer.ok) throw new Error(`выпуски не прочитаны: ${answer.status}`)

  const list = JSON.parse(answer.text) as Array<{
    tag_name: string
    body: string
    assets: Array<{ name: string; browser_download_url: string }>
  }>

  for (const release of list) {
    if (!release.tag_name.startsWith(TAG_PREFIX)) continue

    const version = release.tag_name.slice(TAG_PREFIX.length)
    if (!newer(version, __ANIMORI_VERSION__)) return null

    const url = pickAsset(release.assets, version)
    if (!url) return null

    const notes = (release.body ?? '').trim()
    return {
      version,
      notes: notes.length > NOTES_LIMIT ? `${notes.slice(0, NOTES_LIMIT).trimEnd()}…` : notes,
      url,
    }
  }

  return null
}

/** Фоновая проверка при старте: неудача обновление не отменяет, она просто его не находит. */
export async function startUpdateCheck(): Promise<void> {
  try {
    updateOffer.value = await checkUpdate()
  } catch {
    updateOffer.value = null
  }
}

/** Отдаёт файл системе. false — человек ушёл в настройки за правом установки,
 *  и скачивания не было: это не отказ, а ожидаемый первый шаг. */
export function installUpdate(url: string): boolean {
  const bridge = (window as unknown as { AnimoriUpdate?: { install?: (u: string) => boolean } })
    .AnimoriUpdate
  return bridge?.install?.(url) ?? false
}
