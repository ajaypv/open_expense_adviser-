/**
 * The duck on today's card when nothing has been spent yet, kept apart from the drawing so it can be tested. The pond is a fixed
 * picture, W by H, scaled to fit. The water is the same water as in today's bar (see waterSurface): its surface stays level against
 * the world as the phone is tilted, so it leans against the pond and runs to the low end. The duck floats on it, rides its waves, slides
 * to the low end, is thrown by a push, and is made to hop by a shake or a tap, landing with a splash.
 */
import { MAX_LEAN } from './waterSurface'

/** The size of the pond picture. */
export const W = 320
export const H = 112
/** How much water there is, as its depth when level. */
export const DEPTH = 40
/** How far the surface may lean in the pond, in radians: past it the water would reach the top, where the duck rides, and the duck would be out of the picture. */
export const POND_LEAN = 0.26

/** How far from either end the middle of the duck can come. */
export const MARGIN = 28

const GRAVITY = 900
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export interface Duck {
  /** Across the pond, where the middle of the duck is. */
  x: number
  vx: number
  /** How high it is above the water, and how fast it is rising. */
  hy: number
  hv: number
  /** 1 facing right, -1 facing left; it turns through 0, so it narrows as it turns. */
  face: number
  /** The way it is heading, for facing. */
  dir: 1 | -1
}

export const newDuck = (): Duck => ({ x: W / 2, vx: 0, hy: 0, hv: 0, face: 1, dir: 1 })

/** Where the duck wants to be: on the low end of the water as it leans, with a slow paddle about when the water is calm. */
export function duckTarget(lean: number, seconds: number, live: boolean): number {
  // A lean of the surface is positive when its right side is the lower one, so the water is piled on the left; negative, on the right.
  const slide = -clamp(lean, -MAX_LEAN, MAX_LEAN) * (W * 0.5)
  const paddle = Math.sin(seconds * 0.45) * W * (live ? 0.04 : 0.2)
  return clamp(W / 2 + slide + paddle, MARGIN, W - MARGIN)
}

export interface DuckInput {
  target: number
  /** 0 to 1, how hard the phone is being shaken just now. */
  shake: number
  /** The pond was tapped. */
  poke: boolean
  rand: () => number
}

/** The speed the duck hit the water at, when it landed on this step; 0 otherwise. */
export function stepDuck(d: Duck, dt: number, { target, shake, poke, rand }: DuckInput): number {
  dt = Math.min(dt, 0.05)
  const grounded = d.hy <= 0 && d.hv <= 0
  if (grounded && (shake > 0.25 || poke)) {
    d.hv = poke && shake <= 0.25 ? 190 : 150 + 150 * shake
    d.vx += (rand() - 0.5) * (poke ? 70 : 150 * shake)
  }
  // Left and right: a loose spring to where the water has carried it, with the water in the way at either end.
  d.vx += (30 * (target - d.x) - 9 * d.vx) * dt
  d.x += d.vx * dt
  if (d.x < MARGIN || d.x > W - MARGIN) {
    d.x = clamp(d.x, MARGIN, W - MARGIN)
    d.vx *= -0.4
  }
  if (Math.abs(d.vx) > 14) d.dir = d.vx > 0 ? 1 : -1
  d.face += (d.dir - d.face) * Math.min(1, dt * 9)
  // Up and down, only while it is in the air.
  let hit = 0
  if (d.hy > 0 || d.hv > 0) {
    d.hv -= GRAVITY * dt
    d.hy += d.hv * dt
    if (d.hy <= 0) {
      hit = -d.hv
      d.hy = 0
      d.hv = 0
    }
  }
  return hit
}

/** A drop of water thrown up by a landing. */
export interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  /** 1 when thrown, 0 when gone. */
  life: number
}

/** A handful of drops from where the duck came down, more and higher for a harder landing. */
export function splash(x: number, y: number, speed: number, rand: () => number): Drop[] {
  const n = clamp(Math.round(speed / 40), 2, 8)
  return Array.from({ length: n }, (_, i) => ({
    x: x + (rand() - 0.5) * 14,
    y,
    vx: (i % 2 ? 1 : -1) * (25 + rand() * 55),
    vy: -(70 + rand() * 90 + speed * 0.15),
    life: 1,
  }))
}

export function stepDrops(drops: Drop[], dt: number): Drop[] {
  const next: Drop[] = []
  for (const p of drops) {
    p.vy += 700 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt * 1.7
    if (p.life > 0) next.push(p)
  }
  return next
}

/** The height of a line made of `ys` points, evenly across the pond, at `x`, between its points. */
export function lineAt(ys: number[], x: number): number {
  const at = (clamp(x, 0, W) / W) * (ys.length - 1)
  const i = Math.min(Math.floor(at), ys.length - 2)
  const f = at - i
  return ys[i] * (1 - f) + ys[i + 1] * f
}

/** How steep the surface is under the duck, as the angle it is tilted by, in degrees, so it sits along the water. */
export function slopeAt(ys: number[], x: number): number {
  const span = 12
  return clamp((Math.atan2(lineAt(ys, x + span) - lineAt(ys, x - span), span * 2) * 180) / Math.PI, -28, 28)
}
