# Архитектура приложения для Android

Приложение состоит из Vue-интерфейса (`apps/android/src/app`), общего TypeScript-ядра без DOM (`packages/core/src`) и Tauri/Rust-оболочки (`apps/android/src-tauri`). Интерфейс загружается в одном Android WebView.

## Модули

- `core/` хранит состояние списка, настройки, снимок, кэш IndexedDB, датасет названий, фильтрацию 18+, историю и модели воспроизведения.
- `api/` содержит клиенты AniList, Shikimori, Kodik, Aniliberty, AnimeThemes, Yandex Disk и датасета.
- `bridge/` описывает контракт платформы. `TauriBridge` связывает ядро с командами Rust.
- `src/app/` содержит роутер, экраны, компоненты, темы, сенсорный ввод и адаптеры Android.
- `src-tauri/src/` реализует IPC-команды, сетевые запросы, хранение, секреты и экспорт файлов.

## Обмен с оболочкой

Страница использует Tauri-команды для настроек, файлов, AniList, сети, прокси и облака. Kotlin-интерфейсы в `gen/android` передают управление ориентацией, inset-параметрами, Picture-in-Picture, MediaSession и системными файлами. Ответы нативного слоя поступают в WebView через `evaluateJavascript` и объекты `window.__am*`.

Сетевые URL проверяются в `src-tauri/src/hosts.rs`; запросы выполняет Rust. Токены AniList, облака и прокси доступны только секретному слою Rust и Android Keystore. CSP ограничивает WebView, а HLS-плеер получает поток через разрешённые `connect-src` и `media-src`.

## Функции приложения

Роуты находятся в `src/app/router/routes.ts`: главная, списки, история, поиск, карточка тайтла, студия, плеер, настройки и журнал. Плеер использует hls.js, Picture-in-Picture и системный MediaSession Android. Списки изменяются локально; AniList используется для чтения и импорта.

Настройки интерфейса задаются `appearance.ts` и `core/settings.ts`: Standard или Lain, тёмная, светлая или AMOLED-палитра, источник русских названий и режим фильтрации 18+.

## Сборка и выпуск

Сборка приложения находится в `apps/android`. Release-тег имеет вид `android-v<version>`, APK выпускаются для `arm64` и `armv7`. Механизм обновления описан в [`docs/dev/RELEASES.md`](../RELEASES.md).
