# Сборка и выпуск

## Требования

- Node.js 24 (npm 11): lock репозитория не встаёт под npm 10 с Node 20/22.
- Android SDK, NDK `30.0.15729638`, JDK 17.
- Телефон с отладкой по USB: `adb devices` должен показывать устройство.

## Разработка на устройстве

```bash
adb reverse tcp:1430 tcp:1430
cd apps/android && npm run tauri -- android dev --host 127.0.0.1
```

Порт 1430 — dev-сервер Tauri; `--host 127.0.0.1` обязателен: без него оболочка
привязывается к адресу, которого телефон по кабелю не видит, а туннель adb
работает только с loopback. Горячей подстановки нет: `beforeDevCommand`
собирает `dist/app` статически, и любая правка доходит перезапуском
dev-сессии.

## APK вручную

```bash
cd apps/android && npm run tauri -- android build -t arm64   # или armv7
```

Файл выходит неподписанным — подпись накладывается отдельно
(`zipalign`, `apksigner`, см. `.github/workflows/release-android.yml`).

## Выпуск

Тег `android-v<версия>`; номер сверяется с `apps/android/package.json`.
Конвейер `release-android.yml`:

- собирает `arm64` и `armv7` отдельными строками matrix;
- подписывает ключом из секретов `ANIMORI_KEYSTORE_BASE64`,
  `ANIMORI_KEYSTORE_PASSWORD`, `ANIMORI_KEY_ALIAS`, `ANIMORI_KEY_PASSWORD`
  (те же, что у приставки; ключ обязан быть постоянным — иначе обновление
  с первой версии не встанет);
- проверяет имена `AniMori_<version>_<abi>.apk` — их ждёт апдейтер;
- публикует предварительным выпуском: обычный перехватил бы
  `releases/latest`, на котором держится настольный апдейтер.

Пробный прогон: запуск вручную (`workflow_dispatch`) с вводом `dry` — сборка
и подпись проходят, публикация пропускается. Отмена выпуска — сначала Cancel.
