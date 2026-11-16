# Архитектура Android TV

## Слои

| Каталог | Назначение |
| --- | --- |
| `packages/core/src` | состояние, API-адаптеры и предметная логика без DOM |
| `apps/android-tv/src/app` | роутер, экраны, компоненты, темы и управление пультом |
| `apps/android-tv/src-tauri` | Tauri/Rust-оболочка, IPC, сеть, файлы, прокси и Android-интеграция |

`bridge/` задаёт платформенный контракт, `TauriBridge` реализует его для оболочки. Ядро не импортирует Vue и Tauri.

## Ядро и API

`core/collection.ts` содержит локальный список; `collection-view.ts` выполняет сортировку и фильтрацию. `snapshot.ts`, `settings.ts`, `db.ts`, `dataset-names.ts`, `media-title.ts`, `franchise.ts`, `recs.ts`, `adult.ts`, `video.ts` и `playable.ts` реализуют хранение и обработку данных.

`api/` содержит клиенты AniList GraphQL, Shikimori, Kodik, Anilibria, AnimeThemes, Yandex Disk и `animori-data`. Сетевой транспорт и список разрешённых адресов находятся в Rust-оболочке.

## Экраны и ввод

Роутер (`src/app/router`) предоставляет главную, списки, историю, поиск, карточку тайтла, студию, плеер, настройки и журнал. Верхнее меню содержит главную, списки, историю, поиск и настройки.

`dpad.ts` выполняет пространственную навигацию и управляет фокусом. `back-stop.ts` передаёт аппаратную кнопку Back между оболочкой и WebView. Класс `am-lite` включает TV-стили, уменьшает эффекты и отключает hover. Темы задаются Standard/Lain и тремя палитрами.

## IPC и Android

Команды Rust охватывают сеть, хранилище, файлы, прокси и облако. Android-активность предоставляет ориентацию, системный Back, установку APK, MediaSession и управление воспроизведением.


## Видео и обновления

`player-hls.ts`, `player-view.ts` и `player-input.ts` связывают hls.js с экраном плеера. Источники видео — Anilibria и Kodik; AnimeThemes используется для музыкальных тем.

`src/app/update.ts` выбирает GitHub release с префиксом `android-tv-v`, проверяет ABI и передаёт APK Android-системе. Форматы тегов и артефактов описаны в [`docs/dev/RELEASES.md`](../RELEASES.md).

## Каталоги

- `src/app/components` — общие панели, карточки и элементы управления.
- `src/app/screens` — экраны и логика экранов.
- `src-tauri/src` — Rust-команды и платформенные адаптеры.
- `tests` — тесты чистых модулей интерфейса и ядра.
