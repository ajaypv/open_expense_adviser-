import { Capacitor, registerPlugin } from '@capacitor/core'
import type { WidgetData } from './data'
import type { AndroidSpendingData } from './spendingArc'
import type { TimelineWidgetData } from './timelineData'

/** The part of the Android app that draws the home-screen widget (android/.../WidgetBridgePlugin.java). */
interface WidgetBridge {
  setSnapshot(data: WidgetData | AndroidSpendingData): Promise<void>
  /** The Timeline widget's days, as JSON text. */
  setTimeline(data: { json: string }): Promise<void>
  /** The page of the app a widget was touched to open, once; empty when the app was opened some other way. */
  takeLaunchView(): Promise<{ view: string }>
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
export async function publishToAndroid(data: WidgetData | AndroidSpendingData): Promise<boolean> {
  if (!isAndroidApp()) return false
  try {
    await bridge.setSnapshot(data)
    return true
  } catch {
    return false
  }
}

/** Hands the Timeline widget its days and has the home screen redraw it. Returns whether that worked; false anywhere but the Android app. */
export async function publishTimelineToAndroid(data: TimelineWidgetData): Promise<boolean> {
  if (!isAndroidApp()) return false
  try {
    await bridge.setTimeline({ json: JSON.stringify(data) })
    return true
  } catch {
    return false
  }
}

/** The page a widget was touched to open, if the app was just opened from one; asking clears it. Always null anywhere but the Android app. */
export async function takeLaunchView(): Promise<'timeline' | null> {
  if (!isAndroidApp()) return null
  try {
    const { view } = await bridge.takeLaunchView()
    return view === 'timeline' ? 'timeline' : null
  } catch {
    return null
  }
}
