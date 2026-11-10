import { App } from '@capacitor/app'
import { isNativeApp } from './platform'

/**
 * The phone's back button inside the Android app. The app closes sheets and panels by stepping back through the page's history
 * (see ui/backStack), so back has to do exactly that: step back when there is a step to take, and leave the app only when there is
 * not. Without this handler the app is closed by every press. Returns what stops listening. Does nothing in a browser.
 */
export function handleNativeBack(): () => void {
  if (!isNativeApp()) return () => {}
  let gone = false
  let stop: (() => Promise<void>) | undefined
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else void App.exitApp()
  }).then((handle) => {
    if (gone) void handle.remove()
    else stop = () => handle.remove()
  })
  return () => {
    gone = true
    void stop?.()
  }
}
