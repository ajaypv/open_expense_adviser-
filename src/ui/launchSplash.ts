const SESSION_KEY = 'launch-complete'

/** CSS owns the artwork and timing; this controller waits for real app readiness before revealing it. */
export function createLaunchSplash(element: HTMLDialogElement) {
  const styles = getComputedStyle(element)
  const duration = (name: string) => {
    const value = styles.getPropertyValue(name).trim()
    if (!/^(?:\d+|\d*\.\d+)m?s$/.test(value)) throw new Error(`Invalid splash timing ${name}: ${value}`)
    return parseFloat(value) * (value.endsWith('ms') ? 1 : 1000)
  }
  const intro = duration('--launch-intro')
  const expand = duration('--launch-expand')
  const dissolve = duration('--launch-dissolve')
  const brief = duration('--launch-short')
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let short = motion.matches
  try {
    short ||= sessionStorage.getItem(SESSION_KEY) === '1'
  } catch (error) {
    console.warn('Could not read splash session state:', error)
  }

  const startedAt = element.dataset.startedAt === undefined ? performance.now() : Number(element.dataset.startedAt)
  const elapsed = performance.now() - startedAt
  let revealed = elapsed >= intro
  let ready = false
  let done = false
  let timer: number | undefined
  const bloom = element.querySelector<HTMLElement>('.launch-bloom')!

  function resize() {
    // A small, cached gradient texture scales beyond the viewport diagonal, including landscape corners.
    const cover = Math.hypot(element.clientWidth, element.clientHeight) / bloom.offsetWidth + 0.1
    element.style.setProperty('--launch-cover', String(cover))
  }

  function schedule(callback: () => void, delay: number) {
    window.clearTimeout(timer)
    timer = window.setTimeout(callback, Math.max(0, delay))
  }

  function dismiss() {
    if (done) return
    done = true
    window.clearTimeout(timer)
    window.clearTimeout(stallTimer)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', visibility)
    motion.removeEventListener('change', motionChanged)
    element.removeEventListener('cancel', cancel)
    element.close()
    element.remove()
  }

  function finish() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch (error) {
      console.warn('Could not save splash session state:', error)
    }
    dismiss()
  }

  function fade(briefly = false) {
    short ||= briefly
    if (short) element.dataset.mode = 'short'
    element.dataset.phase = 'fade'
    schedule(finish, short ? brief : dissolve)
  }

  function advance() {
    if (!ready || done) return
    if (document.hidden) finish()
    else if (short) fade()
    else if (revealed) {
      element.dataset.phase = 'expand'
      schedule(() => fade(), expand)
    }
  }

  function visibility() {
    if (!document.hidden) return
    short = true
    element.dataset.mode = 'short'
    if (ready) finish()
  }

  function motionChanged() {
    if (!motion.matches) return
    short = true
    element.dataset.mode = 'short'
    if (ready) fade()
  }

  function cancel(event: Event) {
    event.preventDefault()
    if (ready) fade(true)
  }

  element.dataset.phase = 'reveal'
  element.dataset.mode = short ? 'short' : 'full'
  element.close()
  element.showModal()
  resize()
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', visibility)
  motion.addEventListener('change', motionChanged)
  element.addEventListener('cancel', cancel)
  if (!revealed) schedule(() => { revealed = true; advance() }, intro - elapsed)

  const stallTimer = window.setTimeout(() => {
    console.warn('The app is taking longer than expected to open; removing the launch overlay.')
    dismiss()
  }, 12_000)

  return {
    ready() {
      if (done || ready) return
      ready = true
      window.clearTimeout(stallTimer)
      // Onboarding uses a native modal too. Reopen synchronously above it, without replacing the artwork.
      element.close()
      element.showModal()
      advance()
    },
    dismiss,
  }
}
