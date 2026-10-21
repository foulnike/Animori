# Документация AniMori для телефона

Клиент AniList под Android-телефоны, управление пальцем. Оболочка — Tauri 2 (Rust), интерфейс — Vue 3, общее ядро — TypeScript без DOM.

| Файл | О чём |
| --- | --- |
| `ARCHITECTURE.md` | слои, мост, экраны, вход, обновление, источники данных |
| `STORAGE.md` | настройки, снимок, склад, датасет, облако, выгрузка |
| `CONVENTIONS.md` | правила кода и документации |

Репозиторий один — `foulnike/Animori`, ветка `main`. Общее ядро лежит в `packages/core`; дубликаты файлов с приставкой намерены и контролируются `npm run drift` — см. `docs/dev/DUPLICATES.md`.

Описание продукта и порядок установки — в `README.md` в корне репозитория.

## Команды

```bash
npm run dev:app         # интерфейс в браузере, без оболочки
npm run build:app       # проверка типов и сборка интерфейса в dist/app
npm run typecheck:all   # ядро отдельно, затем всё вместе
npm test                # vitest, проверки чистых модулей ядра
npm run tauri -- android dev            # запуск на подключённом устройстве
npm run tauri -- android build -t arm64 # APK
```

`tauri android dev` горячей подстановки не даёт: `beforeDevCommand` собирает `dist/app` статически, и правки доходят только с перезапуском.
