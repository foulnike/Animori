const ACTION = "button[type='button']:not([popovertarget], [commandfor])"
const UNAVAILABLE = ":disabled, [aria-disabled='true'], [inert]"
const ARTWORK =
  ':scope > :is(.am-tile__art, .am-face__frame, .am-row__art, .am-hist__art, .am-ps-work__art, .am-mate__art, .am-ps-va__art)'
const ACCENT = 'rgb(var(--am-accent-rgb) / 0.7)'
const FEEDBACK_MS = 120
const HOLD_MS = 450

export function startTapFeedback(): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pending = new WeakSet<HTMLElement>()
  let touchStartedAt = -Infinity

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isPrimary && event.pointerType === 'touch') touchStartedAt = event.timeStamp
    },
    { capture: true, passive: true },
  )

  document.addEventListener(
    'click',
    (event) => {
      if (
        !event.isTrusted ||
        event.pointerType !== 'touch' ||
        event.timeStamp - touchStartedAt >= HOLD_MS ||
        event.defaultPrevented ||
        reducedMotion.matches ||
        !(event.target instanceof Element)
      ) {
        return
      }

      const origin = event.target
      const action = origin.closest<HTMLButtonElement>(ACTION)
      if (!action || action.closest(UNAVAILABLE)) return

      event.stopImmediatePropagation()
      if (pending.has(action)) return
      pending.add(action)

      const artwork = action.querySelector(ARTWORK)
      const outline = { outlineWidth: '2px', outlineStyle: 'solid', outlineOffset: '-2px' }
      const rest = artwork ? { ...outline, outlineColor: 'transparent' } : {}
      const pressed = artwork
        ? { ...outline, outlineColor: ACCENT }
        : { boxShadow: `inset 0 0 0 2px ${ACCENT}` }

      const feedback = (artwork ?? action).animate(
        [
          { scale: '1', ...rest },
          { scale: '0.975', ...pressed, offset: 0.25 },
          { scale: '0.975', ...pressed, offset: 0.5 },
          { scale: '1', ...rest },
        ],
        { duration: FEEDBACK_MS, easing: 'ease-out' },
      )

      // Повторно доставляем событие исходному узлу, чтобы сохранить координаты, цель и всплытие.
      // Событие, отправленное из JS, уже не trusted и пройдёт этот обработчик без задержки.
      const deliver = () => {
        pending.delete(action)
        if (!action.isConnected || action.closest(UNAVAILABLE)) return
        const target = action.contains(origin) ? origin : action
        target.dispatchEvent(event)
      }
      void feedback.finished.then(deliver, deliver)
    },
    true,
  )
}
