package com.foulnike.animori.mobile

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.webkit.WebView

/**
 * Медиа-слой: одна MediaSession на приложение, её PlaybackState даёт кнопки пуск/пауза
 * и смены серий в PiP-оверлее. Состояние и заголовок идут от страницы, обратно — команды.
 */
object Media {
  @Volatile private var session: MediaSessionCompat? = null
  @Volatile private var webView: WebView? = null

  @Volatile private var title = "Аниме"
  @Volatile private var positionMs = 0L
  @Volatile private var durationMs = 0L

  private val main = Handler(Looper.getMainLooper())

  /** Ставит страницу-источник звука: через неё уходят команды пуска и паузы. */
  fun attach(view: WebView) {
    webView = view
    ensureSession(view.context)
  }

  fun detach(view: WebView) {
    if (webView === view) webView = null
  }

  /** Страница сообщает, что пошло в ход: игра/пауза и позиция в миллисекундах. */
  fun reportState(context: Context, isPlaying: Boolean, position: Long, duration: Long) {
    positionMs = position.coerceAtLeast(0L)
    durationMs = duration.coerceAtLeast(0L)

    val sess = ensureSession(context)
    val state =
      if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    sess.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
            PlaybackStateCompat.ACTION_PAUSE or
            PlaybackStateCompat.ACTION_PLAY_PAUSE or
            PlaybackStateCompat.ACTION_SEEK_TO or
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT,
        )
        .setState(state, positionMs, if (isPlaying) 1f else 0f)
        .build(),
    )
  }
  /** Заголовок кадра — им красуются кнопки PiP. */
  fun reportTitle(context: Context, text: String) {
    if (text.isNotBlank()) title = text
    val sess = ensureSession(context)
    sess.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs)
        .build(),
    )
  }

  /** Переключает пуск/паузу. Зовётся из PiP — уходит в страницу. */
  fun toggle() {
    main.post {
      webView?.evaluateJavascript("window.__amMediaToggle && window.__amMediaToggle()", null)
    }
  }

  /** Смена серии кнопками |< >| PiP-оверлея — уходит в страницу. */
  private fun skip(next: Boolean) {
    main.post {
      val fn = if (next) "__amMediaNext" else "__amMediaPrev"
      webView?.evaluateJavascript("window.$fn && window.$fn()", null)
    }
  }

  /** Плеер размонтирован — сессия гаснет, кнопки PiP уходят. */
  fun stop() {
    session?.isActive = false
  }

  private fun ensureSession(context: Context): MediaSessionCompat {
    session?.let {
      if (!it.isActive) it.isActive = true
      return it
    }

    val sess = MediaSessionCompat(context.applicationContext, "animori")
    sess.setFlags(
      MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
        MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS,
    )
    sess.setCallback(
      object : MediaSessionCompat.Callback() {
        override fun onPlay() = toggle()

        override fun onPause() = toggle()

        override fun onSkipToPrevious() = skip(false)

        override fun onSkipToNext() = skip(true)
      },
    )
    sess.isActive = true
    session = sess
    return sess
  }
}