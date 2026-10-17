// Список экранов и их подписи — один источник правды. Новый экран = три места: имя здесь, подпись
// в SCREEN_TITLES и компонент в App.vue; меню — четвёртое и необязательное.

export const SCREEN_NAMES = [
  'home',
  'lists',
  'history',
  'search',
  'media',
  'studio',
  'player',
  'settings',
  'log',
] as const

export type ScreenName = (typeof SCREEN_NAMES)[number]

export type Route = {
  name: ScreenName
  params: Record<string, string>
}

export const DEFAULT_ROUTE: Route = { name: 'home', params: {} }

/// Значок пункта меню: имя вектора в RailIcon.vue.
export type MenuIcon = 'home' | 'lists' | 'history' | 'search' | 'settings'

export type MenuItem = {
  name: ScreenName
  title: string
  icon: MenuIcon
}

// В меню нет карточки, студии, плеера и журнала: вход в них — из списков, поиска, карточки и адресом #/log.
// Подписи и имена экранов раздельны: имя 'lists' живёт в адресе и памяти отбора. `icon` — имя вектора в RailIcon.vue.
export const MENU: ReadonlyArray<MenuItem> = [
  { name: 'home', title: 'Главная', icon: 'home' },
  { name: 'lists', title: 'Моё', icon: 'lists' },
  { name: 'history', title: 'История', icon: 'history' },
  { name: 'search', title: 'Поиск', icon: 'search' },
  { name: 'settings', title: 'Настройки', icon: 'settings' },
]

/// Глубина экрана: насколько он далёк от вкладок. По ней смена экрана получает направление (см. navDirection).
/// Вкладки стоят вровень, карточка глубже вкладок, студия и плеер глубже карточки; журнал глубже вкладок, хоть в меню его нет.
export const SCREEN_DEPTH: Record<ScreenName, number> = {
  home: 0,
  lists: 0,
  history: 0,
  search: 0,
  settings: 0,
  log: 1,
  media: 1,
  studio: 2,
  player: 2,
}

export const SCREEN_TITLES: Record<ScreenName, string> = {
  home: 'Главная',
  lists: 'Моё',
  history: 'История',
  search: 'Поиск',
  media: 'Тайтл',
  studio: 'Студия',
  player: 'Просмотр',
  settings: 'Настройки',
  log: 'Журнал',
}
