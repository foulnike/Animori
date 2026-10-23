<div align="center">

<img src="https://raw.githubusercontent.com/foulnike/Animori/main/apps/android-tv/src-tauri/icons/128x128@2x.png" width="128" alt="AniMori">

# AniMori — приложение для AniList на Android TV

**Плеер, русские названия и списки AniList на приставке. Без рекламы, телеметрии и своих серверов.**

[![Версия](https://img.shields.io/badge/%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F-3.1.2-02A9FF?style=flat-square&labelColor=0B1622)](https://github.com/foulnike/Animori/releases/latest)
[![Загрузка](https://img.shields.io/badge/APK-3.1.2-02A9FF?style=flat-square&labelColor=0B1622)](https://github.com/foulnike/Animori/releases/latest)
[![Лицензия](https://img.shields.io/badge/%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F-MIT-02A9FF?style=flat-square&labelColor=0B1622)](../../LICENSE)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?style=flat-square&logo=rust&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue%203-4FC08D?style=flat-square&logo=vue&logoColor=white)
![Tauri 2](https://img.shields.io/badge/Tauri%202-FFC131?style=flat-square&logo=tauri&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Android TV](https://img.shields.io/badge/Android%20TV-3DDC84?style=flat-square&logo=androidtv&logoColor=black)

[Установка](#установка) · [Что оно может](#что-оно-может) · [Сборка](#сборка) · [Документация](#документация)

</div>

---

**AniMori** — программа для Android TV, работающая с AniList напрямую. Проект
неофициальный и с командой AniList не связан.

> [!IMPORTANT]
> Рекламы, телеметрии и своих серверов нет. Токен, настройки и кэш лежат на устройстве.

> [!NOTE]
> Приложение в общем репозитории [`foulnike/Animori`](https://github.com/foulnike/Animori),
> каталог `apps/android-tv`. Настольное — `apps/windows`, общее ядро — `packages/core`.

## Как выглядит

<p align="center">
  <img src="screens/preview-calendar.png" width="23%" alt="Календарь выхода серий" />
  <img src="screens/preview-recs.png" width="23%" alt="Рекомендации" />
  <img src="screens/preview-lists.png" width="23%" alt="Мои списки" />
  <img src="screens/preview-card.png" width="23%" alt="Карточка тайтла" />
</p>

Полные кадры 1920×1080 — [`screens/calendar.png`](screens/calendar.png),
[`screens/recs.png`](screens/recs.png), [`screens/lists.png`](screens/lists.png)
и [`screens/card.png`](screens/card.png).

## Установка

Файл — на [странице выпусков](https://github.com/foulnike/Animori/releases/latest):
`AniMori_3.1.2_armv7.apk` для 32-разрядных приставок, `AniMori_3.1.2_arm64.apk`
для 64-разрядных. Разрядность — `adb shell getprop ro.product.cpu.abi`.

Ставится как обычное приложение: с флешки проводником или командой
`adb install`. Разрешение на установку из неизвестных источников Android
спрашивает один раз.

Следующие версии приложение находит само: при запуске спрашивает список
выпусков и показывает в меню **«Новая версия»**. Файл качается в кэш, ставит
его система.

Требования: Android TV, Android 7.0 и выше, пульт.

## Что оно может

**Смотреть.** Плеер с выбором серии, озвучки и качества, два источника —
Anilibria и Kodik. История помнит, где вы остановились, и «Продолжить» открывает
тот же тайтл с того места. Видео играет на приставке: пауза, перемотка и
выход — с пульта.

**Вести список.** Список лежит на приставке и открывается без сети. Запись
правится прямо в шторке: статус, оценка, число серий, пересмотры, даты, заметка.
Список приносится с Шикимори по нику — это единственный перенос на приставке.
Копию списка можно скачать с Яндекс Диска, но отправить её отсюда нельзя, и
выгрузки списка файлом тоже нет: ни XML, ни в папку. Всё это умеет настольное
приложение. Изменения остаются на устройстве, на сервер они не уходят.

**Знать о тайтле.** Карточка с русским описанием, персонажами и персоналом,
студией, кадрами, трейлером, опенингами и эндингами. На главной — календарь
выхода: что и когда выйдет у того, что вы смотрите. Поиск — по названиям,
персонажам и персоналу, тоже на русском.

**Настроить под себя.** Темы и акцент, источник русских названий, прокси для
AniList с живой проверкой, обновление по кнопке в меню. Входа в AniList на
приставке нет: он открывает страницу в отдельном окне, а на телевизоре это не
поддерживается.

**Управлять с пульта.** Фокус ходит стрелками, рельс вынесен отдельной полосой,
окна поверх экрана закрываются «Назад» — [`docs/dev/android-tv/ARCHITECTURE.md`](../../docs/dev/android-tv/ARCHITECTURE.md), раздел «Интерфейс».

Разделы — **Главная**, **Моё**, **История**, **Поиск**, **Настройки**; из них
открываются **Тайтл**, **Студия** и **Просмотр**. Приложение ведёт только аниме и
рисует экраны само: чужие страницы, реклама и телеметрия в нём не участвуют.
Запросы к API идут из процесса приложения, а не из веб-части, поэтому ограничения
браузера не мешают, а заголовки запросов под контролем.

Источники — [`docs/dev/android-tv/ARCHITECTURE.md`](../../docs/dev/android-tv/ARCHITECTURE.md), список и облако — [`docs/dev/android-tv/STORAGE.md`](../../docs/dev/android-tv/STORAGE.md).

## Сборка

```bash
npm install
npm run build:app
npm run tauri -- android build -t armv7
```

Каналы обновлений и статус выпусков — в [`docs/dev/RELEASES.md`](../../docs/dev/RELEASES.md).

## Источники данных

| Источник                             | Назначение                                     |
| :----------------------------------- | :--------------------------------------------- |
| `graphql.anilist.co`                 | данные и списки                                |
| `shikimori.rip`, `shikimori.io`      | русские названия, описания, персонажи, франшизы |
| `anilibria.top`, `kodik-api.com`     | ссылки на видео                                |
| `cloud-api.yandex.net`               | копия списка, по нажатию                       |
| `github.com`                         | датасет русских названий                       |
| `api.github.com`                     | список выпусков                                |

## Документация

| Документ                                 | Вопрос                        |
| :--------------------------------------- | :---------------------------- |
| [`docs/dev/android-tv/ARCHITECTURE.md`](../../docs/dev/android-tv/ARCHITECTURE.md) | слои, ядро, мост, экраны, интерфейс, источники данных |
| [`docs/dev/android-tv/STORAGE.md`](../../docs/dev/android-tv/STORAGE.md) | настройки, снимок, склад, датасет, облако, выгрузка |
| [`docs/dev/android-tv/CONVENTIONS.md`](../../docs/dev/android-tv/CONVENTIONS.md) | правила кода и документации |

Полный список — [`docs/dev/android-tv/README.md`](../../docs/dev/android-tv/README.md).

## Лицензия

[MIT](../../LICENSE) © foulnike. Лицензия покрывает код. Данные Shikimori
ею не покрываются: показываются со ссылкой на источник, в репозитории не
хранятся.

Датасет русских названий собирается в
[`foulnike/animori-data`](https://github.com/foulnike/animori-data) и выходит
под [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Сторонние сервисы принадлежат их владельцам и используются через публичные API.
