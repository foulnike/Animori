# Политика обработки персональных данных

**Редакция от 11 ноября 2026 года.**

## Русская версия

### 1. Автор и контакты

Автор программы AniMori — владелец учётной записи GitHub `foulnike` (далее —
Автор). Автор не получает, не хранит и не передаёт персональные данные
пользователей: всё, что описано ниже, программа делает на устройстве пользователя
по его командам. Этот документ описывает, какие данные программа хранит и куда их
отправляет.

Вопросы о данных принимаются по почте **foulnike@protonmail.com**.
Можно также написать в Issues репозитория `https://github.com/foulnike/Animori`, но
Issues публичны: если обращение касается ваших данных, пишите на почту.

### 2. Главное

- **У Автора нет серверов, и Автор не получает ваших данных.** Программа не
  отправляет Автору ни список, ни настройки, ни сведения об использовании.
  Аналитики и телеметрии нет.
- **Данные хранятся на вашем устройстве.**
- **Программа сама обращается к внешним сервисам**, когда вы пользуетесь их
  функциями: каталогу, видео, облаку. Эти запросы идут с вашего устройства
  напрямую к сервису, без посредников. Что сервис делает с полученным, решает он
  сам по своей политике конфиденциальности.

### 3. Что хранится на устройстве

1. Список: статусы, оценки, число серий, пересмотры, даты, заметки.
2. История просмотра: какие серии смотрели, где остановились, выбранная озвучка,
   календарь активности.
3. Настройки, в том числе адрес и порт прокси.
4. Токен AniList, токен Яндекс Диска и пароль прокси — если вы пользуетесь этими
   функциями. Они хранятся зашифрованными, см. раздел 8.
5. Кэш: названия, описания, обложки, датасет названий.
6. Служебный файл ошибок программы — до 2 МБ, без токенов и паролей. В настольном
   приложении есть ещё журнал отладки: по умолчанию он выключен и включается в
   настройках.

Ничего из этого не покидает устройство, кроме случаев из раздела 4.

### 4. Кому и что передаётся

Каждый сетевой запрос сообщает сервису ваш IP-адрес и сведения о программе.
Запросы самой программы подписываются строкой `AniMori/<версия>`. Изображения,
видео и трейлеры загружает встроенный браузер, со своей стандартной строкой
браузера. Если в настройках задан прокси, владелец прокси видит, к каким
сервисам вы обращаетесь: в Windows через него идут все запросы, в Android — только
запросы самой программы, а изображения и видео загружаются напрямую.

| Получатель | Когда | Что получает помимо IP-адреса и сведений о программе |
| :--- | :--- | :--- |
| AniList (`graphql.anilist.co`, `s4.anilist.co`, вход на `anilist.co`) | каталог, расписание; вход в аккаунт по вашему желанию | при входе — ваш токен. Программа только читает список и ничего не меняет в аккаунте |
| Shikimori (`shikimori.io`, `shikimori.rip`) | русские названия и описания; перенос списка | при переносе — введённый вами ник |
| Kodik, Anilibria и их сети доставки (`kodik-api.com`, `kodikplayer.com`, `*.kodik-cdn.com`, `*.solodcdn.com`, `i.kodikres.com`, `anilibria.top`) | поиск и воспроизведение видео | номер тайтла, который вы открыли |
| AnimeThemes (`api.animethemes.moe`, `*.animethemes.moe`) | опенинги и эндинги; только настольное приложение | номер тайтла |
| YouTube, Dailymotion | трейлер, если вы его открыли; не на ТВ | — |
| Яндекс Диск (`cloud-api.yandex.net`, `*.disk.yandex.*`, `*.dst.yandex.*`) | сохранение и загрузка копии списка по вашей команде | ваш токен и файл копии списка |
| GitHub (`github.com`, `api.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`) | проверка обновлений, загрузка датасета названий | — |
| Хосты обложек и кадров | показ изображений | адрес изображения |
| Ваш прокси | если вы его настроили | Windows — весь сетевой трафик программы; Android — запросы самой программы |

Данные этим получателям не продаются и для рекламы не используются. Программа не
передаёт данные иным лицам.

Если вы создали ссылку на копию списка в облаке, копию целиком, вместе с
заметками, может прочитать любой, кто знает ссылку. После переноса списка
закройте доступ кнопкой «Закрыть доступ».

### 5. Трансграничная передача

Серверы части сервисов, например AniList, GitHub и YouTube, находятся за пределами
Российской Федерации. Когда вы пользуетесь их функциями, ваше устройство передаёт
им данные из раздела 4 напрямую. Автор в этой передаче не участвует.

### 6. Основания передачи

Программа отправляет данные только когда вы пользуетесь соответствующей функцией:
входите в AniList, подключаете облако, переносите список, запускаете видео.
Внешние сервисы обрабатывают полученное на основаниях, указанных в их политиках
конфиденциальности. Чтобы прекратить передачу, перестаньте пользоваться функцией
или удалите данные способами из раздела 9.

### 7. Сроки хранения

- **На устройстве** — пока вы не удалите данные или программу.
- **У Автора** — данных нет, хранить нечего.
- **У внешних сервисов** — сроки определяют сами сервисы, Автор на них не
  влияет. Список, который вы ведёте на AniList, и копия на Яндекс Диске хранятся
  там, пока вы их не удалите.

### 8. Токены

- **AniList.** Токен выдаётся после входа на сайте AniList, программа проверяет,
  что ответ пришёл на её собственный запрос входа. Срок жизни токена задаёт
  AniList, по его истечении нужно войти заново. Токен используется только для
  чтения: запросы на изменение программа отклоняет до отправки.
- **Яндекс Диск.** Токен вы получаете на странице Яндекса и вводите в программу.
- **Хранение.** Токены и пароль прокси хранятся зашифрованными: в Windows —
  средствами системы (DPAPI) для вашей учётной записи, в Android — ключом в
  системном хранилище Android Keystore. Окно программы токенов не видит: с ними
  работает только нативная часть программы.
- **Удаление.** «Выйти» из AniList и «Отключить облако» стирают токен с
  устройства. Сам доступ на стороне сервиса при этом остаётся. Чтобы отозвать
  его полностью, отзовите доступ приложения в настройках аккаунта AniList или
  Яндекс ID.

### 9. Удаление данных

1. **«Удалить мой список»** в настройках стирает список с устройства.
2. **«Очистить память»** стирает кэш названий, описаний и обложек.
3. **«Выйти»** из AniList и **«Отключить облако»** — см. раздел 8. Файл копии на
   Яндекс Диске остаётся, его можно удалить на самом Диске.
4. **Удаление программы.** На Android удаляются все данные программы, резервное
   копирование в облако Google для неё выключено. На Windows данные могут
   остаться в папках `%APPDATA%\com.foulnike.animori` и
   `%LOCALAPPDATA%\com.foulnike.animori`, их можно удалить вручную.
5. **У внешних сервисов** данные удаляются средствами этих сервисов: Автор не
   имеет к ним доступа.

### 10. Ваши данные и обращения

Данные на вашем устройстве вы просматриваете, исправляете и удаляете сами, см.
раздел 9. Данные, переданные внешним сервисам, исправляются и удаляются по
запросу к этим сервисам.

На вопросы по почте Автор отвечает в течение 10 рабочих дней.

### 11. Изменение Политики

Новая редакция публикуется в репозитории `https://github.com/foulnike/Animori`,
файл `docs/PRIVACY.md`, с датой редакции в начале документа, и действует с момента
публикации. Прежние редакции сохраняются в истории репозитория.

---

## English version

**Effective date: November 11, 2026.**

### 1. Author and contact

The author of AniMori is the owner of the GitHub account `foulnike` (the
"Author"). The Author does not receive, store or transfer users' personal data:
everything described below is done by the application on the user's device at the
user's command. This document describes what data the application stores and where
it sends it.

Questions about data are accepted by email at **foulnike@protonmail.com**. You may also
open an issue in the `https://github.com/foulnike/Animori` repository, but issues are
public: for requests concerning your own data, please use email.

### 2. Summary

- **The Author runs no servers and receives none of your data.** The application
  sends the Author neither your list, nor your settings, nor usage information.
  There is no analytics or telemetry.
- **Your data is stored on your device.**
- **The application contacts third-party services itself** when you use their
  features: the catalog, video, cloud backup. These requests go from your device
  directly to the service, with no intermediary. What the service does with what it
  receives is governed by its own privacy policy.

### 3. Data stored on the device

1. Your list: statuses, scores, episode counts, rewatches, dates, notes.
2. Watch history: episodes watched, playback positions, selected voice-overs, the
   activity calendar.
3. Settings, including the proxy address and port.
4. The AniList token, the Yandex Disk token and the proxy password, if you use these
   features. They are stored encrypted, see section 8.
5. Cache: titles, descriptions, covers, the title dataset.
6. The application's internal error file, up to 2 MB, containing no tokens or
   passwords. The desktop application also has a debug log: it is off by default and
   can be enabled in settings.

None of this leaves the device except as described in section 4.

### 4. Recipients

Every network request discloses your IP address and information about the
application to the service. Requests made by the application itself are signed
`AniMori/<version>`. Images, video and trailers are loaded by the built-in browser
with its standard browser string. If a proxy is configured, the proxy operator can
see which services you contact: on Windows all requests go through it, on Android
only the application's own requests do, while images and video load directly.

| Recipient | When | What it receives besides IP address and application information |
| :--- | :--- | :--- |
| AniList (`graphql.anilist.co`, `s4.anilist.co`, sign-in at `anilist.co`) | catalog, schedule; sign-in if you choose to | after sign-in, your token. The application only reads your list and never changes your account |
| Shikimori (`shikimori.io`, `shikimori.rip`) | Russian titles and descriptions; list import | during import, the nickname you enter |
| Kodik, Anilibria and their delivery networks (`kodik-api.com`, `kodikplayer.com`, `*.kodik-cdn.com`, `*.solodcdn.com`, `i.kodikres.com`, `anilibria.top`) | finding and playing video | the ID of the title you opened |
| AnimeThemes (`api.animethemes.moe`, `*.animethemes.moe`) | openings and endings; desktop application only | the title ID |
| YouTube, Dailymotion | a trailer, if you open one; not on TV | — |
| Yandex Disk (`cloud-api.yandex.net`, `*.disk.yandex.*`, `*.dst.yandex.*`) | saving and loading a copy of your list on your command | your token and the list file |
| GitHub (`github.com`, `api.github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`) | update checks, title dataset download | — |
| Cover and screenshot hosts | displaying images | the image address |
| Your proxy | if you configured one | Windows: all of the application's network traffic; Android: the application's own requests |

Data is not sold to these recipients and is not used for advertising. The
application does not disclose data to anyone else.

If you created a link to your cloud copy, anyone who knows the link can read the
whole copy, including notes. After transferring your list, close access with
"Close access".

### 5. International transfers

Some services, such as AniList, GitHub and YouTube, operate servers outside the
Russian Federation. When you use their features, your device sends them the data in
section 4 directly. The Author takes no part in this transfer.

### 6. Grounds for transfers

The application sends data only when you use the corresponding feature: signing in
to AniList, connecting cloud backup, importing a list, starting a video.
Third-party services process what they receive on the grounds stated in their
privacy policies. To stop a transfer, stop using the feature or delete the data as
described in section 9.

### 7. Retention

- **On the device**: until you delete the data or the application.
- **By the Author**: there is no data to retain.
- **By third-party services**: retention is set by the services themselves; the
  Author has no influence over it. A list you keep on AniList and a copy on Yandex
  Disk remain there until you delete them.

### 8. Tokens

- **AniList.** The token is issued after you sign in on the AniList website; the
  application checks that the response belongs to its own sign-in request. The token
  lifetime is set by AniList; after it expires you need to sign in again. The token is
  used for reading only: the application rejects requests that would change data
  before they are sent.
- **Yandex Disk.** You obtain the token on the Yandex page and enter it in the
  application.
- **Storage.** Tokens and the proxy password are stored encrypted: on Windows with
  the system's DPAPI for your user account, on Android with a key in the Android
  Keystore. The application window cannot read the tokens: only the native part of
  the application handles them.
- **Removal.** "Sign out" of AniList and "Disconnect cloud" erase the token from the
  device. Access on the service's side remains. To revoke it fully, revoke the
  application's access in your AniList account settings or in Yandex ID.

### 9. Deleting data

1. **"Delete my list"** in settings erases the list from the device.
2. **"Clear memory"** erases the cache of titles, descriptions and covers.
3. **"Sign out"** of AniList and **"Disconnect cloud"**: see section 8. The backup file
   on Yandex Disk stays; you can delete it on Yandex Disk itself.
4. **Uninstalling.** On Android all application data is deleted; cloud backup to
   Google is disabled for the application. On Windows data may remain in
   `%APPDATA%\com.foulnike.animori` and `%LOCALAPPDATA%\com.foulnike.animori`; you can
   delete these folders manually.
5. **With third-party services**, data is deleted through those services: the
   Author has no access to it.

### 10. Your data and requests

You view, correct and delete data on your device yourself, see section 9. Data sent
to third-party services is corrected and deleted by request to those services.

The Author responds to email questions within 10 business days.

### 11. Changes to this Policy

A new revision is published in the `https://github.com/foulnike/Animori` repository,
file `docs/PRIVACY.md`, with the revision date at the top, and takes effect on
publication. Earlier revisions remain in the repository history.
