import { Capacitor } from '@capacitor/core'

/** Whether this page is running inside the Android app (not in a browser), where phone features the browser lacks are available. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
