/**
 * Gold coins in a box, with the physics of coins: each is a disc with a mass, a spin and a size, pulled by gravity (which the phone's
 * tilt turns about), knocked by the others and by the walls, slowed by friction where it touches, and set spinning by that same
 * friction, so one that rolls along the floor turns exactly as fast as it travels. Nothing is faked: the same few equations (impulses
 * at each contact, the way a game's physics engine does it) give a pile that settles, a heap that slides when the phone is tipped, and a
 * scatter when it is shaken. Pure numbers in, numbers out, so it is easy to test and does not touch the page.
 *
 * Units are those of the picture the coins are drawn in (about a pixel), y grows downward, and the spin is clockwise-positive, which is
 * the way an SVG rotates.
 */

export interface Coin {
  x: number
  y: number
  vx: number
  vy: number
  /** Radius. */
  r: number
  /** Angle turned, in radians. */
  a: number
  /** Spin, in radians a second. */
  w: number
  /** When the coin joins in, in seconds after the pour starts; before that it is not there. */
  at: number
  /** Whether it has come down inside the box, once: the lid of the box only keeps in what is already in. */
  inside: boolean
}

export interface Box {
  left: number
  right: number
  /** The ceiling; coins poured in from above pass through it on their way in and are kept in by it after. */
  top: number
  floor: number
}

export interface CoinWorld {
  coins: Coin[]
  box: Box
  /** Seconds since the pour began. */
  time: number
  rand: () => number
}

/** A figure's worth of gravity in these units: 9.8 m/s² with a coin about 2 cm across (r = 8.5 units) is close to 900. */
export const GRAVITY = 880
/** How many of these units one metre a second squared of the phone being pushed is worth, as the box's own push on its coins. */
export const PUSH_SCALE = GRAVITY / 9.8

const RESTITUTION = 0.38
const FRICTION = 0.5
/** Below this speed into a surface a coin does not bounce at all, so a pile can come to rest instead of trembling forever. */
const BOUNCE_FLOOR = 40
const SUBSTEPS = 5
const PASSES = 3
const MAX_SPEED = 1400
/** A little of the speed lost to the air and to the coins' own softness each second. */
const DRAG = 0.35
const MAX_SPIN = 120

/** A small deterministic random number generator, so a pour is the same pour each time. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const coinRadius = (u: number) => 7.4 + u * 2.4

/**
 * `count` coins poured in from above the box, one after another, each with its own size and a little of its own sideways drift and
 * spin. None starts overlapping another.
 */
export function pour(count: number, box: Box, seed = 7): CoinWorld {
  const rand = seeded(seed)
  // The size of each coin is its own, and the same pour to pour, so the picture can be drawn before the coins are poured.
  const sizes = seeded(3)
  const width = box.right - box.left
  const biggest = 9.8
  // As many columns as fit side by side, each wide enough for the biggest coin, so nothing begins inside another.
  const columns = Math.max(1, Math.floor(width / (2 * biggest + 0.5)))
  const cell = width / columns
  const coins: Coin[] = []
  let order: number[] = []
  for (let i = 0; i < count; i++) {
    if (i % columns === 0) {
      // A new row of the column, in a new order.
      order = Array.from({ length: columns }, (_, k) => k)
      for (let k = order.length - 1; k > 0; k--) {
        const j = Math.floor(rand() * (k + 1))
        ;[order[k], order[j]] = [order[j], order[k]]
      }
    }
    const row = Math.floor(i / columns)
    const r = coinRadius(sizes())
    const x = box.left + cell * (order[i % columns] + 0.5)
    const y = box.top - 26 - row * 22
    coins.push({ x, y, vx: (rand() - 0.5) * 50, vy: 40 + rand() * 60, r, a: rand() * Math.PI * 2, w: (rand() - 0.5) * 8, at: i * 0.05, inside: false })
  }
  // The pour starts a moment before the first coin, which is the time it takes the lid to lift.
  return { coins, box, time: -0.4, rand }
}

/** The radii of the coins a pour of this many has, in order. */
export const radii = (count: number): number[] => {
  const sizes = seeded(3)
  return Array.from({ length: count }, () => coinRadius(sizes()))
}

/** One surface the coin is touching: the way it faces (a unit vector pointing from the surface into the box), and how far in it is. */
function contact(c: Coin, nx: number, ny: number, depth: number) {
  c.x += nx * depth
  c.y += ny * depth
  const vn = c.vx * nx + c.vy * ny
  const tx = -ny
  const ty = nx
  let jn = 0
  if (vn < 0) {
    const e = -vn < BOUNCE_FLOOR ? 0 : RESTITUTION
    jn = -(1 + e) * vn
    c.vx += jn * nx
    c.vy += jn * ny
  }
  // Friction at the point of contact, which is where the disc touches: it slows the slide and sets the coin turning.
  // The contact point of the disc moves at v - w*r*t along the surface; rolling is when that is nothing.
  const slip = c.vx * tx + c.vy * ty - c.w * c.r
  const limit = FRICTION * Math.max(jn, 12)
  // A disc's inertia is half m r², so a unit of impulse changes the slip by three.
  const jt = Math.max(-limit, Math.min(limit, -slip / 3))
  c.vx += jt * tx
  c.vy += jt * ty
  c.w -= (2 * jt) / c.r
}

/** Two coins that overlap are pushed apart, bounce a little and drag each other round where they touch. */
function collide(a: Coin, b: Coin) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const min = a.r + b.r
  const d2 = dx * dx + dy * dy
  if (d2 >= min * min) return
  const d = Math.sqrt(d2) || 0.0001
  const nx = d2 === 0 ? 0 : dx / d
  const ny = d2 === 0 ? -1 : dy / d
  // Each takes half of the overlap, so neither is favoured.
  const push = (min - d) / 2
  a.x -= nx * push
  a.y -= ny * push
  b.x += nx * push
  b.y += ny * push
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  let jn = 0
  if (vn < 0) {
    const e = -vn < BOUNCE_FLOOR ? 0 : RESTITUTION
    jn = (-(1 + e) * vn) / 2
    a.vx -= jn * nx
    a.vy -= jn * ny
    b.vx += jn * nx
    b.vy += jn * ny
  }
  const tx = -ny
  const ty = nx
  const slip = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty - b.w * b.r - a.w * a.r
  const limit = FRICTION * Math.max(jn, 6)
  // Two discs and their two inertias: a unit of impulse changes the slip by six.
  const jt = Math.max(-limit, Math.min(limit, -slip / 6))
  b.vx += jt * tx
  b.vy += jt * ty
  a.vx -= jt * tx
  a.vy -= jt * ty
  b.w -= (2 * jt) / b.r
  a.w -= (2 * jt) / a.r
}

export interface Pull {
  /** Gravity along the box, in units a second squared; positive to the right. */
  gx: number
  /** Gravity down the box; positive down. */
  gy: number
  /** 0 to 1: how hard the box is being shaken just now. */
  shake?: number
}

/** Moves the coins on by `dt` seconds. A long gap is taken as several short ones, so a slow frame cannot push a coin through another. */
export function step(world: CoinWorld, dt: number, pull: Pull) {
  const { coins, box, rand } = world
  const frame = Math.min(dt, 1 / 20)
  const h = frame / SUBSTEPS
  const shake = pull.shake ?? 0
  for (let s = 0; s < SUBSTEPS; s++) {
    world.time += h
    const live = coins.filter((c) => c.at <= world.time)
    for (const c of live) {
      // A shake is the box thrown about: every coin feels it, each a little differently.
      const ax = pull.gx + (shake > 0 ? (rand() * 2 - 1) * shake * 5200 : 0)
      const ay = pull.gy + (shake > 0 ? (rand() * 2 - 1) * shake * 4200 - shake * 1400 : 0)
      c.vx += ax * h
      c.vy += ay * h
      const drag = Math.max(0, 1 - DRAG * h)
      c.vx *= drag
      c.vy *= drag
      c.w *= Math.max(0, 1 - 0.25 * h)
      const speed = Math.hypot(c.vx, c.vy)
      if (speed > MAX_SPEED) {
        c.vx *= MAX_SPEED / speed
        c.vy *= MAX_SPEED / speed
      }
      c.w = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, c.w))
      c.x += c.vx * h
      c.y += c.vy * h
      c.a += c.w * h
      if (!c.inside && c.y - c.r > box.top) c.inside = true
    }
    for (let pass = 0; pass < PASSES; pass++) {
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) collide(live[i], live[j])
      for (const c of live) {
        if (c.x - c.r < box.left) contact(c, 1, 0, box.left - (c.x - c.r))
        if (c.x + c.r > box.right) contact(c, -1, 0, c.x + c.r - box.right)
        if (c.y + c.r > box.floor) contact(c, 0, -1, c.y + c.r - box.floor)
        if (c.inside && c.y - c.r < box.top) contact(c, 0, 1, box.top - (c.y - c.r))
      }
    }
  }
}

/** Runs the coins on until they have come to rest, or `seconds` have gone; for showing the pile without watching it fall. */
export function settle(world: CoinWorld, pull: Pull, seconds = 4) {
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    step(world, dt, pull)
    if (world.time > 1 && world.coins.every((c) => Math.hypot(c.vx, c.vy) < 6)) break
  }
}

/** The kinetic energy of the coins, for telling a pile at rest from one in motion. */
export const energy = (world: CoinWorld) => world.coins.reduce((a, c) => a + 0.5 * (c.vx * c.vx + c.vy * c.vy) + 0.25 * c.r * c.r * c.w * c.w, 0)

/** How far the coins overlap each other, the worst case, in units. */
export function worstOverlap(world: CoinWorld): number {
  let worst = 0
  const live = world.coins.filter((c) => c.at <= world.time)
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) worst = Math.max(worst, live[i].r + live[j].r - Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y))
  }
  return worst
}

/**
 * Which way the coins are pulled, from how the phone is held: gravity along the screen is what lies along the screen of the pull
 * of the earth, so rolled to the right the coins slide right, and tipped down they fall. `roll` and `beta` are in radians (the
 * roll is the sideways tilt, beta how far the phone is from lying flat), `push` is how hard the phone is being pushed to the right in
 * m/s², which the coins feel the other way, and `live` whether any sensor is sending. With no sensor they simply fall.
 */
export function pullFrom(tilt: { live: boolean; roll: number; pitch: number; push: number }): Pull {
  if (!tilt.live) return { gx: 0, gy: GRAVITY }
  const READING = (55 * Math.PI) / 180
  const beta = tilt.pitch + READING
  // Never so little that the coins hover when a phone is read lying back.
  const gy = GRAVITY * Math.max(0.3, Math.min(1, Math.sin(Math.max(0, beta)) * Math.cos(tilt.roll)))
  const gx = GRAVITY * Math.sin(tilt.roll) - tilt.push * PUSH_SCALE * 0.6
  return { gx, gy }
}
