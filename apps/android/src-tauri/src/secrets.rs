// Секреты в хранилище. Windows: DPAPI для пропуска облака (am_cloud_token); прочее вне контура.
// Прочие платформы — passthrough: облако там не используется, хранилище как было.

#[cfg(windows)]
mod imp {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine as _;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    /// Метка шифротекста: без неё старая запись прочитана как есть.
    const PREFIX: &str = "enc:v1:";

    fn err() -> String {
        "DPAPI: ошибка Windows API".to_string()
    }

    /// Шифрует строку и возвращает enc:v1:<base64>.
    pub fn protect(plain: &str) -> Result<String, String> {
        unsafe {
            let bytes = plain.as_bytes();
            let input = CRYPT_INTEGER_BLOB {
                cbData: bytes.len() as u32,
                pbData: bytes.as_ptr() as *mut u8,
            };
            let mut output = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(&input, None, None, None, None, 0, &mut output).map_err(|_| err())?;
            let blob = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
            let mut b64 = BASE64.encode(blob);
            LocalFree(Some(HLOCAL(output.pbData as _)));
            b64.insert_str(0, PREFIX);
            Ok(b64)
        }
    }

    /// Расшифровывает enc:v1:<base64>. None — запись не в этом формате.
    pub fn unprotect(stored: &str) -> Option<Result<String, String>> {
        let body = stored.strip_prefix(PREFIX)?;
        let bytes = match BASE64.decode(body.as_bytes()) {
            Ok(v) => v,
            Err(_) => return Some(Err("DPAPI: запись испорчена".to_string())),
        };
        Some(unsafe {
            let input = CRYPT_INTEGER_BLOB {
                cbData: bytes.len() as u32,
                pbData: bytes.as_ptr() as *mut u8,
            };
            let mut output = CRYPT_INTEGER_BLOB::default();
            match CryptUnprotectData(&input, None, None, None, None, 0, &mut output) {
                Ok(()) => {
                    let plain = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
                    let text = String::from_utf8_lossy(plain).into_owned();
                    LocalFree(Some(HLOCAL(output.pbData as _)));
                    Ok(text)
                }
                Err(_) => Err("DPAPI: не расшифровано".to_string()),
            }
        })
    }

    #[cfg(test)]
    mod tests {
        #[test]
        fn round_trip() {
            let enc = super::protect("secret-value-42").expect("protect");
            assert!(enc.starts_with("enc:v1:"));
            let dec = super::unprotect(&enc).expect("Some").expect("Ok");
            assert_eq!(dec, "secret-value-42");
        }

        #[test]
        fn plain_is_not_encrypted() {
            assert!(super::unprotect("raw-token").is_none());
        }

        #[test]
        fn garbage_prefix_is_err() {
            assert!(super::unprotect("enc:v1:%%%").is_some());
        }
    }
}

#[cfg(not(windows))]
mod imp {
    /// Без шифра: запись как есть.
    pub fn protect(plain: &str) -> Result<String, String> {
        Ok(plain.to_string())
    }

    /// Ничего не зашифровано — читаем как раньше.
    pub fn unprotect(_stored: &str) -> Option<Result<String, String>> {
        None
    }
}

pub use imp::{protect, unprotect};
