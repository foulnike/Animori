# Выпуски

Репозиторий публикует три продукта: Windows, Android TV и Android. Версия приложения задаётся в его `package.json` и совпадает с номером release-тега.

| Продукт | Тег | Артефакты | Обновление |
| --- | --- | --- | --- |
| Windows | `windows-v<version>` | NSIS, MSI, portable ZIP, `latest.json`, SHA256 | Tauri updater через `windows-latest` |
| Android TV | `android-tv-v<version>` | APK `arm64` и `armv7`, SHA256, лицензии | список GitHub Releases и префикс тега |
| Android | `android-v<version>` | APK `arm64` и `armv7`, SHA256, лицензии | список GitHub Releases и префикс тега |

Windows updater получает подписанный манифест из release `windows-latest`. Android-приложения выбирают APK по префиксу тега и ABI и передают его Android-системе.

Форматы release-тегов и состав артефактов определены в `.github/workflows/release.yml`, `release-tv.yml` и `release-android.yml`. Релизы Android имеют статус предварительных.
