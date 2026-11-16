# Content Security Policy

Политика CSP задана в `app.security.csp` файлов `tauri.conf.json` для `apps/windows`, `apps/android-tv` и `apps/android`.

Ключевые разрешения:

| Директива | Использование |
| --- | --- |
| `script-src 'self'` | скрипты сборки без inline-кода и eval |
| `style-src 'unsafe-inline'` | inline-стили Vue-компонентов |
| `worker-src blob:` | worker для transmuxer hls.js |
| `img-src data: blob: https:` | локальные SVG, blob-обложки и изображения API |
| `frame-src` | трейлеры YouTube и Dailymotion |
| `ipc: http://ipc.localhost` | IPC Tauri |
| `connect-src`, `media-src` | HLS-манифесты и сегменты Kodik, Anilibria и AnimeThemes |

Команды интерфейса выполняются через Tauri IPC. Сетевые адреса для команд Rust дополнительно проверяются в `src-tauri/src/hosts.rs`; CSP на эти запросы не распространяется.
