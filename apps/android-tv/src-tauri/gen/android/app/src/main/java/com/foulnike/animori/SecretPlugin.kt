package com.foulnike.animori

import android.app.Activity
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Шифр секретов (secrets.rs, platform::android): ключ AES-256-GCM живёт в Android Keystore,
 * наружу не выдаётся и в резервную копию не попадает. Блоб: IV (12 байт) + шифртекст + тег (16).
 * Любой отказ уходит в Rust с кодом "corrupted"; текст отказа — только имя класса ошибки,
 * ни открытого текста, ни шифртекста в нём нет. Файл одинаков у телефона и ТВ, кроме package.
 */
@TauriPlugin
class SecretPlugin(private val activity: Activity) : Plugin(activity) {
    private companion object {
        const val PROVIDER = "AndroidKeyStore"
        const val ALIAS = "animori.secrets.v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_BITS = 128
        const val IV_BYTES = 12
        const val TAG_BYTES = 16
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

    /** Ключ по алиасу. Битая запись (не SecretKeyEntry, не читается) считается отсутствующей. */
    private fun existingKey(): SecretKey? =
        try {
            (keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey
        } catch (e: Exception) {
            null
        }

    /** Новый ключ взамен прежнего: битый или сброшенный системой алиас стирается. */
    private fun freshKey(): SecretKey {
        val ks = keyStore()
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS)
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun sealWith(key: SecretKey, plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val body = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + body, Base64.NO_WRAP)
    }

    private fun fail(invoke: Invoke, e: Throwable) {
        invoke.reject("Keystore: ${e.javaClass.simpleName}", "corrupted")
    }

    @Command
    fun seal(invoke: Invoke) {
        val plain = invoke.getArgs().getString("plain", null)
        if (plain == null) {
            invoke.reject("Keystore: нет входных данных", "corrupted")
            return
        }
        try {
            val sealed =
                try {
                    sealWith(existingKey() ?: freshKey(), plain)
                } catch (e: KeyPermanentlyInvalidatedException) {
                    // Ключ сброшен системой: прежние блобы уже не открыть, новый ключ — один повтор.
                    sealWith(freshKey(), plain)
                }
            invoke.resolve(JSObject().apply { put("sealed", sealed) })
        } catch (e: Exception) {
            fail(invoke, e)
        }
    }

    @Command
    fun open(invoke: Invoke) {
        val encoded = invoke.getArgs().getString("sealed", null)
        if (encoded == null) {
            invoke.reject("Keystore: нет входных данных", "corrupted")
            return
        }
        try {
            val blob = Base64.decode(encoded, Base64.NO_WRAP)
            if (blob.size < IV_BYTES + TAG_BYTES) {
                invoke.reject("Keystore: блоб короче минимума", "corrupted")
                return
            }
            // Ключа нет (переустановка, смена пользователя, восстановление из копии): блоб не открыть.
            val key = existingKey()
            if (key == null) {
                invoke.reject("Keystore: ключ не найден", "corrupted")
                return
            }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES))
            val plain = cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES)
            invoke.resolve(JSObject().apply { put("plain", String(plain, Charsets.UTF_8)) })
        } catch (e: Exception) {
            // AEADBadTagException, KeyPermanentlyInvalidatedException, испорченный Base64 и прочее.
            fail(invoke, e)
        }
    }
}
