/**
 * Whether this browser can show the app's widget. The only place a web app can define one is the Windows 11 Widgets Board,
 * with the app installed from Microsoft Edge. Android and iPhone do not let a web app add a home-screen widget at all, so
 * there is nothing to do there. The browser does not say which version of Windows it is on, so this is "Windows with Edge".
 */
export function widgetsSupported(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Windows NT/.test(ua) && /\bEdg\//.test(ua)
}
