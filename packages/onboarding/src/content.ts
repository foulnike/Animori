import type { Component } from 'vue'

import cloudScreenshot from '../assets/cloud.webp'
import transferScreenshot from '../assets/transfer.webp'

export type GalleryKey = 'player' | 'lists' | 'transfer' | 'cloud'

export interface SlideImage {
  src: string
  caption: string
}

type Gallery = readonly [SlideImage, ...SlideImage[]]
type Galleries = Record<Exclude<GalleryKey, 'player'>, Gallery> & { player?: Gallery }

export const SHARED_GALLERIES = {
  transfer: [{ src: transferScreenshot, caption: 'Импорт из AniList, Шикимори и файла XML' }],
  cloud: [{ src: cloudScreenshot, caption: 'Сохранение и восстановление облачной копии' }],
} as const satisfies Omit<Galleries, 'lists' | 'player'>

export interface OnboardingAssets {
  icon: string
  galleries: Galleries
  mobilePlayerFrame?: string
  desktop?: { background: Component }
  television?: {
    codes: Readonly<Record<string, string>>
    pushBackStop: (handler: () => boolean) => () => void
  }
}

type Slide =
  | { kind: 'welcome' | 'providers' | 'agreement' | 'finish'; title: string }
  | { kind: 'feature'; title: string; gallery: GalleryKey; description: string; details: string[] }

export const SLIDES = [
  { kind: 'welcome', title: 'Добро пожаловать в AniMori!' },
  {
    kind: 'feature',
    title: 'Смотрите аниме',
    gallery: 'player',
    description: 'AniMori запомнит, где вы остановились.',
    details: [],
  },
  {
    kind: 'feature',
    title: 'Ведите свой список',
    gallery: 'lists',
    description:
      'Отмечайте, что смотрите сейчас, что уже посмотрели и к чему хотите вернуться позже.',
    details: ['Статусы, оценки и прогресс по сериям', 'Локальный список доступен без интернета'],
  },
  {
    kind: 'feature',
    title: 'Переносите списки',
    gallery: 'transfer',
    description: 'Импортируйте список из AniList, Шикимори или файла XML формата MyAnimeList.',
    details: ['Объединение с текущим списком или его замена', 'Экспорт списка в XML'],
  },
  {
    kind: 'feature',
    title: 'Сохраняйте копию в облаке',
    gallery: 'cloud',
    description: 'Создайте копию списка на своём Яндекс Диске и восстановите её при необходимости.',
    details: ['Сохранение по вашей команде', 'Перенос списка на другое устройство по ссылке'],
  },
  { kind: 'providers', title: 'Наши провайдеры' },
  { kind: 'agreement', title: 'Условия использования' },
  { kind: 'finish', title: 'Приятного пользования!' },
] as const satisfies readonly Slide[]

export const TV_FEATURE_SLIDES: Partial<Record<GalleryKey, Slide>> = {
  transfer: {
    kind: 'feature',
    title: 'Переносите списки',
    gallery: 'transfer',
    description: 'Импортируйте список из профиля Шикимори.',
    details: ['Объедините записи с вашим списком или замените его целиком'],
  },
  cloud: {
    kind: 'feature',
    title: 'Восстанавливайте список из облака',
    gallery: 'cloud',
    description: 'Введите ссылку на резервную копию с Яндекс Диска.',
    details: ['Добавьте недостающие записи или замените список целиком'],
  },
}

export const REPOSITORY = 'https://github.com/foulnike/Animori'

export const DOCUMENTS = [
  { title: 'Условия использования', url: REPOSITORY + '/blob/main/docs/TERMS.md' },
  {
    title: 'Политика обработки персональных данных',
    url: REPOSITORY + '/blob/main/docs/PRIVACY.md',
  },
] as const

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
    description: 'Открытый набор названий и сведений о тайтлах',
    url: 'https://github.com/foulnike/animori-data',
  },
]
