import { isAndroidApp } from './native'

/**
 * Whether this page can show the app's widget. A web app can define one only in the Windows 11 Widgets Board, with the app
 * installed from Microsoft Edge (the browser does not say which version of Windows it is on, so this is "Windows with Edge").
 * Android and iPhone give a web app in a browser no home-screen widget at all, but inside the Android app (Capacitor) there is one.
 */
export function widgetsSupported(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return isAndroidApp() || (/Windows NT/.test(ua) && /\bEdg\//.test(ua))
}
