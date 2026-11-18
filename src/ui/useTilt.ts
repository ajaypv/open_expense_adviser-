/**
 * How the phone is held, for the water in today's bar and the treasure chest in Insights: how far it is rolled to the side and
 * tipped forward or back (the gyroscope), and how hard it is being pushed along its width and shaken (the accelerometer). One shared
 * reading, read by whatever is drawing; the sensors are listened to only while something is watching.
 *
 * iPhones only give these out once the person has said yes, and only when asked from a tap, so the first tap anywhere asks. Android's
 * browser and web views give them out freely. Where there is no sensor (a computer) the reading stays at rest and `live` stays false.
 */
export interface Tilt {
  /** Sensors are sending readings. */
  live: boolean
  /** How far the phone is rolled, in radians, positive when its right side is down. */
  roll: number
  /** How far the phone is tipped, in radians, from the way it is usually held to read (about 55° up from flat); positive when its top is leaned away. */
  pitch: number
  /** Push along the phone's width, in m/s², smoothed; positive to the right. */
  push: number
  /** Push down the screen, in m/s², smoothed; positive toward its bottom edge. */
  heave: number
  /** How hard the phone is being moved in any direction, in m/s², smoothed: a few when it is carried, a dozen or more when it is shaken. */
  jolt: number
  /** When the accelerometer last reported (the page clock, in ms), so a reading that has gone stale is not taken for a phone still being shaken. */
  movedAt: number
}

/** How a phone is held to read it: tipped back about this far from lying flat. Level with this is no tilt forward or back. */
const READING_ANGLE = 55

export const tilt: Tilt = { live: false, roll: 0, pitch: 0, push: 0, heave: 0, jolt: 0, movedAt: 0 }

let watchers = 0
let lastRead: number | null = null
let lastMotion: number | null = null
let angle = 0
let targetRoll = 0
let targetPitch = 0
let orientation: { beta: number; gamma: number } | null = null
interface Vector { x: number; y: number; z: number }
let gravity: Vector | null = null

const radians = (degrees: number) => degrees * Math.PI / 180
const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n))
const decay = (now: number) => Math.exp(-Math.max(0, now - tilt.movedAt - 100) / 160)
const screenAngle = () => {
  const degrees = typeof screen !== 'undefined' ? screen.orientation?.angle : undefined
  const legacy = typeof window !== 'undefined' ? window.orientation : undefined
  return radians(finite(degrees) ? degrees : finite(legacy) ? legacy : 0)
}

function resetMotion() {
  tilt.push = 0
  tilt.heave = 0
  tilt.jolt = 0
  tilt.movedAt = 0
  lastMotion = null
  gravity = null
}

function reset() {
  resetMotion()
  tilt.live = false
  tilt.roll = targetRoll = 0
  tilt.pitch = targetPitch = 0
  orientation = null
  lastRead = null
}

function projectOrientation() {
  if (!orientation) return
  const { beta, gamma } = orientation
  // Project earth's down vector through the orientation API's Z-X-Y rotation, then into screen axes.
  const x = Math.cos(beta) * Math.sin(gamma)
  const y = Math.sin(beta)
  const z = Math.cos(beta) * Math.cos(gamma)
  const right = x * Math.cos(angle) + y * Math.sin(angle)
  const down = y * Math.cos(angle) - x * Math.sin(angle)
  targetRoll = Math.hypot(right, z) > 0.001 ? Math.atan2(right, z) : 0
  targetPitch = Math.asin(clamp(down, 1)) - radians(READING_ANGLE)
}

function syncScreen() {
  const next = screenAngle()
  if (next !== angle) {
    angle = next
    resetMotion()
    projectOrientation()
  }
}

const onOrientation = (e: DeviceOrientationEvent) => {
  if (document.hidden || !finite(e.gamma) || !finite(e.beta)) return
  syncScreen()
  const first = orientation === null
  orientation = { beta: radians(e.beta), gamma: radians(e.gamma) }
  projectOrientation()
  if (first) {
    tilt.roll = targetRoll
    tilt.pitch = targetPitch
    lastRead = performance.now()
  }
  tilt.live = true
}

const vector = (a: DeviceMotionEventAcceleration | null | undefined): Vector | null =>
  a && finite(a.x) && finite(a.y ?? 0) && finite(a.z ?? 0) ? { x: a.x, y: a.y ?? 0, z: a.z ?? 0 } : null

const onMotion = (e: DeviceMotionEvent) => {
  if (document.hidden) return
  syncScreen()
  let a = vector(e.acceleration)
  const includingGravity = a ? null : vector(e.accelerationIncludingGravity)
  if (!a && !includingGravity) return
  const now = performance.now()
  const dt = lastMotion === null ? 1 / 60 : Math.min(0.1, Math.max(0, (now - lastMotion) / 1000))
  if (!a && includingGravity) {
    // A slow gravity estimate supplies a high-pass fallback on browsers without linear acceleration.
    gravity ??= { ...includingGravity }
    const ease = 1 - Math.exp(-dt / 0.45)
    gravity.x += (includingGravity.x - gravity.x) * ease
    gravity.y += (includingGravity.y - gravity.y) * ease
    gravity.z += (includingGravity.z - gravity.z) * ease
    a = { x: includingGravity.x - gravity.x, y: includingGravity.y - gravity.y, z: includingGravity.z - gravity.z }
  }
  if (!a) return
  const x = clamp(a.x * Math.cos(angle) - a.y * Math.sin(angle), 35)
  const y = clamp(-a.x * Math.sin(angle) - a.y * Math.cos(angle), 35)
  const ease = 1 - Math.exp(-dt / 0.055)
  const fade = lastMotion === null ? 0 : decay(now)
  tilt.push *= fade
  tilt.heave *= fade
  tilt.jolt *= fade
  tilt.push += (x - tilt.push) * ease
  tilt.heave += (y - tilt.heave) * ease
  tilt.jolt += (Math.min(40, Math.hypot(a.x, a.y, a.z)) - tilt.jolt) * ease
  tilt.movedAt = now
  lastMotion = now
  tilt.live = true
}

/** One frame's smoothed orientation and fresh acceleration; multiple readers at the same time cannot speed up the filter. */
export function readTilt(now = performance.now()): Readonly<Tilt> {
  syncScreen()
  const dt = lastRead === null ? 0 : Math.min(0.1, Math.max(0, (now - lastRead) / 1000))
  lastRead = now
  const ease = 1 - Math.exp(-dt / 0.08)
  const turn = Math.atan2(Math.sin(targetRoll - tilt.roll), Math.cos(targetRoll - tilt.roll))
  tilt.roll += turn * ease
  tilt.pitch += (targetPitch - tilt.pitch) * ease
  const fade = decay(now)
  const quiet = (n: number) => Math.abs(n) < 0.08 ? 0 : n
  return { ...tilt, push: quiet(tilt.push * fade), heave: quiet(tilt.heave * fade), jolt: tilt.jolt * fade }
}

type Askable = { requestPermission?: () => Promise<'granted' | 'denied'> }
const sensorApis = () => [window.DeviceOrientationEvent, window.DeviceMotionEvent] as (Askable | undefined)[]

/** Asks an iPhone for the sensors, from inside a tap (a round trip before the call and Safari says no). Once; then it is out of the way. */
function ask() {
  window.removeEventListener('pointerup', ask)
  for (const api of sensorApis()) {
    api?.requestPermission?.().then((permission) => {
      if (permission !== 'granted') console.warn('Motion sensor permission was denied; automatic animation remains available.')
    }).catch((error: unknown) => console.warn('Could not enable motion sensors:', error))
  }
}

const onVisibility = () => {
  if (document.hidden) reset()
}

/** Start listening to the sensors for as long as the returned function has not been called. Safe to call from many places at once. */
export function watchTilt(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (watchers++ === 0) {
    angle = screenAngle()
    window.addEventListener('deviceorientation', onOrientation)
    window.addEventListener('devicemotion', onMotion)
    document.addEventListener('visibilitychange', onVisibility)
    if (sensorApis().some((api) => api?.requestPermission)) window.addEventListener('pointerup', ask)
  }
  let done = false
  return () => {
    if (done) return
    done = true
    if (--watchers === 0) {
      window.removeEventListener('deviceorientation', onOrientation)
      window.removeEventListener('devicemotion', onMotion)
      window.removeEventListener('pointerup', ask)
      document.removeEventListener('visibilitychange', onVisibility)
      reset()
    }
  }
}
