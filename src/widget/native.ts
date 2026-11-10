import { Capacitor, registerPlugin } from '@capacitor/core'
import type { WidgetData } from './data'

/** The part of the Android app that draws the home-screen widget (android/.../WidgetBridgePlugin.java). */
interface WidgetBridge {
  setSnapshot(data: WidgetData): Promise<void>
}

const bridge = registerPlugin<WidgetBridge>('WidgetBridge')

/** Whether this page is running inside the Android app, the one place a phone can have the app's widget. */
export function isAndroidApp(): boolean {
  try {
    return Capacitor.getPlatform() === 'android'
  } catch {
    return false
  }
}

/** Hands the widget its figures and has the home screen redraw it. Returns whether that worked; false anywhere but the Android app. */
export async function publishToAndroid(data: WidgetData): Promise<boolean> {
  if (!isAndroidApp()) return false
  try {
    await bridge.setSnapshot(data)
    return true
  } catch {
    return false
  }
}
