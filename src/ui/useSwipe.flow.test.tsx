// @vitest-environment jsdom
import '../test/dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSwipe } from './useSwipe'

function Pad({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
  const swipe = useSwipe({ onLeft, onRight })
  return <div data-testid="pad" {...swipe} />
}

/** A touch (or pen, or mouse) pointer event with the fields the hook reads. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, pointerType = 'touch') {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  return e
}

/** Puts a finger down at (0, 0), moves it to (dx, dy) in a few steps, and lifts it. */
function drag(dx: number, dy: number, pointerType = 'touch') {
  const pad = screen.getByTestId('pad')
  fireEvent(pad, pointer('pointerdown', 0, 0, pointerType))
  for (const f of [0.25, 0.5, 0.75, 1]) fireEvent(pad, pointer('pointermove', dx * f, dy * f, pointerType))
  fireEvent(pad, pointer('pointerup', dx, dy, pointerType))
}

const setup = () => {
  const onLeft = vi.fn()
  const onRight = vi.fn()
  render(<Pad onLeft={onLeft} onRight={onRight} />)
  return { onLeft, onRight }
}

describe('useSwipe', () => {
  it('calls onRight for a swipe to the right, and onLeft for one to the left', () => {
    const { onLeft, onRight } = setup()
    drag(90, 4)
    expect(onRight).toHaveBeenCalledOnce()
    expect(onLeft).not.toHaveBeenCalled()
    drag(-90, -4)
    expect(onLeft).toHaveBeenCalledOnce()
    expect(onRight).toHaveBeenCalledOnce()
  })

  it('ignores a short movement, such as a tap or a slip of the finger', () => {
    const { onLeft, onRight } = setup()
    drag(20, 0)
    drag(-30, 2)
    drag(0, 0)
    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()
  })

  it('ignores a swipe that is mostly up or down, which is the page scrolling', () => {
    const { onLeft, onRight } = setup()
    drag(40, 120)
    drag(-60, -90)
    drag(10, 200)
    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()
  })

  it('accepts a swipe that is a bit off the horizontal, as thumbs are', () => {
    const { onRight } = setup()
    drag(100, 45)
    expect(onRight).toHaveBeenCalledOnce()
  })

  it('ignores a mouse dragging, so selecting text on a computer is left alone', () => {
    const { onLeft, onRight } = setup()
    drag(120, 0, 'mouse')
    drag(-120, 0, 'mouse')
    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()
  })

  it('does nothing when the browser takes the gesture over (a cancel), even if it went far', () => {
    const { onLeft, onRight } = setup()
    const pad = screen.getByTestId('pad')
    fireEvent(pad, pointer('pointerdown', 0, 0))
    fireEvent(pad, pointer('pointermove', 90, 0))
    fireEvent(pad, pointer('pointercancel', 90, 0))
    fireEvent(pad, pointer('pointerup', 90, 0))
    expect(onRight).not.toHaveBeenCalled()
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('counts one swipe once, however many moves it had', () => {
    const { onRight } = setup()
    const pad = screen.getByTestId('pad')
    fireEvent(pad, pointer('pointerdown', 0, 0))
    for (let i = 1; i <= 20; i++) fireEvent(pad, pointer('pointermove', i * 8, 0))
    fireEvent(pad, pointer('pointerup', 160, 0))
    fireEvent(pad, pointer('pointerup', 160, 0)) // a stray second lift
    expect(onRight).toHaveBeenCalledOnce()
  })

  it('does not act on a lift that had no matching touch down', () => {
    const { onLeft, onRight } = setup()
    fireEvent(screen.getByTestId('pad'), pointer('pointerup', 300, 0))
    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()
  })

  it('forgets a movement that turned vertical part-way, even if it ended far to the side', () => {
    const { onRight } = setup()
    const pad = screen.getByTestId('pad')
    fireEvent(pad, pointer('pointerdown', 0, 0))
    fireEvent(pad, pointer('pointermove', 5, 60)) // clearly a scroll
    fireEvent(pad, pointer('pointermove', 120, 70))
    fireEvent(pad, pointer('pointerup', 120, 70))
    expect(onRight).not.toHaveBeenCalled()
  })
})
