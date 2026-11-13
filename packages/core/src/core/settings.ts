// Пользовательские настройки: читать `settings.x` в момент использования; до loadSettings() — дефолты. Логировать отсюда можно: журнал настроек не читает, иначе был бы цикл (настройки → мост → прокси).

import { Bridge } from '@/bridge'
import { Logger } from '../utils/logger'

/** Источник русских тайтлов: Шикимори. Второго источника нет — см. docs/dev/windows/STORAGE.md. */
export type TitleSource = 'shikimori' | 'off' | 'none'

/**
 * Оформление окна; слово «тема» занято музыкальными темами, `amoled` — чёрный ноль: на OLED он не светится. */
export type AppearanceName = 'dark' | 'light' | 'amoled'

/** Визуальное семейство интерфейса; Windows использует Lain поверх трёх цветовых схем. */
export type VisualTheme = 'standard' | 'lain'

/** Уровень фильтрации 18+: всё закрыто, только красное закрыто или фильтрации нет. */
export type AdultFilterMode = 'full' | 'partial' | 'none'

export interface AdultTagRule {
  threshold: number
  hideInPartial: boolean
}

export const ADULT_TAG_RULES_DEFAULT: Record<string, AdultTagRule> = {
  Incest: { threshold: 40, hideInPartial: false },
  Inseki: { threshold: 40, hideInPartial: false },
  'Ero Guro': { threshold: 40, hideInPartial: false },
  "Boys' Love": { threshold: 70, hideInPartial: false },
  Yuri: { threshold: 70, hideInPartial: false },
  'LGBTQ+ Themes': { threshold: 70, hideInPartial: false },
  'Gender Bending': { threshold: 70, hideInPartial: false },
  Psychosexual: { threshold: 70, hideInPartial: false },
  Transgender: { threshold: 70, hideInPartial: false },
  Crossdressing: { threshold: 70, hideInPartial: false },
  Bisexual: { threshold: 70, hideInPartial: false },
  Agender: { threshold: 70, hideInPartial: false },
  Asexual: { threshold: 70, hideInPartial: false },
  Nudity: { threshold: 70, hideInPartial: false },
  Femboy: { threshold: 70, hideInPartial: false },
  "Teens' Love": { threshold: 70, hideInPartial: false },
  'Age Gap': { threshold: 70, hideInPartial: false },
}

/**
 * Где живёт облачная копия; 'google' оставлен нарочно — у кого он лежит в хранилище, панель скажет переставить место. */
export type CloudPlace = 'none' | 'yandex' | 'google'

export interface AniMoriSettings {
  translateInterface: boolean
  titlePrimary: TitleSource
  titleFallback: TitleSource
  translateCharacters: boolean
  translateStaff: boolean
  enablePlayer: boolean
  enableRatings: boolean
  enableFranchise: boolean
  enableThemes: boolean
  enableLogger: boolean
  /** Оформление окна: тёмное, светлое или AMOLED. */
  appearance: AppearanceName
  visualTheme: VisualTheme
  /**
   * Блокировать всплывающие окна плеера: ловит только НОВЫЕ окна (on_new_window), редиректы не режет. */
  blockPlayerPopups: boolean
  /** Резать рекламные блоки AniList: работает всюду — баннеры в главном фрейме на том же домене. */
  hideAds: boolean
  /** Режим фильтрации 18+: полная, частичная или отключённая. */
  adultMode: AdultFilterMode
  /** Устаревший флаг для совместимости со старыми тестами и снимками. */
  showAdult: boolean
  /** Возраст подтверждён в этом профиле; дата рождения не хранится. */
  adultAgeVerified: boolean
  /** Индивидуальные правила регулируемых тегов AniList. */
  adultTagRules: Record<string, AdultTagRule>
  /** Показывать пилюлю «Перенос»: смысл ключа чисто интерфейсный — окно остаётся смонтированным. */
  showSyncButton: boolean
  /** Показывать пилюлю ⇄: отдельный ключ, иначе объединение прятало бы обе кнопки ради одной. */
  showCompareButton: boolean
  /**
   * Папка для выгрузок XML: пусто — «ещё не выбрана», файл уходит загрузкой; в снимок ключ не попадает. */
  exportDir: string
  /**
   * Ник на Шикимори для переноса; пусто — «ни разу». Хранится, чтобы не набирать заново (пульт телевизора). */
  shikiNick: string
  /** Где держать облачную копию; по умолчанию нигде — облако включает человек, а не установщик. */
  cloudPlace: CloudPlace
  /**
   * Сохранён ли пропуск Яндекс Диска. Сам пропуск лежит в оболочке шифром (secrets.rs) и в разметку
   * не попадает; признак спрашивается у оболочки при чтении настроек. */
  cloudConnected: boolean
  /** Когда копия ушла в облако (мс); ноль — «ни разу», экран говорит это словами. */
  cloudSavedAt: number
  /** Сколько записей было в последней копии: ответ нужен до восстановления и без сети. */
  cloudSavedCount: number
  /**
   * Время правки файла копии по словам облака: сравнение знак в знак — часы у сторон разные; своя метка принадлежит текущему пропуску. */
  cloudSeenModified: string
  /** Производная: тайтлы включены, пока основной источник != 'off'. */
  translateTitles: boolean
}

/**
 * Значения НА СЛУЧАЙ ОТСУТСТВИЯ КЛЮЧА, не «сброс»: тайтлы берутся у Шикимори. */
const DEFAULT_SETTINGS: AniMoriSettings = {
  translateInterface: true,
  titlePrimary: 'shikimori',
  titleFallback: 'none',
  translateCharacters: true,
  translateStaff: true,
  enablePlayer: true,
  enableRatings: true,
  enableFranchise: true,
  enableThemes: true,
  enableLogger: false,
  appearance: 'amoled',
  visualTheme: 'standard',
  blockPlayerPopups: false,
  hideAds: false,
  adultMode: 'full',
  showAdult: false,
  adultAgeVerified: false,
  adultTagRules: normalizeAdultTagRules(),
  showSyncButton: true,
  showCompareButton: true,
  exportDir: '',
  shikiNick: '',
  cloudPlace: 'none',
  cloudConnected: false,
  cloudSavedAt: 0,
  cloudSavedCount: 0,
  cloudSeenModified: '',
  translateTitles: true,
}

function normalizeAdultTagRules(value: unknown = null): Record<string, AdultTagRule> {
  const out: Record<string, AdultTagRule> = {}
  for (const [name, fallback] of Object.entries(ADULT_TAG_RULES_DEFAULT)) {
    const raw = value && typeof value === 'object' ? (value as Record<string, unknown>)[name] : null
    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const threshold =
      typeof row?.threshold === 'number' && Number.isFinite(row.threshold)
        ? Math.min(100, Math.max(0, Math.round(row.threshold)))
        : fallback.threshold
    out[name] = { threshold, hideInPartial: row?.hideInPartial === true }
  }
  return out
}

async function readSettings(): Promise<AniMoriSettings> {
  const storage = Bridge.storage

  // Все ключи читаются одним залпом: в Tauri последовательный await дал бы два десятка вызовов через IPC на старте приложения.
  const [
    translateInterface,
    storedTitlePrimary,
    legacyTitles,
    titleFallback,
    translateCharacters,
    translateStaff,
    enablePlayer,
    enableRatings,
    enableFranchise,
    enableThemes,
    enableLogger,
    appearance,
    visualTheme,
    blockPlayerPopups,
    hideAds,
    storedAdultMode,
    legacyAdult,
    adultAgeVerified,
    storedAdultTagRules,
    showSyncButton,
    showCompareButton,
    exportDir,
    shikiNick,
    cloudPlace,
    cloudConnected,
    cloudSavedAt,
    cloudSavedCount,
    cloudSeenModified,
  ] = await Promise.all([
    storage.get('set_interface', DEFAULT_SETTINGS.translateInterface),
    storage.get<TitleSource>('set_title_primary'),
    storage.get('set_titles', true),
    storage.get<TitleSource>('set_title_fallback', DEFAULT_SETTINGS.titleFallback),
    storage.get('set_chars', DEFAULT_SETTINGS.translateCharacters),
    storage.get('set_staff', DEFAULT_SETTINGS.translateStaff),
    storage.get('set_player', DEFAULT_SETTINGS.enablePlayer),
    storage.get('set_ratings', DEFAULT_SETTINGS.enableRatings),
    storage.get('set_franchise', DEFAULT_SETTINGS.enableFranchise),
    storage.get('set_themes', DEFAULT_SETTINGS.enableThemes),
    storage.get('set_logger', DEFAULT_SETTINGS.enableLogger),
    storage.get<AppearanceName>('am_appearance', DEFAULT_SETTINGS.appearance),
    storage.get<VisualTheme>('am_visual_theme', DEFAULT_SETTINGS.visualTheme),
    storage.get('set_block_popups', DEFAULT_SETTINGS.blockPlayerPopups),
    storage.get('set_hide_ads', DEFAULT_SETTINGS.hideAds),
    storage.get<AdultFilterMode>('set_adult_mode'),
    storage.get('set_adult', DEFAULT_SETTINGS.showAdult),
    storage.get('set_adult_age_verified', DEFAULT_SETTINGS.adultAgeVerified),
    storage.get<Record<string, AdultTagRule>>('set_adult_tag_rules'),
    storage.get('set_btn_sync', DEFAULT_SETTINGS.showSyncButton),
    storage.get('set_btn_compare', DEFAULT_SETTINGS.showCompareButton),
    storage.get('set_export_dir', DEFAULT_SETTINGS.exportDir),
    storage.get('am_shiki_nick', DEFAULT_SETTINGS.shikiNick),
    storage.get<CloudPlace>('am_cloud_place', DEFAULT_SETTINGS.cloudPlace),
    // Отказ оболочки — «не подключено»: настройки без облака лучше, чем без настроек.
    Bridge.cloud.status().catch(() => DEFAULT_SETTINGS.cloudConnected),
    storage.get('am_cloud_saved_at', DEFAULT_SETTINGS.cloudSavedAt),
    storage.get('am_cloud_saved_count', DEFAULT_SETTINGS.cloudSavedCount),
    storage.get('am_cloud_seen_modified', DEFAULT_SETTINGS.cloudSeenModified),
  ])

  // Совместимость: старый set_titles применяется только при отсутствии нового ключа. Литерал 'shikimori' здесь писать НЕЛЬЗЯ.
  const titlePrimary = storedTitlePrimary ?? (legacyTitles ? DEFAULT_SETTINGS.titlePrimary : 'off')

  const adultMode: AdultFilterMode =
    storedAdultMode === 'partial' || storedAdultMode === 'none'
      ? storedAdultMode
      : legacyAdult === true
        ? 'none'
        : 'full'

  return {
    translateInterface,
    titlePrimary,
    titleFallback,
    translateCharacters,
    translateStaff,
    enablePlayer,
    enableRatings,
    enableFranchise,
    enableThemes,
    enableLogger,
    appearance,
    visualTheme: visualTheme === 'lain' ? 'lain' : 'standard',
    blockPlayerPopups,
    hideAds,
    adultMode,
    showAdult: adultMode === 'none',
    adultAgeVerified: adultAgeVerified === true || legacyAdult === true,
    adultTagRules: normalizeAdultTagRules(storedAdultTagRules),
    showSyncButton,
    showCompareButton,
    exportDir,
    shikiNick,
    cloudPlace,
    cloudConnected,
    cloudSavedAt,
    cloudSavedCount,
    cloudSeenModified,
    translateTitles: titlePrimary !== 'off',
  }
}

/** Единственный экземпляр настроек: мутируется на месте — на этом держатся реактивные модели панели. */
export const settings: AniMoriSettings = { ...DEFAULT_SETTINGS }

/** Перечитать настройки из хранилища (вызывается из start() в app/main.ts). */
export async function loadSettings(): Promise<AniMoriSettings> {
  try {
    Object.assign(settings, await readSettings())
  } catch (e) {
    // Хранилище недоступно — работаем на дефолтах: без настроек приложение ещё полезно. Здесь же логируется
    // и предупреждение в консоль, и запись в журнал: кольцо модулей (журнал → настройки) не пускает сюда Logger.
    Logger('ERROR', 'Настройки не прочитаны, взяты значения по умолчанию', e)
  }
  return settings
}

/**
 * Записать настройку и обновить производные; память обновляется ДО записи, отказ глушится — зовут из сеттеров. */
export async function saveSetting<K extends keyof AniMoriSettings>(
  key: K,
  storageKey: string,
  value: AniMoriSettings[K],
): Promise<void> {
  settings[key] = value
  settings.translateTitles = settings.titlePrimary !== 'off'

  try {
    await Bridge.storage.set(storageKey, value)
  } catch (e) {
    Logger('ERROR', `Не удалось сохранить настройку ${storageKey}`, e)
  }
}
