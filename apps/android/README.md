# AniMori — мобильное приложение для Android

Клиент AniList для телефонов на Android 7.0 и новее, управление пальцем. Оболочка —
Tauri 2 (Rust), интерфейс — Vue 3, общее ядро — TypeScript без DOM. Проект неофициальный
и с командой AniList не связан.

Приложение — отдельный продукт в общем репозитории `foulnike/Animori`, каталог
`apps/android`. Оболочка и scaffold форкнуты от `apps/android-tv`; интерфейс пока
повторяет приставку и переделывается под тач-управление.

Команды — как у приставки:

```bash
npm run dev:app         # интерфейс в браузере, без оболочки
npm run build:app       # проверка типов и сборка интерфейса в dist/app
npm run typecheck:all   # ядро отдельно, затем всё вместе
npm test                # vitest, проверки чистых модулей ядра
npm run tauri -- android dev    # запуск на подключённом устройстве
npm run tauri -- android build -t arm64   # APK
```

Ядро лежит в `packages/core`, своей копии нет. Правила границы — в
`docs/dev/windows/CONVENTIONS.md`, устройство оболочки — в `docs/dev/android-tv/ARCHITECTURE.md`.

## Отладка на устройстве

Телефон по USB, включённая отладка по USB. На Windows CLI Tauri по умолчанию привязывает
dev-сервер к «публичному адресу» (обычно адаптер WSL), до которого телефон по кабелю не
добирается. Работает loopback-сервер плюс туннель adb: сеть и VPN не участвуют.

```bash
adb reverse tcp:1430 tcp:1430
npm run tauri -- android dev --host 127.0.0.1
```

1430 — порт встроенного dev-сервера Tauri, меняется флагом `--port` или `TAURI_CLI_PORT`.