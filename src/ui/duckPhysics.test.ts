import { describe, expect, it } from 'vitest'
import { H, MARGIN, W, duckTarget, lineAt, newDuck, slopeAt, splash, stepDrops, stepDuck } from './duckPhysics'

const calm = { shake: 0, poke: false, rand: () => 0.5 }
const run = (d: ReturnType<typeof newDuck>, seconds: number, input: Partial<Parameters<typeof stepDuck>[2]> & { target: number }) => {
  let hit = 0
  for (let t = 0; t < seconds; t += 1 / 60) hit = Math.max(hit, stepDuck(d, 1 / 60, { ...calm, ...input }))
  return hit
}

describe('the duck: where it wants to be', () => {
  it('floats in the middle of calm, level water, paddling a little', () => {
    expect(duckTarget(0, 0, true)).toBe(W / 2)
    expect(Math.abs(duckTarget(0, 3, true) - W / 2)).toBeLessThan(W * 0.05)
  })

  it('goes to the right end of the water when the phone is rolled right-side down, and to the left when rolled left', () => {
    // The water leans against the roll, so its lean is negative for a roll to the right.
    expect(duckTarget(-0.4, 0, true)).toBeGreaterThan(W / 2 + 40)
    expect(duckTarget(0.4, 0, true)).toBeLessThan(W / 2 - 40)
  })

  it('never goes past either end', () => {
    expect(duckTarget(-5, 0, true)).toBe(W - MARGIN)
    expect(duckTarget(5, 0, true)).toBe(MARGIN)
  })

  it('paddles about by itself, further, when there is no sensor', () => {
    const swing = (live: boolean) => Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((s) => Math.abs(duckTarget(0, s, live) - W / 2)))
    expect(swing(false)).toBeGreaterThan(swing(true) * 3)
  })
})

describe('the duck: moving', () => {
  it('slides to where the water has carried it and settles there', () => {
    const d = newDuck()
    run(d, 4, { target: 250 })
    expect(d.x).toBeCloseTo(250, 0)
    expect(Math.abs(d.vx)).toBeLessThan(1)
  })

  it('turns to face the way it is going, narrowing as it turns', () => {
    const d = newDuck()
    run(d, 0.1, { target: 40 })
    expect(d.dir).toBe(-1)
    expect(d.face).toBeLessThan(1)
    run(d, 2, { target: 40 })
    expect(d.face).toBeCloseTo(-1, 1)
  })

  it('stops at the end of the pond instead of going through it', () => {
    const d = newDuck()
    d.vx = 2000
    run(d, 1, { target: W + 500 })
    expect(d.x).toBeLessThanOrEqual(W - MARGIN)
  })
})

describe('the duck: hopping', () => {
  it('stays on the water when the phone is calm', () => {
    const d = newDuck()
    run(d, 1, { target: W / 2 })
    expect(d.hy).toBe(0)
  })

  it('hops when the phone is shaken, higher the harder, and lands with a speed', () => {
    const peak = (shake: number) => {
      const d = newDuck()
      let top = 0
      let hit = 0
      for (let t = 0; t < 1; t += 1 / 60) {
        hit = Math.max(hit, stepDuck(d, 1 / 60, { target: W / 2, shake: t < 1 / 30 ? shake : 0, poke: false, rand: () => 0.5 }))
        top = Math.max(top, d.hy)
      }
      return { top, hit }
    }
    const soft = peak(0.4)
    const hard = peak(1)
    expect(soft.top).toBeGreaterThan(8)
    expect(hard.top).toBeGreaterThan(soft.top)
    expect(hard.hit).toBeGreaterThan(100)
  })

  it('hops when the pond is tapped, once per tap', () => {
    const d = newDuck()
    stepDuck(d, 1 / 60, { ...calm, target: W / 2, poke: true })
    expect(d.hv).toBeGreaterThan(0)
    const hit = run(d, 1, { target: W / 2 })
    expect(hit).toBeGreaterThan(60)
    expect(d.hy).toBe(0)
  })

  it('does not hop again in the air, and comes down in the end', () => {
    const d = newDuck()
    d.hy = 30
    run(d, 2, { target: W / 2, shake: 1 })
    expect(d.hy).toBeGreaterThanOrEqual(0)
  })

  it('drops in from above when it is put high', () => {
    const d = newDuck()
    d.hy = 52
    expect(run(d, 1, { target: W / 2 })).toBeGreaterThan(250)
    expect(d.hy).toBe(0)
  })
})

describe('the splash', () => {
  it('throws more drops for a harder landing, and they rise, fall and fade away', () => {
    const rand = () => 0.5
    expect(splash(100, 40, 300, rand).length).toBeGreaterThan(splash(100, 40, 80, rand).length)
    let drops = splash(100, 40, 300, rand)
    expect(drops.every((p) => p.vy < 0 && p.life === 1)).toBe(true)
    for (let t = 0; t < 2; t += 1 / 60) drops = stepDrops(drops, 1 / 60)
    expect(drops).toHaveLength(0)
  })
})

describe('reading the surface under the duck', () => {
  const ys = Array.from({ length: 25 }, (_, i) => 20 + i * 2)

  it('finds the height between two points', () => {
    expect(lineAt(ys, 0)).toBe(20)
    expect(lineAt(ys, W)).toBe(68)
    expect(lineAt(ys, W / 2)).toBeCloseTo(44, 5)
    expect(lineAt(ys, -50)).toBe(20)
  })

  it('tilts the duck along a sloping surface, and not at all along a level one', () => {
    expect(slopeAt(ys, W / 2)).toBeGreaterThan(5)
    expect(slopeAt(ys.map(() => 40), W / 2)).toBeCloseTo(0, 5)
    expect(slopeAt(ys.map((y) => H - y), W / 2)).toBeLessThan(-5)
    expect(slopeAt(ys.map((y) => y * 40), W / 2)).toBe(28)
  })
})
