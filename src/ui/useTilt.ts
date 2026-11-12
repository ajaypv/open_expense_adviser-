/**
 * How the phone is held, for the water in today's bar: how far it is rolled to the side (the gyroscope), and how hard it is being
 * pushed along its width (the accelerometer). One shared reading, read by whatever is drawing; the sensors are listened to only while
 * something is watching.
 *
 * iPhones only give these out once the person has said yes, and only when asked from a tap, so the first tap anywhere asks. Android's
 * browser and web views give them out freely. Where there is no sensor (a computer) the reading stays at rest and `live` stays false.
 */
export interface Tilt {
  /** Sensors are sending readings. */
  live: boolean
  /** How far the phone is rolled, in radians, positive when its right side is down. */
  roll: number
  /** Push along the phone's width, in m/s², smoothed; positive to the right. */
  push: number
}

export const tilt: Tilt = { live: false, roll: 0, push: 0 }

let watchers = 0

const onOrientation = (e: DeviceOrientationEvent) => {
  if (e.gamma == null) return
  const turned = typeof screen !== 'undefined' ? screen.orientation?.angle ?? 0 : 0
  // Held on its side, the roll is the other axis; the bar is made for upright, so it is left level.
  if (turned === 90 || turned === 270) {
    tilt.live = true
    tilt.roll = 0
    return
  }
  tilt.live = true
  tilt.roll = ((turned === 180 ? -e.gamma : e.gamma) * Math.PI) / 180
}

const onMotion = (e: DeviceMotionEvent) => {
  const x = e.acceleration?.x
  if (x == null) return
  tilt.push = tilt.push * 0.6 + x * 0.4
}

type Askable = { requestPermission?: () => Promise<'granted' | 'denied'> }

/** Asks an iPhone for the sensors, from inside a tap (a round trip before the call and Safari says no). Once; then it is out of the way. */
function ask() {
  window.removeEventListener('pointerup', ask)
  for (const api of [window.DeviceOrientationEvent, window.DeviceMotionEvent] as unknown as (Askable | undefined)[]) {
    api?.requestPermission?.().catch(() => {})
  }
}

/** Start listening to the sensors for as long as the returned function has not been called. Safe to call from many places at once. */
export function watchTilt(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (watchers++ === 0) {
    window.addEventListener('deviceorientation', onOrientation)
    window.addEventListener('devicemotion', onMotion)
    if ((window.DeviceOrientationEvent as unknown as Askable | undefined)?.requestPermission) window.addEventListener('pointerup', ask)
  }
  let done = false
  return () => {
    if (done) return
    done = true
    if (--watchers === 0) {
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('devicemotion', onMotion)
      window.removeEventListener('pointerup', ask)
      tilt.live = false
      tilt.roll = 0
      tilt.push = 0
    }
  }
}
