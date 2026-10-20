package com.foulnike.animori.mobile

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.util.Rational
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import java.io.File
import java.net.URL
import org.json.JSONObject

class MainActivity : TauriActivity() {
  companion object {
    /** Коды запросов системных пикеров. Свои, далеко от чужих: оболочка и плагины
     *  тоже ждут onActivityResult, и пересечение кодов спрятало бы чужой ответ. */
    private const val REQUEST_PICK_XML = 7301
    private const val REQUEST_SAVE_XML = 7302
  }
  /** Системные поля в пикселях. Chromium не всегда отдаёт их в env(): нижний навбар
     в три кнопки до CSS не доходит, и содержимое уезжает под него. */
  @Volatile private var sysTop = 0

  @Volatile private var sysBottom = 0

  /** Хранилище WebView для ответов моста файлов: onActivityResult живёт в активности,
   *  а звать в страницу можно только через ту самую WebView. */
  @Volatile private var fileWebView: WebView? = null

  /** Текст выгрузки до выбора документа: он приходит из страницы, а пикер открывается позже. */
  @Volatile private var savePayload: String? = null

  // ПИКТУР-ИН-ПИКТУР. Web-PiP в Android WebView мёртв (caniwebview: requestPictureInPicture
  // и весь родной API — unsupported), поэтому кадр в маленькое окно уносит сама активность.
  // Страница кормит мост прямоугольником кадра и признаком игры; свернуть приложение — и оно
  // само уезжает в PiP. Оба поля в пикселях: CSS живёт в dp, но системе нужны пиксели.

  /** Прямоугольник кадра на экране; null — кадр ещё не мерился. */
  @Volatile private var pipRect: Rect? = null

  /** Пропорция кадра для маленького окна; знаменатель ноль — не сообщали, ставим 16:9. */
  @Volatile private var pipAspectW = 16

  @Volatile private var pipAspectH = 9

  /** Игра ли сейчас: PiP по сворачиванию нужен только под живой кадр. */
  @Volatile private var pipPlaying = false

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    window.decorView.setOnApplyWindowInsetsListener { _, insets ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val bars =
          insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        sysTop = bars.top
        sysBottom = bars.bottom
      } else {
        @Suppress("DEPRECATION")
        sysTop = insets.systemWindowInsetTop
        @Suppress("DEPRECATION")
        sysBottom = insets.systemWindowInsetBottom
      }
      insets
    }
  }

  /**
   * Аппаратная кнопка «Назад».
   *
   * По умолчанию оболочка Tauri сама отвечает на неё: пока в окне есть куда
   * вернуться, она листает историю окна (WryActivity). Для приложения с
   * адресами это означало: из окна поверх карточки человек уезжал на прежний
   * экран, хотя окно он и не думал закрывать — оно просто уходило вместе
   * с экраном под ним.
   *
   * Теперь решение за окном: пока открыто хоть одно окно, шаг достаётся
   * ему, и оно закрывается; окон нет — ходит история, как прежде.
   *
   * Механизм — два куска. Обратный вызов включён только тогда, когда окно
   * открыто (включает его само окно из скрипта), поэтому лишних шагов
   * приложение не съедает: вызов выключен, и нажатие достаётся оболочке.
   * Порядок вызовов здесь важен: последний добавленный отвечает первым,
   * а добавляем мы свой после того, что ставит Tauri в setWebView.
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

    // Мост обновления. Своего апдейтера у Tauri на Android нет вовсе: плагин
    // существует только для десктопа, и здесь от него ничего не осталось.
    // Поэтому версию сверяет разметка, а установку отдаём системе.
    //
    // Разрядность отдаём наружу: по ней разметка выбирает файл выпуска.
    // Сторонний установщик не годится, поэтому
    // APK качается в свой кэш и отдаётся системе намерением с правом чтения:
    // без FLAG_GRANT_READ_URI_PERMISSION установщик получит отказ в доступе.
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
          // Схема проверяется здесь, а не на доверии к странице — как в openExternal.
          // Подпись APK всё равно сверит система, но посторонний file:// или content:// в руки нечего давать.
          if (!url.startsWith("https://")) {
            Log.e("AniMori", "обновление: адрес не https, отказано")
            return false
          }
          fetchAndInstall(url)
          return true
        }
      },
      "AnimoriUpdate",
    )

    // Мост ориентации и погружения: приложение портретное, плеер просит альбомную сторону
    // и прячет системные полосы со строкой часов и заряда.
    webView.addJavascriptInterface(
      object {
        @JavascriptInterface
        fun set(name: String) {
          val mode =
            when (name) {
              "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
              // Фулскрин трейлера: экран слушает датчик, и телефон ложится боком по желанию.
              // Вне фулскрина сюда не приходят — портретный лок приложения остаётся.
              "auto" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR
              else -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            }
          runOnUiThread { requestedOrientation = mode }
        }

        /** Системные полосы: плеер живёт без них, выход возвращает. Свайп с края их показывает. */
        @JavascriptInterface
        fun immersive(on: Boolean) {
          runOnUiThread {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
              val controller = window.insetsController
              if (on) {
                controller?.hide(WindowInsets.Type.systemBars())
                controller?.systemBarsBehavior =
                  WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
              } else {
                controller?.show(WindowInsets.Type.systemBars())
              }
            } else {
              @Suppress("DEPRECATION")
              window.decorView.systemUiVisibility =
                if (on) {
                  View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                } else {
                  View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                }
            }
          }
        }

        /** Текущие системные поля для CSS: навбар и вырез. Приходят физическими пикселями,
         *  делятся на плотность — в CSS живут dp, и сырое число давало тройное поле. */
        @JavascriptInterface
        fun insetTop(): Int = Math.round(sysTop / resources.displayMetrics.density)

        @JavascriptInterface
        fun insetBottom(): Int = Math.round(sysBottom / resources.displayMetrics.density)
      },
      "AnimoriOrient",
    )

    // Мост Picture-in-Picture. На телефоне кадр в маленькое окно уносит активность, а не движок:
    // Web-PiP в Android WebView не поддержан вовсе. Страница сообщает прямоугольник кадра и игру,
    // а также сама просит разворот по кнопке.
    webView.addJavascriptInterface(
      object {
        /** Кадр меряется в dp (CSS), системе нужны пиксели — пересчёт по плотности. */
        @JavascriptInterface
        fun source(leftDp: Int, topDp: Int, widthDp: Int, heightDp: Int, aspectW: Int, aspectH: Int) {
          val density = resources.displayMetrics.density
          val left = Math.round(leftDp * density)
          val top = Math.round(topDp * density)
          val width = Math.round(widthDp * density)
          val height = Math.round(heightDp * density)
          pipRect = Rect(left, top, left + width, top + height)
          pipAspectW = if (aspectW > 0) aspectW else 16
          pipAspectH = if (aspectH > 0) aspectH else 9
        }

        /** Игра идёт: по этому признаку сворачивание решает, уводить ли кадр. */
        @JavascriptInterface
        fun playing(on: Boolean) {
          pipPlaying = on
        }

        /** Уводит кадр в маленькое окно по кнопке. Мост зовётся из фонового потока WebView,
         *  а разворот — работа UI-потока: отвечаем готовностью, а сам увод — туда. */
        @JavascriptInterface
        fun enter(): Boolean {
          val ready = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && pipRect !== null
          if (ready) runOnUiThread { enterPipNow() }
          return ready
        }

        /** Умеет ли устройство PiP вовсе: кнопки без умения быть не должно. */
        @JavascriptInterface
        fun supports(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      },
      "AnimoriPip",
    )

    // Мост медиа. Страница держит MediaSession в правде: игра/пауза, позиция и заголовок идут
    // наружу, чтобы кнопки пуск/пауза и смены серий в PiP показывали настоящее. В обратную
    // сторону — команды «переключить», «предыдущая» и «следующая».
    Media.attach(webView)
    webView.addJavascriptInterface(
      object {
        /** Состояние звука: игра/пауза и позиция с длительностью в миллисекундах. */
        @JavascriptInterface
        fun state(on: Boolean, positionMs: Long, durationMs: Long) {
          Media.reportState(this@MainActivity, on, positionMs, durationMs)
        }

        /** Заголовок кадра для плашки. */
        @JavascriptInterface
        fun title(text: String) {
          Media.reportTitle(this@MainActivity, text)
        }

        /** Плеер размонтирован — сессия гаснет, кнопки PiP уходят. */
        @JavascriptInterface
        fun stop() {
          Media.stop()
        }
      },
      "AnimoriMedia",
    )

    // Мост файлов. Своё окно выбора у WebView нет: <input type="file"> молчит без
    // onShowFileChooser в ChromeClient, а <a download> молчит без DownloadListener.
    // Поэтому выбор и запись идут системными намерениями Storage Access Framework:
    // человек видит родной пикер, а мы получаем адрес документа.
    fileWebView = webView

    webView.addJavascriptInterface(
      object {
        /** Открывает пикер XML. Ответ приходит в window.__amFilesPicked({name, text} | null). */
        @JavascriptInterface
        fun pickXml() {
          val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
          intent.addCategory(Intent.CATEGORY_OPENABLE)
          intent.type = "*/*"
          intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            arrayOf("application/xml", "text/xml", "application/gzip", "application/octet-stream"),
          )
          startActivityForResult(intent, REQUEST_PICK_XML)
        }

        /** Записывает XML в документ, выбранный человеком. Ответ — имя файла или null в
         *  window.__amFilesSaved(name | null). */
        @JavascriptInterface
        fun saveXml(name: String, text: String) {
          val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
          intent.addCategory(Intent.CATEGORY_OPENABLE)
          intent.type = "application/xml"
          intent.putExtra(Intent.EXTRA_TITLE, name)
          savePayload = text
          startActivityForResult(intent, REQUEST_SAVE_XML)
        }
      },
      "AnimoriFiles",
    )
  }

  /**
   * Ответ системного пикера.
   *
   * SAF присылает адрес документа, а не файл: прочитать и записать можно только через
   * ContentResolver, и обезличенный путь вида content://… в разметку отдавать нельзя.
   * Чтение — в потоке: выгрузка списка уходит за мегабайт, а главный поток ей не место.
   */
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQUEST_PICK_XML) {
      val uri = if (resultCode == RESULT_OK) data?.data else null

      if (uri == null) {
        tellPicked(null, null)
      } else {
        Thread {
          val (name, text) = readDocument(uri)
          tellPicked(name, text)
        }.start()
      }
      return
    }

    if (requestCode == REQUEST_SAVE_XML) {
      val uri = if (resultCode == RESULT_OK) data?.data else null
      val payload = savePayload
      savePayload = null

      if (uri == null || payload == null) {
        tellSaved(null)
      } else {
        Thread { tellSaved(writeDocument(uri, payload)) }.start()
      }
      return
    }

    super.onActivityResult(requestCode, resultCode, data)
  }

  /**
   * Разворачивает кадр в маленькое окно.
   *
   * Прямоугольник кадра (sourceRectHint) говорит системе, какую часть экрана показывать — без
   * него в PiP уезжает весь экран целиком. Пропорция держит форму кадра. Выход из PiP делает
   * сама система (кнопка разворота или закрытия), наша работа — вернуть портрет и погасить флаг.
   */
  private fun enterPipNow(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    val rect = pipRect ?: return false
    if (rect.width() <= 0 || rect.height() <= 0) return false

    return try {
      val params =
        PictureInPictureParams.Builder()
          .setSourceRectHint(rect)
          .setAspectRatio(Rational(pipAspectW, pipAspectH))
          .build()
      enterPictureInPictureMode(params)
      true
    } catch (ex: Exception) {
      Log.e("AniMori", "PiP не открылся: ${ex.message}")
      false
    }
  }

  /**
   * Сворачивание приложения (Home, недавние) во время игры.
   *
   * Это ровно тот случай «свернул — всплыл PiP»: onUserLeaveHint зовут только на уходе человека,
   * а не на системных событиях вроде звонка. Кадр уезжает сам, если игра идёт и прямоугольник
   * уже мерился; в остальных случаях сворачивание обычное.
   */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (pipPlaying && !isInPictureInPictureMode) {
      enterPipNow()
    }
  }

  /**
   * Вход и выход из PiP. Страница узнаёт о смене режима и подтягивает вид: в маленьком окне
   * панель не нужна, а на выходе она возвращается.
   */
  override fun onPictureInPictureModeChanged(isIn: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isIn, newConfig)
    fileWebView?.evaluateJavascript("window.__amPipChanged && window.__amPipChanged($isIn)", null)
  }

  /**
   * PiP и «только звук» — пауза для обычного кода, но не для кадра: и маленькое окно, и звук
   * из-под закрытого окна продолжают показывать видео, и WebView нельзя усыплять. WryActivity.onPause
   * ставит движок на паузу — здесь мы возвращаем ему бодрость, пока кадр играет. Выход из PiP шлёт
   * обычный onResume от оболочки.
   */
  override fun onPause() {
    super.onPause()
    if (isInPictureInPictureMode || pipPlaying) {
      fileWebView?.onResume()
    }
  }

  override fun onDestroy() {
    fileWebView?.let { Media.detach(it) }
    Media.stop()
    super.onDestroy()
  }

  /** Имя документа у человека на виду: провайдер может переименовать или добавить расширение. */
  private fun documentName(uri: android.net.Uri): String {
    contentResolver
      .query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
      ?.use { cursor ->
        if (cursor.moveToFirst()) {
          val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
          if (index >= 0) return cursor.getString(index) ?: "animelist.xml"
        }
      }

    return uri.lastPathSegment ?: "animelist.xml"
  }

  /** Читает документ текстом; gzip распаковывается по подписи 1F 8B, а не по имени:
   *  MyAnimeList отдаёт animelist.xml.gz, но переименовать файл можно как угодно. */
  private fun readDocument(uri: android.net.Uri): Pair<String, String?> {
    return try {
      val raw = contentResolver.openInputStream(uri)?.use { it.readBytes() }
      if (raw == null) return documentName(uri) to null

      val text =
        if (raw.size > 2 && raw[0] == 0x1F.toByte() && raw[1] == 0x8B.toByte()) {
          java.util.zip.GZIPInputStream(java.io.ByteArrayInputStream(raw))
            .use { it.readBytes() }
            .decodeToString()
        } else {
          raw.decodeToString()
        }

      documentName(uri) to text
    } catch (ex: Exception) {
      Log.e("AniMori", "документ не прочитался: ${ex.message}")
      documentName(uri) to null
    }
  }

  /** Пишет текст в созданный документ. Имя возвращается от провайдера: система могла
   *  переименовать файл или добавить расширение, и человеку говорят именно его. */
  private fun writeDocument(uri: android.net.Uri, text: String): String? {
    return try {
      contentResolver.openOutputStream(uri, "wt")?.use { stream ->
        stream.write(text.toByteArray(Charsets.UTF_8))
      }
      documentName(uri)
    } catch (ex: Exception) {
      Log.e("AniMori", "выгрузка не записалась: ${ex.message}")
      null
    }
  }

  /** Отдаёт выбор в страницу. Имя и текст едут раздельными аргументами: JSON из сырых
   *  строк собирать нельзя — кавычки и переводы строк поломали бы вызов. */
  private fun tellPicked(name: String?, text: String?) {
    val payload =
      if (name === null || text === null) "null"
      else "{\"name\":${JSONObject.quote(name)},\"text\":${JSONObject.quote(text)}}"

    runOnUiThread {
      fileWebView?.evaluateJavascript("window.__amFilesPicked && window.__amFilesPicked($payload)", null)
    }
  }

  /** Отдаёт имя записанного файла в страницу; null — отказ или отмена. */
  private fun tellSaved(name: String?) {
    val payload = if (name === null) "null" else JSONObject.quote(name)

    runOnUiThread {
      fileWebView?.evaluateJavascript("window.__amFilesSaved && window.__amFilesSaved($payload)", null)
    }
  }

  /**
   * Право ставить пакеты из неизвестных источников.
   *
   * С Android 8 его даёт человек, один раз и только в настройках: без него
   * намерение установки уходит в никуда. Проверка до скачивания — иначе
   * человек сначала ждёт файл, а потом узнаёт, что ставить нельзя.
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
