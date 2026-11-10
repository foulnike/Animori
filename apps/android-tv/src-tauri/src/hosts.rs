// Адреса, куда окно вправе слать запросы через net.rs. Раньше этот список жил в
// capabilities/default.json как область плагина HTTP; плагин окну больше не выдан, и проверка
// идёт в Rust до сети. У каждого продукта свой список: файл намеренно не синхронный.

pub const ALLOWED: &[&str] = &[
    "https://graphql.anilist.co/*",
    "https://shikimori.io/*",
    "https://shikimori.rip/*",
    "https://raw.githubusercontent.com/*",
    "https://github.com/foulnike/animori-data/*",
    "https://objects.githubusercontent.com/*",
    "https://s4.anilist.co/*",
    "https://github.com/foulnike/Animori/*",
    "https://api.github.com/repos/foulnike/Animori/*",
    "https://kodik-api.com/*",
    "https://kodikplayer.com/*",
    "https://*.solodcdn.com/*",
    "https://*.kodik-cdn.com/*",
    "https://i.kodikres.com/*",
    "https://anilibria.top/*",
    "https://cloud-api.yandex.net/*",
    "https://*.disk.yandex.net/*",
    "https://*.dst.yandex.net/*",
    "https://*.dst.yandex.ru/*",
    "https://*.disk.yandex.ru/*",
];
