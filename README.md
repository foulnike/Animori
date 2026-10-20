<div align="center">

<img src="apps/windows/src-tauri/icons/128x128@2x.png" width="112" alt="AniMori">

# AniMori

### Смотрите аниме и ведите списки AniList на русском — на ПК, ТВ и телефоне

Неофициальный клиент AniList для Windows, Android TV и телефона. Программа сама обращается
к API и подставляет русские названия и описания из Shikimori —
браузер и менеджер скриптов не нужны.

[![Лицензия](https://img.shields.io/badge/лицензия-MIT-02A9FF?style=flat-square&labelColor=0B1622)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows%2010%2F11-0078D4?style=flat-square&logo=windows&logoColor=white)](apps/windows)
[![Android TV](https://img.shields.io/badge/Android%20TV%207.0%2B-3DDC84?style=flat-square&logo=androidtv&logoColor=black)](apps/android-tv)
[![Android](https://img.shields.io/badge/Android%207.0%2B-3DDC84?style=flat-square&logo=android&logoColor=black)](apps/android)

**[Скачать для Windows](https://github.com/foulnike/Animori/releases/latest)** ·
**[Скачать APK для Android TV](https://github.com/foulnike/Animori/releases)** ·
**[Скачать APK для телефона](https://github.com/foulnike/Animori/releases)** ·
[Сборка из исходников](#сборка)

</div>

<p align="center">
  <img src="apps/windows/assets/screenshots/home.png" width="92%" alt="Главная: календарь выхода, продолжение просмотра, полки">
</p>

## Актуальные версии

| Приложение | Версия | Скачать |
| :--- | :--- | :--- |
| **Windows** 10/11 | 3.1.1 | [установщик, MSI, портативный архив](https://github.com/foulnike/Animori/releases/latest) |
| **Android TV** 7.0+ | 3.1.1 | [APK armv7 и arm64](https://github.com/foulnike/Animori/releases/tag/android-tv-v3.1.1) |
| **Телефон** (Android 7.0+) | 3.1.1 | [APK arm64 и armv7](https://github.com/foulnike/Animori/releases/tag/android-v3.1.1) |

## Почему это удобно

- **Список открывается без сети.** Правки хранятся на устройстве: AniList не
  падает, страница не нужна. Статус, оценка, серии, пересмотры, даты и заметка
  меняются прямо в шторке.
- **Продолжение в один клик.** История помнит, где вы остановились.
- **Русские названия подставляет сама программа.** AniList даёт карточку,
  Shikimori — русский тайтл и описание.
- **Свой плеер внутри.** Серия, озвучка, качество, два источника.
- **Ни рекламы, ни телеметрии, ни своих серверов.** Токен, настройки и кэш лежат
  на вашей машине.
- **Список никуда не отправляется.** Изменения не уходят ни в AniList, ни в
  Шикимори.

> [!WARNING]
> **Видеоисточники.** Встроенный плеер открывает потоки сторонних сервисов
> (Kodik, Anilibria), не связанных с AniMori и не являющихся
> правообладателями. Программа не размещает, не хранит и не копирует
> видеоматериал, лицензий на него не получает и прав на распространение не
> имеет; источники не проверяются, законность и доступность контента не
> гарантируются. За выбор источника и за просмотр отвечает пользователь.
> Подробнее — [Условия использования](docs/TERMS.md), раздел «Сторонний
> контент и видеоисточники».

## Настольное приложение

**Windows 10/11**. Установщик, MSI или портативный архив без
установки — в [выпусках](https://github.com/foulnike/Animori/releases/latest).

<table>
  <tr>
    <td width="50%"><img src="apps/windows/assets/screenshots/lists.jpg" alt="Моё: списки по статусам"><br><sub><b>Список.</b> Живёт на устройстве, открывается без сети.</sub></td>
    <td width="50%"><img src="apps/windows/assets/screenshots/media.jpg" alt="Карточка тайтла"><br><sub><b>Тайтл.</b> Русское описание, кадры, трейлер, персонажи, опенинги.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="apps/windows/assets/screenshots/stats.png" alt="Статистика"><br><sub><b>Статистика.</b> Время просмотра, ваши оценки против оценок сообщества.</sub></td>
    <td width="50%"><img src="apps/windows/assets/screenshots/settings.png" alt="Настройки"><br><sub><b>Настройки.</b> Темы, перенос списка, прокси, журнал отладки.</sub></td>
  </tr>
</table>

Перенос списка из AniList, с Шикимори по нику или файлом выгрузки MyAnimeList.
Спасти можно тем же XML, который принимают AniList, Шикимори и Kitsu, либо
копией в облако. Смотрите в отдельном окне или транслируйте на телевизор.
Подробности — в [apps/windows](apps/windows).

## Приложение для телевизора

**Android TV, Android 7.0 и новее**.

<p align="center">
  <img src="apps/android-tv/screens/preview-calendar.png" width="23%" alt="Календарь выхода серий">
  <img src="apps/android-tv/screens/preview-recs.png" width="23%" alt="Полки рекомендаций">
  <img src="apps/android-tv/screens/preview-lists.png" width="23%" alt="Мои списки">
  <img src="apps/android-tv/screens/preview-card.png" width="23%" alt="Карточка тайтла">
</p>

<p align="center"><sub>Календарь · Рекомендации · Списки · Карточка</sub></p>

APK в [выпусках](https://github.com/foulnike/Animori/releases):
`AniMori_3.1.1_armv7.apk` для 32-разрядных приставок и `AniMori_3.1.1_arm64.apk`
для 64-разрядных.
Подробности — в [apps/android-tv](apps/android-tv).

## Приложение для телефона

**Android 7.0 и новее**.

<p align="center">
  <img src="apps/android/screens/phone-home.jpg" width="31%" alt="Главная: календарь выхода, продолжение просмотра, полки">
  <img src="apps/android/screens/phone-lists.jpg" width="31%" alt="Моё: списки по статусам">
  <img src="apps/android/screens/phone-card.jpg" width="31%" alt="Карточка тайтла">
</p>

<p align="center"><sub>Главная · Списки · Карточка</sub></p>

APK в [выпусках](https://github.com/foulnike/Animori/releases):
`AniMori_3.1.1_arm64.apk` для 64-разрядных телефонов и `AniMori_3.1.1_armv7.apk`
для 32-разрядных.
Подробности — в [apps/android](apps/android).

## Сборка

Нужен Node.js 24 или новее (npm 11): lock репозитория сгенерирован npm 11 и не
встаёт под npm 10 с Node 20/22. Для Android дополнительно Android SDK и NDK.

```bash
npm ci
npm test
npm run typecheck
```

Разработка — из каталога приложения:

```bash
cd apps/windows   && npm run tauri dev
cd apps/android-tv && npm run tauri -- android dev
cd apps/android   && npm run tauri -- android dev   # туннель adb: см. apps/android
```

Выпуск делается тегом: `windows-v3.1.1`, `android-tv-v3.1.1` или `android-v3.1.1`.

## Устройство репозитория

| Каталог | Что в нём |
| :--- | :--- |
| `packages/core` | Общее ядро: данные, снимок, облачная копия, видео |
| `apps/windows` | Настольное приложение: экраны и оболочка |
| `apps/android-tv` | Приложение для телевизора: экраны и оболочка |
| `apps/android` | Приложение для телефона: экраны и оболочка |
| `docs` | Документация: правовая и для разработчиков — [оглавление](docs/README.md) |

## Лицензия

[MIT](LICENSE). Зависимости приходят со своими лицензиями — перечень в
[THIRD-PARTY.md](docs/THIRD-PARTY.md), он собирается из `package-lock.json`. Русские названия и
описания приходят из [Shikimori](https://shikimori.one);
датасет собирается в [animori-data](https://github.com/foulnike/animori-data). Проект
неофициальный и с командой AniList не связан.

## Правовые документы

- [Политика обработки персональных данных](docs/PRIVACY.md) (русская и английская версии)
- [Условия использования](docs/TERMS.md) (русская и английская версии)
- [Безопасность](docs/SECURITY.md) — как сообщить об уязвимости
