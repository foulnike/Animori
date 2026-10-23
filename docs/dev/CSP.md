# Content Security Policy

Политика лежит в `app.security.csp` в `tauri.conf.json` трёх приложений:
`apps/windows`, `apps/android-tv`, `apps/android`. На всех трёх одинаковая,
кроме `connect-src` телефона: там убран `http:` — весь белый список хостов
телефона https.

Схема читается в конфиге. Здесь только то, без чего политику сломают при правке: ломается
тихо, окно открывается, а картинки или звук не грузятся.

## Что нельзя убирать

| Директива | Зачем |
| :--- | :--- |
| `worker-src blob:` | hls.js поднимает transmuxer как `new Worker(createObjectURL(blob))` (`hls.light.mjs` ~15945, в конфиге `enableWorker: true`). Без `blob:` поток не пойдёт — экран просто останется чёрным |
| `ipc: http://ipc.localhost` | Служебные каналы Tauri. Tauri их не подставляет сам. Без них пропадает `invoke`, а с ним сеть, хранилище и авторизация |
| `script-src 'self'` | Без `'unsafe-inline'` и `'unsafe-eval'`. Это смысл всей политики |
| `style-src 'unsafe-inline'` | Компоненты задают цвета через `:style` |
| `img-src data:` | SVG-заглушки, blob-постеры (локальные обложки из IndexedDB) и data-URI вёрстки. Заставка в `index.html` — обычный `<img src="...png">`, data не обязывает |
| `frame-src` (youtube, dailymotion) | Трейлеры — iframe только из этого списка. Новая площадка трейлеров требует хост и здесь, и в `TRAILER_SITES` (`packages/core/src/api/anilist-media.ts`): без хоста iframe блокируется молча |

## Почему остальное широкое

Приложение не ходит в сеть из webview: `fetch`, `XMLHttpRequest`, `EventSource` и
`WebSocket` в UI-слое не встречаются, вся сеть идёт через Rust (`tauri-plugin-http`,
`invoke`). Поэтому сужать `connect-src` бессмысленно, а `img-src` и `media-src` оставлены
широкими из-за обилия хостов обложек и зеркал.

Белый список хостов в `capabilities/default.json` (`http:default`), и проверяет его
Rust. В CSP он намеренно не продублирован: два списка в разных местах разъедутся.

## Проверка после правки

Сначала плеер и облако — самое хрупкое. Потом обложки, авторизация AniList, трейлер.
Пустая консоль обязательна: CSP сам сообщает о запрещённом ресурсе.