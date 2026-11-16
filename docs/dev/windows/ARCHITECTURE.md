# Архитектура приложения Windows

## Слои

- `apps/windows/src/app` — Vue-экраны, компоненты, роутер и темы.
- `packages/core/src` — API-адаптеры и предметная логика без DOM.
- `apps/windows/src-tauri/src` — Rust-команды, сеть, файлы, секреты, прокси и обновления.

`packages/core/src/bridge` задаёт контракт платформы. Реализация `TauriBridge` подключается через `@bridge-impl`; ядро и интерфейс обращаются к Tauri через этот мост.

## Данные и сеть

Клиенты `api/anilist*.ts`, `shikimori*.ts`, `kodik.ts`, `aniliberty.ts`, `animethemes.ts`, `yandex-disk.ts` и `dataset.ts` вызываются из ядра. `core/collection.ts` управляет локальным списком, `collection-view.ts` строит представления, `snapshot.ts` сохраняет пользовательские данные, `db.ts` хранит кэш, а `media-title.ts` разрешает локализованные названия.

Запросы API проходят через Rust-команды и список разрешённых хостов `src-tauri/src/hosts.rs`. HLS-плеер получает манифесты и сегменты непосредственно из WebView по CSP. `rate-limit.ts` ограничивает обращения к API. Прокси применяется оболочкой; диагностика доступна через `proxyDiagnostics`.

## Оболочка

Команды и разрешения определены в `src-tauri/src/lib.rs`, `build.rs` и `capabilities/default.json`. Секреты AniList, Яндекс Диска и прокси шифруются платформенным хранилищем. Файлы служебного каталога ограничены `src-tauri/src/files.rs`; пользовательский XML экспортируется отдельной командой.

Авторизация AniList использует отдельное окно входа и локальный callback. Tauri updater получает подписанный манифест из канала `windows-latest`.

## Интерфейс и видео

Роуты находятся в `src/app/router/routes.ts`: главная, списки, история, поиск, тайтл, студия, плеер, настройки и статистика. Фильтрация 18+ реализована в `core/adult.ts`.

Плеер использует hls.js и источники Anilibria/Kodik. `player-hls.ts` подключает HLS к HTML `video`; состояние продолжения хранится в модуле плеера.

## Выпуск

Release workflow собирает NSIS, MSI и portable ZIP по тегу `windows-v<version>`. Конфигурация и каналы описаны в [`docs/dev/RELEASES.md`](../RELEASES.md).
