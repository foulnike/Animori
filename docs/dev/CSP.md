# Content Security Policy

Политика лежит в `app.security.csp` в `tauri.conf.json` трёх приложений:
`apps/windows`, `apps/android-tv`, `apps/android`. На всех трёх одинаковая.

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
| `img-src https:` | Обложки приходят из API (AniList, Шикимори, MAL). CDN-хосты меняются и их много, поэтому `img-src` остаётся широким. `http:` удалён — обложки по http не загружаются |
| `frame-src` (youtube, dailymotion) | Трейлеры — iframe только из этого списка. Новая площадка трейлеров требует хост и здесь, и в `TRAILER_SITES` (`packages/core/src/api/anilist-media.ts`): без хоста iframe блокируется молча |

## Почему media-src и connect-src узкие

hls.js выполняет `fetch`/`XMLHttpRequest` из webview для манифеста и каждого сегмента потока.
Эти запросы ограничены `connect-src` и `media-src`, в которых перечислены только известные
CDN потоков:
- Kodik: `*.kodik-cdn.com`, `*.solodcdn.com`
- Aniliberty: `anilibria.top`, `*.anilibria.top`
- AnimeThemes: `*.animethemes.moe`

Команды UI (`animori_http_request`, `animori_anilist_query`, `animori_cloud_*`) идут через
`invoke` → Rust, который проверяет адрес по `src-tauri/src/hosts.rs` (`net.rs`). Эти запросы
не ограничены CSP.

## Проверка после правки

Сначала плеер и облако — самое хрупкое. Потом обложки, авторизация AniList, трейлер.
Пустая консоль обязательна: CSP сам сообщает о запрещённом ресурсе.