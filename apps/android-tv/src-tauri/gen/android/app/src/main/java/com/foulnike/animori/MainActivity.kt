package com.foulnike.animori

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File
import java.net.URL

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * «Назад» на пульте: пока открыто окно, шаг забирает и закрывает окно; окон нет — история, как
   * прежде. Callback включён только при открытом окне, последний добавленный отвечает первым.
   */
  private lateinit var backStop: OnBackPressedCallback

  override fun onWebViewCreate(webView: WebView) {
    backStop =
      object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
          webView.evaluateJavascript("window.__amBackStop && window.__amBackStop()", null)
        }
      }

    onBackPressedDispatcher.addCallback(this, backStop)

    // Мост для скрипта: окно само говорит, когда шаг «назад» его.
    // Интерфейс один и без доступа к файлам — наружу он ничего не даёт.
    webView.addJavascriptInterface(
      object {
        @JavascriptInterface
        fun setBackStop(active: Boolean) {
          webView.post { backStop.isEnabled = active }
        }
      },
      "AnimoriBack",
    )

    // Мост обновления: Tauri на Android своего апдейтера нет, версию сверяет разметка.
    // APK качается в свой кэш, установка — идентом, FLAG_GRANT_READ_URI_PERMISSION обязателен.
    webView.addJavascriptInterface(
      object {
        @JavascriptInterface
        fun abi(): String = Build.SUPPORTED_ABIS.firstOrNull() ?: "armeabi-v7a"

        /** false — ушли в настройки за правом установки, скачивания не было. */
        @JavascriptInterface
        fun install(url: String): Boolean {
          if (!mayInstall()) {
            openInstallSetting()
            return false
          }
          fetchAndInstall(url)
          return true
        }
      },
      "AnimoriUpdate",
    )
  }

  /**
   * Право ставить пакеты. Без него установщик молча не сработает; проверка до скачивания,
   * иначе человек ждёт файл, а установки нет.
   */
  private fun mayInstall(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    return packageManager.canRequestPackageInstalls()
  }

  private fun openInstallSetting() {
    val intent =
      Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, "package:$packageName".toUri())
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      startActivity(intent)
    } catch (ex: Exception) {
      Log.e("AniMori", "настройки установки не открылись: ${ex.message}")
    }
  }

  /** Качает APK в свой кэш и отдаёт его системе. Целостность проверит сама
   * система: файл, подписанный чужим ключом, установка не примет вовсе. */
  private fun fetchAndInstall(url: String) {
    val thread = Thread {
      try {
        val file = File(cacheDir, "update.apk")
        if (file.exists()) file.delete()

        URL(url).openStream().use { input -> file.outputStream().use { input.copyTo(it) } }

        // Пустой или крошечный файл — не APK, а ответ с ошибкой.
        if (file.length() < 100_000) {
          Log.e("AniMori", "обновление не скачалось: ${file.length()} байт")
          return@Thread
        }

        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW)
        intent.setDataAndType(uri, "application/vnd.android.package-archive")
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
      } catch (ex: Exception) {
        Log.e("AniMori", "обновление не поставилось: ${ex.message}")
      }
    }
    thread.start()
  }
}
