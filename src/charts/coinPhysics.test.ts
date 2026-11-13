import { describe, expect, it } from 'vitest'
import { energy, GRAVITY, pour, pullFrom, seeded, settle, step, worstOverlap, type Box, type CoinWorld } from './coinPhysics'

const box: Box = { left: 0, right: 186, top: 0, floor: 68 }
const down = { gx: 0, gy: GRAVITY }
const run = (world: CoinWorld, seconds: number, pull = down) => {
  for (let t = 0; t < seconds; t += 1 / 60) step(world, 1 / 60, pull)
}
const inside = (world: CoinWorld, slack = 0.5) =>
  world.coins.every((c) => c.x - c.r >= box.left - slack && c.x + c.r <= box.right + slack && c.y + c.r <= box.floor + slack)
/** One coin alone on the floor, and nothing else, to see what it does by itself. */
const lone = (over: Partial<CoinWorld['coins'][0]> = {}): CoinWorld => ({
  box,
  time: 1,
  rand: seeded(1),
  coins: [{ x: 90, y: box.floor - 8, vx: 0, vy: 0, r: 8, a: 0, w: 0, at: 0, inside: true, ...over }],
})

describe('coins: a pour', () => {
  it('is the same pour each time, and no coin starts inside another', () => {
    const a = pour(26, box)
    const b = pour(26, box)
    expect(a.coins).toEqual(b.coins)
    expect(worstOverlap({ ...a, time: 99 })).toBeLessThanOrEqual(0)
    expect(pour(26, box, 8).coins).not.toEqual(a.coins)
  })

  it('brings the coins in one after another, not all at once', () => {
    const w = pour(26, box)
    const times = w.coins.map((c) => c.at)
    expect(times).toEqual([...times].sort((x, y) => x - y))
    expect(times[25]).toBeGreaterThan(times[0] + 1)
  })

  it('has every coin come down into the box and stay in it, settling into a pile at rest', () => {
    const w = pour(26, box)
    settle(w, down, 6)
    expect(inside(w)).toBe(true)
    expect(energy(w)).toBeLessThan(200)
    // Nothing is left sunk into another coin.
    expect(worstOverlap(w)).toBeLessThan(2)
    // And it is a pile: the coins lie on the floor and on each other, not hovering.
    const lowest = Math.max(...w.coins.map((c) => c.y + c.r))
    expect(lowest).toBeGreaterThan(box.floor - 1.5)
    // The ceiling keeps them in once they are inside it.
    expect(w.coins.every((c) => c.y - c.r >= box.top - 0.5)).toBe(true)
  })
})

describe('coins: real physics', () => {
  it('falls with gravity: a coin dropped from rest has gone about half g t² in a short time', () => {
    const w = lone({ y: 10, inside: true })
    run(w, 0.2)
    // Close to 0.5 * 880 * 0.04 = 17.6, less the drag.
    expect(w.coins[0].y - 10).toBeGreaterThan(14)
    expect(w.coins[0].y - 10).toBeLessThan(22)
  })

  it('bounces off the floor, and less high each time', () => {
    const w = lone({ y: 14, inside: true })
    const apexes: number[] = []
    let before = 0
    for (let t = 0; t < 3; t += 1 / 120) {
      step(w, 1 / 120, down)
      const c = w.coins[0]
      // The top of a bounce: it was going up and now is not.
      if (before < 0 && c.vy >= 0) apexes.push(box.floor - (c.y + c.r))
      before = c.vy
    }
    expect(apexes.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < apexes.length; i++) expect(apexes[i]).toBeLessThan(apexes[i - 1])
    expect(apexes[0]).toBeGreaterThan(2)
  })

  it('rolls: a coin set moving along the floor ends up turning exactly as fast as it travels (w r = v)', () => {
    const w = lone({ vx: 160 })
    run(w, 0.25)
    const c = w.coins[0]
    expect(c.vx).toBeGreaterThan(40)
    expect(c.w * c.r).toBeCloseTo(c.vx, -1)
    // And it has turned: its face has moved round as it went.
    expect(c.a).toBeGreaterThan(1)
  })

  it('turns the way it travels: clockwise going right and anticlockwise going left', () => {
    const right = lone({ vx: 150 })
    const left = lone({ vx: -150 })
    run(right, 0.3)
    run(left, 0.3)
    expect(right.coins[0].w).toBeGreaterThan(0)
    expect(left.coins[0].w).toBeLessThan(0)
  })

  it('slows a rolling coin, and stops it, rather than rolling for ever', () => {
    const w = lone({ vx: 200 })
    run(w, 6)
    expect(Math.abs(w.coins[0].vx)).toBeLessThan(5)
  })

  it('slides the heap to the lower side when the phone is tipped, and back again when it is tipped the other way', () => {
    const w = pour(26, box)
    settle(w, down, 6)
    const mean = () => w.coins.reduce((a, c) => a + c.x, 0) / w.coins.length
    const level = mean()
    run(w, 3, { gx: GRAVITY * 0.8, gy: GRAVITY * 0.6 })
    const right = mean()
    expect(right).toBeGreaterThan(level + 20)
    expect(inside(w)).toBe(true)
    run(w, 4, { gx: -GRAVITY * 0.8, gy: GRAVITY * 0.6 })
    expect(mean()).toBeLessThan(right - 40)
    expect(inside(w)).toBe(true)
  })

  it('scatters when shaken, and settles again after', () => {
    const w = pour(26, box)
    settle(w, down, 6)
    const rest = energy(w)
    for (let t = 0; t < 0.4; t += 1 / 60) step(w, 1 / 60, { ...down, shake: 1 })
    expect(energy(w)).toBeGreaterThan(rest + 2000)
    expect(inside(w)).toBe(true)
    run(w, 6)
    expect(energy(w)).toBeLessThan(300)
  })

  it('never lets a coin out of the box or through another, however slowly a frame comes or however hard it is thrown', () => {
    const w = pour(26, box)
    for (let i = 0; i < 400; i++) step(w, i % 7 === 0 ? 0.2 : 1 / 60, { gx: i % 2 ? 3000 : -3000, gy: GRAVITY, shake: 1 })
    expect(inside(w, 1)).toBe(true)
    expect(worstOverlap(w)).toBeLessThan(8)
    expect(w.coins.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.a))).toBe(true)
  })

  it('does not move the coins that are not in yet', () => {
    const w = pour(26, box)
    const last = w.coins[25]
    const [x, y] = [last.x, last.y]
    step(w, 1 / 60, down)
    expect([last.x, last.y]).toEqual([x, y])
  })
})

describe('coins: which way they are pulled', () => {
  const held = (over: Partial<{ live: boolean; roll: number; pitch: number; push: number }> = {}) => pullFrom({ live: true, roll: 0, pitch: 0, push: 0, ...over })

  it('falls straight down with no sensor', () => {
    expect(pullFrom({ live: false, roll: 1, pitch: 1, push: 9 })).toEqual({ gx: 0, gy: GRAVITY })
  })

  it('pulls right when the phone is rolled with its right side down, and left the other way', () => {
    expect(held({ roll: 0.5 }).gx).toBeGreaterThan(300)
    expect(held({ roll: -0.5 }).gx).toBeLessThan(-300)
    expect(held().gx).toBeCloseTo(0, 5)
  })

  it('pulls less down the screen the flatter the phone lies, but never so little that the coins hover', () => {
    const upright = held({ pitch: (35 * Math.PI) / 180 }).gy
    const reading = held().gy
    const flat = held({ pitch: (-55 * Math.PI) / 180 }).gy
    expect(upright).toBeGreaterThan(reading)
    expect(reading).toBeGreaterThan(flat)
    expect(flat).toBeGreaterThanOrEqual(GRAVITY * 0.3 - 1e-6)
  })

  it('has a push to the right throw the coins the other way', () => {
    expect(held({ push: 6 }).gx).toBeLessThan(-100)
  })
})
