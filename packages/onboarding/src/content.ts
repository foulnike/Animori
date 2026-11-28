import type { Component } from 'vue'
import type { DOCUMENTS } from './legal'

export type FeatureKey = 'player' | 'lists' | 'transfer' | 'cloud'

export interface OnboardingAssets {
  icon: string
  desktop?: { background: Component }
  television?: {
    documentCodes: Readonly<Record<(typeof DOCUMENTS)[number]['id'], string>>
    repositoryCode: string
    pushBackStop: (handler: () => boolean) => () => void
  }
}

type Slide =
  | { kind: 'welcome' | 'providers' | 'agreement' | 'finish'; title: string }
  | { kind: 'feature'; title: string; scene: FeatureKey; description: string }

export const SLIDES = [
  { kind: 'welcome', title: 'Добро пожаловать в AniMori!' },
  {
    kind: 'feature',
    title: 'Смотрите аниме',
    scene: 'player',
    description: 'Продолжайте с того места, где остановились.',
  },
  {
    kind: 'feature',
    title: 'Ведите свой список',
    scene: 'lists',
    description: 'Ведите список по статусам, отмечайте серии и ставьте оценки.',
  },
  {
    kind: 'feature',
    title: 'Переносите списки',
    scene: 'transfer',
    description: 'Переносите записи из других сервисов и сохраняйте свой список в XML.',
  },
  {
    kind: 'feature',
    title: 'Сохраняйте копию в облаке',
    scene: 'cloud',
    description: 'Сохраните список на Яндекс Диске и восстановите его на другом устройстве.',
  },
  { kind: 'providers', title: 'Источники данных' },
  { kind: 'agreement', title: 'Политика и условия' },
  { kind: 'finish', title: 'Приятного пользования!' },
] as const satisfies readonly Slide[]

export const TV_FEATURE_SLIDES: Partial<Record<FeatureKey, Slide>> = {
  transfer: {
    kind: 'feature',
    title: 'Переносите списки',
    scene: 'transfer',
    description: 'Импортируйте список из профиля Шикимори.',
  },
  cloud: {
    kind: 'feature',
    title: 'Восстановите список',
    scene: 'cloud',
    description: 'Введите ссылку или код копии с Яндекс Диска.',
  },
}

export const REPOSITORY = 'https://github.com/foulnike/Animori'

export const PROVIDERS = [
  {
    title: 'AniList',
    description: 'Каталог, расписание и импорт списков',
    url: 'https://docs.anilist.co/',
  },
  {
    title: 'Шикимори',
    description: 'Русские названия, описания и импорт списков',
    url: 'https://shikimori.io/api/doc',
  },
  {
    title: 'Kodik',
    description: 'Серии и варианты озвучки',
    url: 'https://kodikplayer.com/',
  },
  {
    title: 'AniLiberty',
    description: 'Серии и озвучка команды АниЛибрии',
    url: 'https://anilibria.top/api/docs/v1',
  },
  {
    title: 'AnimeThemes',
    description: 'Опенинги и эндинги',
    url: 'https://animethemes.moe/',
  },
  {
    title: 'Яндекс Диск',
    description: 'Резервные копии списка',
    url: 'https://yandex.ru/dev/disk/rest/',
  },
  {
    title: 'animori-data',
    description: 'Русские названия аниме',
    url: 'https://github.com/foulnike/animori-data',
  },
]
